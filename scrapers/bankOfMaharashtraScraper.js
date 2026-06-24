import { BaseScraper } from './baseScraper.js';
import { LayeredExtractor } from '../core/extractor.js';

const TENURE_PATTERN = /(\d[\d\s]*(?:days?|months?|years?|d|m|y)(?:\s*(?:to|-|–)\s*\d*\s*(?:days?|months?|years?|d|m|y))?(?:\s*(?:and\s+above|above|& above|less\s+than|<)\s*\d*\s*(?:days?|months?|years?|d|m|y))?(?:\s*\([^)]*\))?)/i;

const RATE_VALUE = /(\d+(?:\.\d+))/g;

export class BankOfMaharashtraScraper extends BaseScraper {
  async scrape(page) {
    this.logger.info("starting_bank_of_maharashtra_scrape");
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

    rates.forEach(r => {
      const gen = parseFloat(r.general_raw?.replace(/%/g, ''));
      if (!isNaN(gen)) {
        const senStr = String(r.senior_raw ?? '').replace(/%/g, '').trim();
        const sen = parseFloat(senStr);
        if (!isNaN(sen) && senStr.length > 0 && sen > gen + 0.01) return;
        r.senior_raw = `${(gen + 0.50).toFixed(2)}%`;
      }
    });

    return {
      fd_rates: rates,
      minimum_deposit: 10000.0,
      maximum_deposit: 30000000.0,
      premature_withdrawal_available: true,
      premature_withdrawal_penalty: "1.00% premature withdrawal penalty",
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
    const text = await page.evaluate(() => document.body.innerText);
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    const fdSection = [];
    let inFDSection = false;

    for (const line of lines) {
      const lc = line.toLowerCase();
      if (/regular schemes.*callable|domestic term deposits|interest rate on domestic/i.test(lc)) {
        inFDSection = true;
      }
      if (/amount.*above.*rs|special schemes|nre deposits|fcnr|recurring|advances/i.test(lc)) {
        inFDSection = false;
      }
      if (inFDSection && /^\d/.test(line)) {
        fdSection.push(line);
      }
    }

    if (fdSection.length === 0) {
      for (const line of lines) {
        if (/^\s*\d/.test(line) && TENURE_PATTERN.test(line)) {
          const matches = [...line.matchAll(RATE_VALUE)];
          if (matches.length >= 1) fdSection.push(line);
        }
      }
    }

    const parsed = [];
    for (const line of fdSection) {
      if (line.length > 150) continue;

      TENURE_PATTERN.lastIndex = 0;
      const tenureMatch = TENURE_PATTERN.exec(line);
      if (!tenureMatch) continue;

      const tenureRaw = tenureMatch[1].trim();
      RATE_VALUE.lastIndex = 0;
      const rateMatches = [...line.matchAll(RATE_VALUE)];
      if (rateMatches.length === 0) continue;

      parsed.push({
        tenure_raw: tenureRaw,
        general_raw: rateMatches[0][1],
        senior_raw: rateMatches[0][1],
        section_name: "Domestic Term Deposits (<3 Cr)",
        table_name: "",
        rate_effective_date: null
      });
    }

    return parsed;
  }
}
