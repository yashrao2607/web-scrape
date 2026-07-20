import { BaseScraper } from './baseScraper.js';
import { LayeredExtractor } from '../core/extractor.js';

// Bajaj Finance's rate table gives bare month numbers under a "Tenor (in
// months)" header (e.g. "12 – 14") with no unit text. Decimal rate cells
// ("6.60") never match this (the dot blocks it), so it's safe to apply
// across every cell in the table.
function tagMonthUnit(raw) {
  const cleaned = (raw || "").replace(/[–—]/g, "-").trim();
  const range = /^(\d+)\s*-\s*(\d+)$/.exec(cleaned);
  if (range) return `${range[1]} months to ${range[2]} months`;
  const single = /^(\d+)$/.exec(cleaned);
  if (single) return `${single[1]} months`;
  return raw;
}

export class BajajFinanceScraper extends BaseScraper {
  async scrape(page) {
    this.logger.info("starting_bajaj_finance_scrape");
    let rates = [];

    try {
      await page.waitForSelector("table, [role='table']", { timeout: 5000 });
    } catch (e) {
      this.logger.warn("timeout_waiting_for_tables_attempting_anyway");
    }

    let tables = await LayeredExtractor.extractFromPage(page);
    // Paisabazaar's Bajaj Finance page opens with a "Highlights" summary box and a
    // "Credit Rating Agency" box; both misparse as false-positive rate tables and
    // must be dropped so the real domestic-deposit rate table is selected instead.
    tables = tables.filter(t => !/highlight|credit rating/i.test(t.section_name || ""));

    // Tag the bare tenure cells with a "months" unit INSIDE the raw matrix,
    // before parsing. Doing this only after extraction (on the already-parsed
    // tenure_raw) is too late: with no unit anywhere in the table, the
    // extractor's own "find the first data row" scan finds nothing tenure-like
    // in the header rows either, so it defaults to treating only row 0 as the
    // header and misreads the real "Regular Citizens / Senior Citizens"
    // sub-header row as a data row instead — which erases the general/senior
    // column distinction before it can be matched, collapsing both to the
    // same rate. Tagging the matrix first lets the row-detection succeed and
    // keeps both header rows intact.
    tables = tables.map(t => ({
      ...t,
      matrix: t.matrix.map(row => row.map(cell => tagMonthUnit(cell)))
    }));

    rates = LayeredExtractor.extractPrimaryRateRows(tables, 3);

    if (rates.length === 0) {
      rates = await LayeredExtractor.extractFromUnstructuredText(page);
    }

    return {
      fd_rates: rates,
      minimum_deposit: 15000.0,
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
