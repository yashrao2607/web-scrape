import { BaseScraper } from './baseScraper.js';
import { LayeredExtractor } from '../core/extractor.js';

export class BankOfIndiaScraper extends BaseScraper {
  async scrape(page) {
    this.logger.info("starting_bank_of_india_scrape");
    let rates = [];

    try {
      await page.waitForSelector("table, [role='table']", { timeout: 5000 });
    } catch (e) {
      this.logger.warn("timeout_waiting_for_tables_attempting_anyway");
    }

    const tables = await LayeredExtractor.extractFromPage(page);
    // Page renders several rate tables (retail, bulk >=3 Cr, non-callable, NRI).
    // Use only the primary retail table to avoid merging overlapping/duplicate rows.
    rates = LayeredExtractor.extractPrimaryRateRows(tables);

    if (rates.length === 0) {
      rates = await LayeredExtractor.extractFromUnstructuredText(page);
    }

    return {
      fd_rates: rates,
      minimum_deposit: 1000.0,
      maximum_deposit: 30000000.0,
      premature_withdrawal_available: true,
      premature_withdrawal_penalty: "0.50% penalty for deposits below Rs.1 Cr, 1.00% for above",
      loan_against_fd_available: true,
      tax_saver_fd_available: true,
      tax_saver_tenure: "5 Years to 10 Years",
      nomination_available: true,
      compounding_frequency: "Quarterly",
      last_updated_on_page: null,
      effective_from: null,
      effective_to: null,
      scraper_version: "1.0.0"
    };
  }
}
