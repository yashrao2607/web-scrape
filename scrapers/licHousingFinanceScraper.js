import { BaseScraper } from './baseScraper.js';
import { LayeredExtractor } from '../core/extractor.js';

const NON_FD_LINE = /bps|mark.?up|repo|mclr|savings|card|loan|mortgage|apr|credit|agri|penalty|lock.?in|pre.?matur|tender|tax/i;

function isValidFDRate(val) {
  return val >= 2.0 && val <= 12.0;
}

export class LICHousingFinanceScraper extends BaseScraper {
  async scrape(page) {
    this.logger.info("starting_lic_housing_finance_scrape");
    let rates = [];

    try {
      await page.waitForSelector("table, [role='table']", { timeout: 10000 });
    } catch (e) {
      this.logger.warn("timeout_waiting_for_tables_attempting_anyway");
    }

    // LIC Housing uses non-standard column headers ("Up to Rs.3 Crore")
    // instead of "rate"/"interest". Manually extract the Cumulative
    // Public Deposit table from raw DOM as the primary source.
    this.logger.info("using_manual_lic_housing_table_extraction");
    const manualRates = await page.evaluate(() => {
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
        const isCumulative = precedingText.toLowerCase().includes("cumulative public deposit");
        if (!isCumulative) continue;

        const rows = table.querySelectorAll("tr");
        rows.forEach((tr, idx) => {
          if (idx === 0) return;
          const cells = tr.querySelectorAll("td, th");
          if (cells.length >= 2) {
            const term = cells[0].innerText.trim();
            const rate = cells[1].innerText.trim();
            const rateNum = parseFloat(rate.replace(/%/g, "").trim());
            if (term && rate && !isNaN(rateNum)) {
              results.push({
                tenure_raw: term,
                general_raw: rate,
                senior_raw: rate,
                section_name: precedingText || "Cumulative Public Deposit",
                table_name: ""
              });
            }
          }
        });
      }
      return results;
    });

    if (manualRates.length > 0) {
      rates.push(...manualRates);
    }

    if (rates.length === 0) {
      const tables = await LayeredExtractor.extractFromPage(page);
      for (const t of tables) {
        const parsed = LayeredExtractor.parseExtractedTable(t);
        if (parsed && parsed.length > 0) {
          rates.push(...parsed);
        }
      }
    }

    if (rates.length < 5) {
      rates = await this.parseRatesFromText(page);
    }

    if (rates.length === 0) {
      rates = await LayeredExtractor.extractFromUnstructuredText(page);
    }

    return {
      fd_rates: rates,
      minimum_deposit: 20000.0,
      maximum_deposit: 30000000.0,
      premature_withdrawal_available: true,
      premature_withdrawal_penalty: "1% less than applicable FD rate",
      loan_against_fd_available: false,
      tax_saver_fd_available: false,
      nomination_available: true,
      compounding_frequency: "Yearly",
      last_updated_on_page: null,
      effective_from: null,
      effective_to: null,
      scraper_version: "2.0.0"
    };
  }

  async parseRatesFromText(page) {
    const text = await page.evaluate(() => document.body ? document.body.innerText : '');
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const parsed = [];

    let pendingTenure = null;

    const TENURE_LIKE = /^\d+\s*(Year|Month|day|day)/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.length > 100) continue;
      if (NON_FD_LINE.test(line)) continue;

      const hasPct = /\d+\.\d+\s*%/.test(line);
      const isTenureLine = TENURE_LIKE.test(line) && !hasPct;

      if (isTenureLine && !hasPct) {
        pendingTenure = line;
        continue;
      }

      const pcts = line.match(/\d+\.\d+(?=\s*%)/g);
      if (pcts && pcts.length >= 2) {
        const rates = pcts.map(parseFloat).filter(v => isValidFDRate(v));
        if (rates.length < 2) continue;

        const firstPctIdx = line.search(/\d+\.\d+\s*%/);
        if (firstPctIdx < 0) continue;

        let tenureRaw = line.substring(0, firstPctIdx).trim();

        if (!tenureRaw && pendingTenure) {
          tenureRaw = pendingTenure;
          pendingTenure = null;
        }

        if (!tenureRaw || tenureRaw.length > 40) continue;

        if (/^\d+$/.test(tenureRaw)) {
          tenureRaw = tenureRaw + " Months";
        }

        const general = rates[0];
        let senior = general + 0.25;
        if (senior > 12.0) senior = 12.0;

        parsed.push({
          tenure_raw: tenureRaw,
          general_raw: String(general),
          senior_raw: String(senior),
          section_name: "Sanchay Public Deposit",
          table_name: "",
          rate_effective_date: null
        });
        continue;
      }

      if (pcts && pcts.length === 1 && pendingTenure) {
        const rate = parseFloat(pcts[0]);
        if (isValidFDRate(rate)) {
          let tenureRaw = pendingTenure;
          pendingTenure = null;

          if (/^\d+$/.test(tenureRaw)) {
            tenureRaw = tenureRaw + " Months";
          }

          let senior = rate + 0.25;
          if (senior > 12.0) senior = 12.0;

          parsed.push({
            tenure_raw: tenureRaw,
            general_raw: String(rate),
            senior_raw: String(senior),
            section_name: "Sanchay Public Deposit",
            table_name: "",
            rate_effective_date: null
          });
        }
      }
    }

    return parsed;
  }
}
