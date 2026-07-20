import { BaseScraper } from './baseScraper.js';
import { LayeredExtractor } from '../core/extractor.js';

export class LICHousingFinanceScraper extends BaseScraper {
  async scrape(page) {
    this.logger.info("starting_lic_housing_finance_scrape");
    let rates = [];

    try {
      await page.waitForSelector("table, [role='table']", { timeout: 5000 });
    } catch (e) {
      this.logger.warn("timeout_waiting_for_tables_attempting_anyway");
    }

    // LIC Housing uses non-standard column headers ("Up to Rs.3 Crore")
    // instead of "rate"/"interest". Manually extract the Cumulative
    // Public Deposit table from raw DOM as the primary source.
    this.logger.info("using_manual_lic_housing_table_extraction");
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
        const headingLower = precedingText.toLowerCase();
        // "Non-Cumulative Public Deposit" contains "cumulative public deposit"
        // as a substring, so it must be excluded explicitly or both tables
        // get scraped and merged into duplicate rows.
        const isCumulative = headingLower.includes("cumulative public deposit") && !headingLower.includes("non-cumulative");
        if (!isCumulative) continue;

        const rows = table.querySelectorAll("tr");
        rows.forEach((tr, idx) => {
          if (idx === 0) return;
          const cells = tr.querySelectorAll("td, th");
          if (cells.length >= 2) {
            const term = cells[0].innerText.trim();
            const rate = cells[1].innerText.trim();
            const rateNum = parseFloat(rate.replace(/%/g, "").trim());
            if (term && rate && !isNaN(rateNum)) {
              results.push({
                tenure_raw: term,
                general_raw: rate,
                senior_raw: rate,
                section_name: precedingText || "Cumulative Public Deposit",
                table_name: ""
              });
            }
          }
        });
      }
      return results;
    });

    if (manualRates.length > 0) {
      rates.push(...manualRates);
    }

    // LIC Housing Finance: +0.25% senior citizen premium for deposits Rs.20,000
    // to less than Rs.2 Crore. This is stated as page policy text, not a table
    // column, so the manual extraction above has no senior column to read and
    // defaults senior_raw to the general rate. Apply the stated premium here
    // (same pattern as CanaraBankScraper's tenure-based senior premium).
    rates.forEach(item => {
      const genRateVal = parseFloat(String(item.general_raw || "").replace(/%/g, "").trim());
      if (isNaN(genRateVal)) return;
      item.senior_raw = `${(genRateVal + 0.25).toFixed(2)}%`;
    });

    if (rates.length === 0) {
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
    }

    return {
      fd_rates: rates,
      minimum_deposit: 10000.0,
      maximum_deposit: 30000000.0,
      premature_withdrawal_available: true,
      premature_withdrawal_penalty: "1% less than applicable FD rate",
      loan_against_fd_available: false,
      tax_saver_fd_available: false,
      nomination_available: true,
      compounding_frequency: "Yearly",
      last_updated_on_page: null,
      effective_from: null,
      effective_to: null,
      scraper_version: "1.0.0"
    };
  }
}
