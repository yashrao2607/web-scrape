import { BaseScraper } from './baseScraper.js';
import { LayeredExtractor } from '../core/extractor.js';

// Mahindra Finance's rate table gives bare numbers under a "Tenure (in
// months)" header (e.g. "18", "12-14") with no unit text. Without a unit,
// the shared tenure parser silently reads bare numbers as DAYS, not months —
// tag the unit back on before validation so tenures aren't mislabeled.
function tagMonthUnit(raw) {
  const cleaned = (raw || "").replace(/[–—]/g, "-").trim();
  const range = /^(\d+)\s*-\s*(\d+)$/.exec(cleaned);
  if (range) return `${range[1]} months to ${range[2]} months`;
  const single = /^(\d+)$/.exec(cleaned);
  if (single) return `${single[1]} months`;
  return raw;
}

export class MahindraFinanceScraper extends BaseScraper {
  async scrape(page) {
    this.logger.info("starting_mahindra_finance_scrape");
    let rates = [];

    try {
      await page.waitForSelector("table, [role='table']", { timeout: 5000 });
    } catch (e) {
      this.logger.warn("timeout_waiting_for_tables_attempting_anyway");
    }

    let tables = await LayeredExtractor.extractFromPage(page);
    // Drop the marketing "Highlights" box and the >Rs 5 Cr Bulk Deposit table so
    // only the Retail Fixed Deposit (Cumulative) table is used for retail rates.
    tables = tables.filter(t => !/highlight|credit rating|bulk deposit/i.test(t.section_name || ""));
    rates = LayeredExtractor.extractPrimaryRateRows(tables)
      .map(r => ({ ...r, tenure_raw: tagMonthUnit(r.tenure_raw) }));

    if (rates.length === 0) {
      rates = await LayeredExtractor.extractFromUnstructuredText(page);
    }

    return {
      fd_rates: rates,
      minimum_deposit: 5000.0,
      maximum_deposit: 50000000.0,
      premature_withdrawal_available: true,
      premature_withdrawal_penalty: "No interest if withdrawn within 3 months; reduced rate thereafter",
      loan_against_fd_available: true,
      tax_saver_fd_available: false,
      tax_saver_tenure: null,
      nomination_available: true,
      compounding_frequency: "Annually",
      last_updated_on_page: null,
      effective_from: null,
      effective_to: null,
      scraper_version: "1.0.0"
    };
  }
}
