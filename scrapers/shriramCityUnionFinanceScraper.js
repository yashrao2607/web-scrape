import { BaseScraper } from './baseScraper.js';
import { LayeredExtractor } from '../core/extractor.js';

export class ShriramCityUnionFinanceScraper extends BaseScraper {
  async scrape(page) {
    this.logger.info("starting_shriram_city_union_finance_scrape");
    let rates = [];

    try {
      await page.waitForSelector("table, [role='table']", { timeout: 5000 });
    } catch (e) {
      this.logger.warn("timeout_waiting_for_tables_attempting_anyway");
    }

    let tables = await LayeredExtractor.extractFromPage(page);
    // Drop the marketing "Highlights" box and the "non-cumulative" (payout
    // frequency) table so only the cumulative retail deposit table is used —
    // its column layout (Regular/Senior) matches the general/senior schema,
    // while the non-cumulative table's columns are payout frequencies instead.
    tables = tables.filter(t => !/highlight|credit rating|non-cumulative/i.test(t.section_name || ""));
    rates = LayeredExtractor.extractPrimaryRateRows(tables);

    if (rates.length === 0) {
      rates = await LayeredExtractor.extractFromUnstructuredText(page);
    }

    return {
      fd_rates: rates,
      minimum_deposit: 5000.0,
      maximum_deposit: null,
      premature_withdrawal_available: true,
      premature_withdrawal_penalty: "No interest if withdrawn within 3 months; reduced rate thereafter",
      loan_against_fd_available: true,
      tax_saver_fd_available: false,
      tax_saver_tenure: null,
      nomination_available: true,
      compounding_frequency: "Monthly",
      last_updated_on_page: null,
      effective_from: null,
      effective_to: null,
      scraper_version: "1.0.0"
    };
  }
}
