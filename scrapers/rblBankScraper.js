import { BaseScraper } from './baseScraper.js';
import { LayeredExtractor } from '../core/extractor.js';

const TENURE_PATTERN = /(\d[\d\s]*(?:days?|months?|years?|d|m|y)(?:\s*(?:to|-|–)\s*\d*\s*(?:days?|months?|years?|d|m|y))?(?:\s*(?:and\s+above|above|& above|less\s+than|<)\s*\d*\s*(?:days?|months?|years?|d|m|y))?)/i;

const RATE_PERCENT = /(\d+(?:\.\d+)?)%/g;

export class RBLBankScraper extends BaseScraper {
  async scrape(page) {
    this.logger.info("starting_rbl_bank_scrape");
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
      rates = await this.parseRatesFromText(page);
    }

    if (rates.length === 0) {
      rates = await LayeredExtractor.extractFromUnstructuredText(page);
    }

    return {
      fd_rates: rates,
      minimum_deposit: 5000.0,
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
      scraper_version: "1.0.0"
    };
  }

  async parseRatesFromText(page) {
    const text = await page.evaluate(() => document.body ? document.body.innerText : '');
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    const fdSection = [];
    let inFDSection = false;

    for (const line of lines) {
      const lc = line.toLowerCase();
      if (/fixed deposit|regular fixed|domestic.*nro|period of deposit/.test(lc)) {
        inFDSection = true;
      }
      if (/recurring deposit|fcnr|mclr|base rate|prime lending/.test(lc)) {
        inFDSection = false;
      }
      if (inFDSection && /^\d/.test(line)) {
        fdSection.push(line);
      }
    }

    if (fdSection.length === 0) {
      for (const line of lines) {
        if (/^\d/.test(line) && TENURE_PATTERN.test(line) && RATE_PERCENT.test(line)) {
          fdSection.push(line);
        }
      }
    }

    const parsed = [];
    for (const line of fdSection) {
      if (line.length > 200) continue;

      const parts = line.split(/\s{2,}|\t+\|*/).filter(Boolean);
      if (parts.length < 2) continue;

      TENURE_PATTERN.lastIndex = 0;
      const tenureMatch = TENURE_PATTERN.exec(line);
      if (!tenureMatch) continue;

      const tenureRaw = tenureMatch[1].trim();
      RATE_PERCENT.lastIndex = 0;
      const rateMatches = [...line.matchAll(RATE_PERCENT)];
      if (rateMatches.length === 0) continue;

      parsed.push({
        tenure_raw: tenureRaw,
        general_raw: rateMatches[0][1],
        senior_raw: rateMatches.length >= 2 ? rateMatches[1][1] : rateMatches[0][1],
        section_name: "Fixed Deposits",
        table_name: "",
        rate_effective_date: null
      });
    }

    return parsed;
  }
}
