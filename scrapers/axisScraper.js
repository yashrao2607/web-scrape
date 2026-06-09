import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import { BaseScraper } from './baseScraper.js';
import { LayeredExtractor } from '../core/extractor.js';
import { clickAndDownloadPdf } from '../core/browser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AxisScraper extends BaseScraper {
  async scrape(page) {
    let rates = [];
    let isFallback = false;
    let pdfCapturedUrl = null;
    let source = this.url;
    let scrapeSource = "live";

    // 1. Try live click+download from the entry page
    //    The entry page lists 4-6 "VIEW RATES" buttons, each pointing to a different
    //    PDF (domestic retail / Plus / NRI / NRI Plus / FCNR / floating). We pick
    //    the retail domestic one by URL filter.
    try {
      // Navigate to entry page if not already there
      if (!page.url().includes("axis.bank.in/deposits/fixed-deposits/fd-interest-rates")) {
        await page.goto(this.url, { waitUntil: "domcontentloaded", timeout: 30000 });
      }

      const dl = await clickAndDownloadPdf(page, {
        urlMustMatch: "domestic-fixed-deposits",
        urlMustNotMatch: ["plus", "nri", "fcnr", "floating"],
        timeoutMs: 30000
      });

      pdfCapturedUrl = dl.downloadUrl;
      source = dl.downloadUrl;

      rates = await LayeredExtractor.extractFromPdf(dl.filePath);

      // Cleanup temp PDF
      try { fs.unlinkSync(dl.filePath); } catch (e) { /* ignore */ }
    } catch (e) {
    }

    // 2. Fallback to local HTML if live click failed or yielded 0 rows
    if (rates.length === 0) {
      isFallback = true;
      scrapeSource = "fallback";
      source = this.url;

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
      effective_from: null,
      effective_to: null,
      source_url: source,
      scrape_source: scrapeSource,
      pdf_captured_url: pdfCapturedUrl,
      is_fallback: isFallback,
      scraper_version: "1.0.0"
    };
  }
}
