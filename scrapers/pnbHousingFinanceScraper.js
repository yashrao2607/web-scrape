import { BaseScraper } from './baseScraper.js';
import { LayeredExtractor } from '../core/extractor.js';

export class PNBHousingFinanceScraper extends BaseScraper {
  async scrape(page) {
    this.logger.info("starting_pnb_housing_finance_scrape");
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

    // PNB Housing Finance: +0.25% senior citizen premium is stated as page
    // policy text ("An additional interest rate of 0.25% is offered to senior
    // citizens"), not a table column, so parseExtractedTable finds no senior
    // column and defaults senior_raw to the general rate. Apply the stated
    // premium here (same pattern as CanaraBankScraper's senior premium).
    rates.forEach(item => {
      const genRateVal = parseFloat(String(item.general_raw || "").replace(/%/g, "").trim());
      if (isNaN(genRateVal)) return;
      const senRateVal = parseFloat(String(item.senior_raw || "").replace(/%/g, "").trim());
      if (!isNaN(senRateVal) && senRateVal > genRateVal + 0.01) return;
      item.senior_raw = `${(genRateVal + 0.25).toFixed(2)}%`;
    });

    return {
      fd_rates: rates,
      minimum_deposit: 10000.0,
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
