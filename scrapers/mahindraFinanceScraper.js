import { BaseScraper } from './baseScraper.js';
import { LayeredExtractor } from '../core/extractor.js';

// Mahindra Finance's rate table gives bare numbers under a "Tenure (in
// months)" header (e.g. "12", "18") with no unit text. Decimal rate cells
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

    // Tag bare tenure cells with a "months" unit INSIDE the raw matrix, before
    // parsing. Doing this only after extraction is too late: with no unit
    // anywhere in the table, the extractor's "find the first data row" scan
    // finds nothing tenure-like until it happens to reach a bare number >= 15
    // (its own separate heuristic for rejecting ambiguous short numbers), so
    // "12" — being < 15 — gets swallowed into the header rows as if it were a
    // header label instead of being recognized as the first data row, and is
    // silently dropped from the output entirely. Tagging the matrix first
    // fixes both the missing row and the mislabeled DAYS-instead-of-months
    // fallback the bare "18" etc. would otherwise get.
    tables = tables.map(t => ({
      ...t,
      matrix: t.matrix.map(row => row.map(cell => tagMonthUnit(cell)))
    }));

    rates = LayeredExtractor.extractPrimaryRateRows(tables);

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
