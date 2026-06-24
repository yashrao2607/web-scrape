import { BaseScraper } from './baseScraper.js';
import { LayeredExtractor } from '../core/extractor.js';

export class ShriramFinanceScraper extends BaseScraper {
  async scrape(page) {
    this.logger.info("starting_shriram_finance_scrape");
    let rates = [];

    try {
      await page.waitForSelector("table, [role='table']", { timeout: 5000 });
    } catch (e) {
      this.logger.warn("timeout_waiting_for_tables_attempting_anyway");
    }

    const tables = await LayeredExtractor.extractFromPage(page);
    const parsedTables = [];

    for (const t of tables) {
      const parsed = LayeredExtractor.parseExtractedTable(t);
      if (parsed && parsed.length > 0) {
        parsedTables.push(...parsed);
      }
    }

    // The cumulative deposit table has month-only numbers as tenure
    // (e.g. "12", "15 (digital)") without "months" suffix.
    // The standard parser may miss some rows. Use manual DOM extraction
    // for the Cumulative Deposit table as a supplement.
    if (parsedTables.length === 0 || parsedTables.length < 5) {
      this.logger.info("using_manual_shriram_cumulative_extraction");
      const manualRates = await page.evaluate(() => {
        function getPrecedingHeading(el) {
          let current = el;
          while (current) {
            let sibling = current.previousElementSibling;
            while (sibling) {
              if (/^(H[1-6])$/i.test(sibling.tagName)) {
                return sibling.innerText.trim();
              }
              const heading = sibling.querySelector("h1, h2, h3, h4, h5, h6");
              if (heading) {
                return heading.innerText.trim();
              }
              sibling = sibling.previousElementSibling;
            }
            current = current.parentElement;
          }
          return "";
        }

        const results = [];
        const tables = document.querySelectorAll("table");
        for (const table of tables) {
          const precedingText = getPrecedingHeading(table);
          const isCumulative = precedingText.toLowerCase().includes("cumulative deposit");
          if (!isCumulative) continue;

          const rows = table.querySelectorAll("tr");
          rows.forEach((tr, idx) => {
            if (idx === 0) return;
            const cells = tr.querySelectorAll("td, th");
            if (cells.length >= 2) {
              const period = cells[0].innerText.trim();
              const rate = cells[1].innerText.trim();
              if (period && rate && !isNaN(parseFloat(rate))) {
                let tenureRaw = period;
                if (/^\d+$/.test(period)) {
                  tenureRaw = period + " Months";
                } else if (/^\d/.test(period) && !/[-–—]/.test(period)) {
                  const digits = period.match(/\d+/);
                  if (digits) tenureRaw = digits[0] + " Months";
                }
                results.push({
                  tenure_raw: tenureRaw,
                  general_raw: rate + "%",
                  senior_raw: rate + "%",
                  section_name: precedingText || "Cumulative Deposit",
                  table_name: ""
                });
              }
            }
          });
        }
        return results;
      });

      if (manualRates.length > parsedTables.length) {
        rates.push(...manualRates);
      }
    }

    if (rates.length === 0) {
      rates = parsedTables;
    }

    if (rates.length === 0) {
      rates = await LayeredExtractor.extractFromUnstructuredText(page);
    }

    return {
      fd_rates: rates,
      minimum_deposit: 5000.0,
      maximum_deposit: 50000000.0,
      premature_withdrawal_available: true,
      premature_withdrawal_penalty: "1.00% to 2.00% depending on tenure",
      loan_against_fd_available: false,
      tax_saver_fd_available: false,
      nomination_available: true,
      compounding_frequency: "Quarterly",
      last_updated_on_page: null,
      effective_from: null,
      effective_to: null,
      scraper_version: "1.0.0"
    };
  }
}
