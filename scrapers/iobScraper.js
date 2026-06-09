import { BaseScraper } from './baseScraper.js';
import { LayeredExtractor } from '../core/extractor.js';

export class IOBScraper extends BaseScraper {
  async scrape(page) {
    this.logger.info("starting_iob_scrape");
    let rates = [];

    try {
      await page.waitForSelector("table, [role='table']", { timeout: 5000 });
    } catch (e) {
      this.logger.warn("timeout_waiting_for_tables_attempting_anyway");
    }

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

    // Post-process to add the +0.50% senior citizen premium
    rates.forEach(item => {
      try {
        const genRateStr = String(item.general_raw || "").replace(/%/g, "").trim();
        const genRateVal = parseFloat(genRateStr);
        if (!isNaN(genRateVal)) {
          item.senior_raw = `${(genRateVal + 0.50).toFixed(2)}%`;
        }
      } catch (e) {}
    });

    return {
      fd_rates: rates,
      minimum_deposit: 10000.0,
      maximum_deposit: 30000000.0,
      premature_withdrawal_available: true,
      premature_withdrawal_penalty: "1.00% premature withdrawal penalty",
      loan_against_fd_available: true,
      tax_saver_fd_available: true,
      tax_saver_tenure: "5 Years",
      nomination_available: true,
      compounding_frequency: "Quarterly",
      last_updated_on_page: null,
      effective_from: null,
      effective_to: null,
      scraper_version: "1.0.0"
    };
  }
}
