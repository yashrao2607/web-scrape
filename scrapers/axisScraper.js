import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import { BaseScraper } from './baseScraper.js';
import { LayeredExtractor } from '../core/extractor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AxisScraper extends BaseScraper {
  async scrape(page) {
    this.logger.info("starting_axis_scrape");
    let rates = [];
    let isFallback = false;

    const tempPdf = path.join(os.tmpdir(), "axis_rates.pdf");

    // Resolve the PDF(s) to extract from.
    // If this.url is already a direct PDF link, use it as-is (backward compatible).
    // Otherwise this.url is the FD landing page, which links out to one or more
    // rate PDFs ("VIEW RATES" anchors) -- discover those links from the DOM.
    let candidatePdfs = [];
    if (this.url.toLowerCase().includes(".pdf")) {
      candidatePdfs = [this.url];
    } else {
      try {
        const hrefs = await page.$$eval("a[href]", anchors =>
          anchors.map(a => a.href).filter(Boolean)
        );
        const pdfLinks = [...new Set(hrefs.filter(h => /\.pdf(\?|$)/i.test(h)))];
        // Exclude non-resident / specialised products; keep the standard domestic retail FD.
        const exclude = /(nri|nre|nro|fcnr|plus|floating|bulk|rfc|recurring|loan)/i;
        const preferred = pdfLinks.filter(h =>
          /(domestic|fixed.?deposit|\bfd\b|interest.?rate)/i.test(h) && !exclude.test(h)
        );
        const fallbackLinks = pdfLinks.filter(h => !exclude.test(h));
        candidatePdfs = preferred.length ? preferred : fallbackLinks;
        this.logger.info("axis_discovered_pdf_links", {
          total: pdfLinks.length,
          chosen: candidatePdfs.slice(0, 5)
        });
      } catch (e) {
        this.logger.warn("axis_pdf_link_discovery_failed", { error: e.message });
      }
    }

    for (const pdfUrl of candidatePdfs) {
      try {
        const response = await page.context().request().get(pdfUrl);
        const body = await response.body();
        if (response.status() === 200 && body.includes(Buffer.from("%PDF"))) {
          fs.writeFileSync(tempPdf, body);
          this.logger.info("downloaded_axis_pdf", { url: pdfUrl, path: tempPdf });
          const extracted = await LayeredExtractor.extractFromPdf(tempPdf);
          if (extracted.length > 0) {
            rates = extracted;
            this.url = pdfUrl; // record the PDF actually used as the source URL
            break;
          }
          this.logger.warn("axis_pdf_yielded_no_rates", { url: pdfUrl });
        } else {
          this.logger.warn("axis_pdf_download_returned_invalid_content", {
            url: pdfUrl,
            status: response.status()
          });
        }
      } catch (e) {
        this.logger.error("axis_pdf_download_or_parse_failed", { url: pdfUrl, error: e.message });
      }
    }

    if (rates.length === 0) {
      this.logger.info("triggering_axis_local_html_fallback");
      isFallback = true;
      const fallbackPath = path.join(__dirname, "axis_fallback.html");
      try {
        const htmlContent = fs.readFileSync(fallbackPath, "utf-8");
        const $ = cheerio.load(htmlContent);
        const fallbackTables = [];

        $("table").each((idx, table) => {
          const matrix = [];
          $(table).find("tr").each((trIdx, tr) => {
            const row = [];
            $(tr).find("th, td").each((cellIdx, cell) => {
              row.push($(cell).text().trim());
            });
            if (row.length > 0) {
              matrix.push(row);
            }
          });

          if (matrix.length > 0) {
            let heading = "";
            let prev = $(table).prev();
            while (prev.length > 0) {
              const tagName = prev.prop("tagName");
              if (tagName && /^(H[1-6])$/i.test(tagName)) {
                heading = prev.text().trim();
                break;
              }
              const nestedHeading = prev.find("h1, h2, h3, h4, h5, h6").first();
              if (nestedHeading.length > 0) {
                heading = nestedHeading.text().trim();
                break;
              }
              prev = prev.prev();
            }

            const caption = $(table).find("caption").text().trim();

            fallbackTables.push({
              matrix: matrix,
              section_name: heading || "Axis Fallback Rates",
              table_name: caption || "Retail Fixed Deposit Rates"
            });
          }
        });

        for (const t of fallbackTables) {
          const parsed = LayeredExtractor.parseExtractedTable(t);
          if (parsed && parsed.length > 0) {
            rates.push(...parsed);
          }
        }
      } catch (fbErr) {
        this.logger.error("axis_local_html_fallback_failed", { error: fbErr.message });
      }
    }

    return {
      fd_rates: rates,
      minimum_deposit: 5000.0,
      maximum_deposit: 50000000.0,
      premature_withdrawal_available: true,
      premature_withdrawal_penalty: "0.50% to 1.00% depending on tenure",
      loan_against_fd_available: true,
      tax_saver_fd_available: true,
      tax_saver_tenure: "5 Years",
      nomination_available: true,
      compounding_frequency: "Quarterly",
      last_updated_on_page: null,
      effective_from: "2026-05-01",
      effective_to: null,
      is_fallback: isFallback,
      scraper_version: "1.0.0"
    };
  }
}
