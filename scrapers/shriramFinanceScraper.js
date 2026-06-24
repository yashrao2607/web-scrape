import { BaseScraper } from './baseScraper.js';
import { LayeredExtractor } from '../core/extractor.js';

const NON_FD_LINE = /bps|mark.?up|repo|mclr|savings|card|mortgage|apr|credit|agri|penalty|lock.?in|pre.?matur|tender|tax/i;

function isValidFDRate(val) {
  return val >= 2.0 && val <= 12.0;
}

export class ShriramFinanceScraper extends BaseScraper {
  async scrape(page) {
    this.logger.info("starting_shriram_finance_scrape");
    let rates = [];

    try {
      await page.waitForSelector("table, [role='table']", { timeout: 10000 });
    } catch (e) {
      this.logger.warn("timeout_waiting_for_tables_attempting_anyway");
    }

    const tables = await LayeredExtractor.extractFromPage(page);
    rates = LayeredExtractor.extractPrimaryRateRows(tables);

    if (rates.length < 5) {
      rates = await this.parseRatesFromText(page);
    }

    // The cumulative deposit table has month-only numbers as tenure
    // (e.g. "12", "15 (digital)") without "months" suffix.
    // Use manual DOM extraction only as a last resort if text parse fails.
    if (rates.length < 3) {
      this.logger.info("using_manual_shriram_cumulative_extraction");
      rates = await page.evaluate(() => {
        function getPrecedingHeading(el) {
          let current = el;
          while (current) {
            let sibling = current.previousElementSibling;
            while (sibling) {
              if (/^(H[1-6])$/i.test(sibling.tagName)) {
                return sibling.innerText.trim();
              }
              const heading = sibling.querySelector("h1, h2, h3, h4, h5, h6");
              if (heading) {
                return heading.innerText.trim();
              }
              sibling = sibling.previousElementSibling;
            }
            current = current.parentElement;
          }
          return "";
        }

        const results = [];
        const tables = document.querySelectorAll("table");
        for (const table of tables) {
          const precedingText = getPrecedingHeading(table);
          const isCumulative = precedingText.toLowerCase().includes("cumulative deposit");
          if (!isCumulative) continue;

          const rows = table.querySelectorAll("tr");
          rows.forEach((tr, idx) => {
            if (idx === 0) return;
            const cells = tr.querySelectorAll("td, th");
            if (cells.length >= 2) {
              const period = cells[0].innerText.trim();
              const rate = cells[1].innerText.trim();
              if (period && rate && !isNaN(parseFloat(rate))) {
                let tenureRaw = period;
                if (/^\d+$/.test(period)) {
                  tenureRaw = period + " Months";
                } else if (/^\d/.test(period) && !/[-–—]/.test(period)) {
                  const digits = period.match(/\d+/);
                  if (digits) tenureRaw = digits[0] + " Months";
                }
                results.push({
                  tenure_raw: tenureRaw,
                  general_raw: rate + "%",
                  senior_raw: rate + "%",
                  section_name: precedingText || "Cumulative Deposit",
                  table_name: ""
                });
              }
            }
          });
        }
        return results;
      });
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
      minimum_deposit: 5000.0,
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
      scraper_version: "2.0.1"
    };
  }

  async parseRatesFromText(page) {
    const text = await page.evaluate(() => document.body ? document.body.innerText : '');
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const parsed = [];
    const seen = new Set();

    for (const line of lines) {
      if (line.length > 200) continue;
      if (NON_FD_LINE.test(line)) continue;

      const pcts = line.match(/\d+\.\d+/g);
      if (!pcts || pcts.length < 5) continue;

      const nums = pcts.map(parseFloat).filter(v => isValidFDRate(v));
      if (nums.length < 5) continue;

      // Try to extract tenure from text before the first rate number
      const firstNumIdx = line.search(/\d+\.\d+/);
      if (firstNumIdx < 0) continue;

      let period = line.substring(0, firstNumIdx).trim();
      if (!period || period.length > 40) continue;

      // Append " Months" if the raw period is just a number or number range without a time unit
      const periodLower = period.toLowerCase();
      if (!periodLower.includes('month') && !periodLower.includes('year') && !periodLower.includes('day')) {
        if (/^\d/.test(period)) {
          period = period + " Months";
        }
      }

      // Strip leading/trailing junk like bullets, asterisks, dashes
      period = period.replace(/^[\s•\-–—*#]+/, '').replace(/[\s•\-–—*#]+$/, '').trim();

      // Normalize spaces around dash
      period = period.replace(/\s*-\s*/g, '-');

      const general = nums[4];
      if (!isValidFDRate(general)) continue;

      let senior = nums[5] || general + 0.50;
      if (senior > 12.0) senior = 12.0;

      const key = period + '|' + general;
      if (seen.has(key)) continue;
      seen.add(key);

      parsed.push({
        tenure_raw: period,
        general_raw: String(general),
        senior_raw: String(senior),
        section_name: "Shriram Unnati FD",
        table_name: "",
        rate_effective_date: null
      });
    }

    return parsed;
  }
}
