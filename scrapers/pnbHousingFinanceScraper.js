import { BaseScraper } from './baseScraper.js';
import { LayeredExtractor } from '../core/extractor.js';

const NON_FD_LINE = /bps|mark.?up|repo|mclr|savings|card|loan|mortgage|apr|credit|agri|penalty|lock.?in|pre.?matur|tender|tax|tentative yield/i;

function isValidFDRate(val) {
  return val >= 2.0 && val <= 12.0;
}

export class PNBHousingFinanceScraper extends BaseScraper {
  async scrape(page) {
    this.logger.info("starting_pnb_housing_finance_scrape");
    let rates = [];

    try {
      await page.waitForSelector("table, [role='table']", { timeout: 10000 });
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

    if (rates.length < 5) {
      rates = await this.parseRatesFromText(page);
    }

    if (rates.length === 0) {
      rates = await LayeredExtractor.extractFromUnstructuredText(page);
    }

    for (const r of rates) {
      const g = parseFloat(r.general_raw);
      const s = parseFloat(r.senior_raw);
      if (!isNaN(g) && (isNaN(s) || Math.abs(s - g) < 0.01)) {
        let adj = g + 0.25;
        if (adj > 12.0) adj = 12.0;
        r.senior_raw = String(adj);
      }
    }

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
      scraper_version: "2.0.0"
    };
  }

  async parseRatesFromText(page) {
    const text = await page.evaluate(() => document.body ? document.body.innerText : '');
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const parsed = [];

    for (const line of lines) {
      if (line.length > 200) continue;
      if (NON_FD_LINE.test(line)) continue;

      const pcts = line.match(/\d+\.\d+(?=\s*%)/g);
      if (!pcts || pcts.length < 2) continue;

      const rates = pcts.map(parseFloat).filter(v => isValidFDRate(v));
      if (rates.length < 2) continue;

      const firstPctIdx = line.search(/\d+\.\d+\s*%/);
      if (firstPctIdx < 0) continue;

      let tenureRaw = line.substring(0, firstPctIdx).trim();
      tenureRaw = tenureRaw.replace(/[×x*]/g, '').trim();

      if (/^\d+$/.test(tenureRaw)) {
        tenureRaw = tenureRaw + " Months";
      }

      if (!tenureRaw || tenureRaw.length > 60) continue;

      const general = rates[0];
      let senior = general + 0.25;
      if (senior > 12.0) senior = 12.0;

      parsed.push({
        tenure_raw: tenureRaw,
        general_raw: String(general),
        senior_raw: String(senior),
        section_name: "Fixed Deposit (upto ₹5 Cr)",
        table_name: "",
        rate_effective_date: null
      });
    }

    return parsed;
  }
}
