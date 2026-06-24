import { BaseScraper } from './baseScraper.js';
import { LayeredExtractor } from '../core/extractor.js';

const NON_FD_LINE = /bps|mark.?up|repo|home\s*loan|auto\s*loan|personal\s*loan|mudra|education\s*loan|MCLR|savings.*balance|card\s*rate|mortgage|min.*interest|max.*interest|annual.*percentage|apr|loans? up to|credit\s*limit|priority.*sector|agri.*loan/i;

function isValidFDRate(val) {
  return val >= 2.0 && val <= 12.0;
}

export class IDBIBankScraper extends BaseScraper {
  async scrape(page) {
    this.logger.info("starting_idbi_bank_scrape");
    let rates = [];

    try {
      await page.waitForSelector("table, [role='table']", { timeout: 10000 });
    } catch (e) {
      this.logger.warn("timeout_waiting_for_tables_attempting_anyway");
    }

    const tables = await LayeredExtractor.extractFromPage(page);
    // Page renders several rate tables (retail, bulk >=3 Cr, non-callable, NRI).
    // Use only the primary retail table to avoid merging overlapping/duplicate rows.
    rates = LayeredExtractor.extractPrimaryRateRows(tables);

    if (rates.length < 4) {
      rates = await this.parseRatesFromText(page);
    }

    if (rates.length === 0) {
      rates = await LayeredExtractor.extractFromUnstructuredText(page);
    }

    rates = rates.filter(r => {
      const t = (r.tenure_raw || r.tenure || '').toLowerCase();
      return !NON_FD_LINE.test(t);
    });

    return {
      fd_rates: rates,
      minimum_deposit: 10000.0,
      maximum_deposit: 30000000.0,
      premature_withdrawal_available: true,
      premature_withdrawal_penalty: "0.50% to 1.00% depending on tenure",
      loan_against_fd_available: true,
      tax_saver_fd_available: true,
      tax_saver_tenure: "5 Years",
      nomination_available: true,
      compounding_frequency: "Quarterly",
      last_updated_on_page: null,
      effective_from: null,
      effective_to: null,
      scraper_version: "1.3.0"
    };
  }

  async parseRatesFromText(page) {
    const text = await page.evaluate(() => document.body ? document.body.innerText : '');
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    const parsed = [];

    for (const line of lines) {
      if (line.length > 130) continue;
      if (NON_FD_LINE.test(line)) continue;

      const parts = line.split(/\t|\s{2,}/);
      if (parts.length < 2) continue;

      const rateVals = [];
      for (let i = 1; i < parts.length; i++) {
        const clean = parts[i].replace(/%/g, '').trim();
        const num = parseFloat(clean);
        if (!isNaN(num) && isValidFDRate(num)) {
          rateVals.push(num);
        }
      }

      if (rateVals.length < 2) continue;

      parsed.push({
        tenure_raw: parts[0].trim(),
        general_raw: String(rateVals[0]),
        senior_raw: String(rateVals[1]),
        section_name: "Term Deposits (<3 Cr)",
        table_name: "",
        rate_effective_date: null
      });
    }

    return parsed;
  }
}
