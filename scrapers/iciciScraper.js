import fs from 'fs';
import path from 'path';
import os from 'os';
import { BaseScraper } from './baseScraper.js';
import { LayeredExtractor } from '../core/extractor.js';

export class ICICIScraper extends BaseScraper {
  async scrape(page) {
    let rates = [];

    if (this.url.toLowerCase().endsWith(".pdf")) {
      const tempPdf = path.join(os.tmpdir(), "icici_rates.pdf");
      const response = await page.context().request().get(this.url);
      fs.writeFileSync(tempPdf, await response.body());
      rates = await LayeredExtractor.extractFromPdf(tempPdf);
    } else {
      try {
        await page.waitForSelector("table, [role='table']", { timeout: 5000 });
      } catch (e) {
      }

      // Click "Less than 3 Cr." button if it exists
      try {
        const btn = page.locator("button:has-text('Less than')").filter({ hasText: "3 Cr" });
        if (await btn.count() > 0) {
          await btn.first().click();
          await page.waitForTimeout(2000);
        }
      } catch (e) {
      }

      const tables = await LayeredExtractor.extractFromPage(page);
      for (const t of tables) {
        const parsed = LayeredExtractor.parseExtractedTable(t);
        if (parsed && parsed.length > 0) {
          rates.push(...parsed);
        }
      }

      if (rates.length === 0) {
        rates = await LayeredExtractor.extractFromUnstructuredText(page);
      }
    }

    return {
      fd_rates: rates,
      minimum_deposit: 10000.0,
      maximum_deposit: 20000000.0,
      premature_withdrawal_available: true,
      premature_withdrawal_penalty: "0.50% to 1.00% depending on tenure and deposit value",
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
