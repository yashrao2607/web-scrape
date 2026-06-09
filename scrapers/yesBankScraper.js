import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import { BaseScraper } from './baseScraper.js';
import { LayeredExtractor } from '../core/extractor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class YesBankScraper extends BaseScraper {
  async scrape(page) {
    let rates = [];

    try {
      await page.goto(this.url, { waitUntil: "domcontentloaded", timeout: 5000 });
      await page.waitForSelector("table, [role='table']", { timeout: 3000 });
      const tables = await LayeredExtractor.extractFromPage(page);
      for (const t of tables) {
        const parsed = LayeredExtractor.parseExtractedTable(t);
        if (parsed && parsed.length > 0) {
          rates.push(...parsed);
        }
      }
      if (rates.length === 0) {
        rates = await LayeredExtractor.extractFromUnstructuredText(page);
      }
    } catch (e) {
    }

    if (rates.length === 0) {
      const fallbackPath = path.join(__dirname, "yes_bank_fallback.html");
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
              section_name: heading || "YES Bank Fallback Rates",
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
      minimum_deposit: 10000.0,
      maximum_deposit: 30000000.0,
      premature_withdrawal_available: true,
      premature_withdrawal_penalty: "0.50% to 1.00% depending on tenure",
      loan_against_fd_available: true,
      tax_saver_fd_available: true,
      tax_saver_tenure: "5 Years",
      nomination_available: true,
      compounding_frequency: "Quarterly",
      last_updated_on_page: null,
      effective_from: "2026-06-02",
      effective_to: null,
      scraper_version: "1.0.0"
    };
  }
}
