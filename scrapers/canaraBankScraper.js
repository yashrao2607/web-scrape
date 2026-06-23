import { BaseScraper } from './baseScraper.js';
import { LayeredExtractor } from '../core/extractor.js';
import { parseTenureRange } from '../core/normalizer.js';

export class CanaraBankScraper extends BaseScraper {
  async scrape(page) {
    this.logger.info("starting_canara_bank_scrape");
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

    // Canara Bank: +0.50% senior citizen premium for deposits >= 180 days.
    // Policy: "Additional interest of 0.50% for Senior Citizens (General Public)
    // is available for Deposits (Other than NRO/NRE and CGA Deposits)
    // less than Rs. 3 Cr and with tenor of 180 Days and above."
    rates.forEach(item => {
      const genRateStr = String(item.general_raw || "").replace(/%/g, "").trim();
      const genRateVal = parseFloat(genRateStr);
      if (isNaN(genRateVal)) return;

      const [minDays] = parseTenureRange(item.tenure_raw);
      if (minDays !== null && minDays >= 180) {
        item.senior_raw = `${(genRateVal + 0.50).toFixed(2)}%`;
      }
    });

    return {
      fd_rates: rates,
      minimum_deposit: 5000.0,
      maximum_deposit: 30000000.0,
      premature_withdrawal_available: true,
      premature_withdrawal_penalty: "1.00% penalty on premature closure",
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
