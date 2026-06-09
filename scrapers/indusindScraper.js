import { BaseScraper } from './baseScraper.js';
import { LayeredExtractor } from '../core/extractor.js';

export class IndusIndScraper extends BaseScraper {
  async scrape(page) {
    this.logger.info("starting_indusind_scrape");
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

    // Filter out older historical FD tables if multiple effective dates are present
    const fdRates = rates.filter(r => 
      r.section_name && 
      (r.section_name.toLowerCase().includes("fixed deposit") || r.section_name.toLowerCase().includes("term deposit"))
    );
    
    const fdDates = fdRates
      .map(r => r.rate_effective_date)
      .filter(d => d && /^\d{4}-\d{2}-\d{2}$/.test(d));
      
    if (fdDates.length > 0) {
      fdDates.sort();
      const latestFdDate = fdDates[fdDates.length - 1];
      this.logger.info("filtering_historical_indusind_fd_tables", { latest_date: latestFdDate });
      rates = rates.filter(r => {
        const isFd = r.section_name && 
          (r.section_name.toLowerCase().includes("fixed deposit") || r.section_name.toLowerCase().includes("term deposit"));
        if (!isFd) return true;
        return r.rate_effective_date === latestFdDate;
      });
    }

    if (rates.length === 0) {
      rates = await LayeredExtractor.extractFromUnstructuredText(page);
    }

    return {
      fd_rates: rates,
      minimum_deposit: 10000.0,
      maximum_deposit: 30000000.0,
      premature_withdrawal_available: true,
      premature_withdrawal_penalty: "1.00% penal charges on premature withdrawal",
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
