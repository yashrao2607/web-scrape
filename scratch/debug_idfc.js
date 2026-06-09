import { PlaywrightBrowserManager } from '../core/browser.js';
import { getScraperForBank } from '../scrapers/registry.js';

async function main() {
  const browserManager = new PlaywrightBrowserManager(true);
  await browserManager.start();
  const page = await browserManager.getPage();

  const bankName = "IDFC First Bank";
  const url = "https://www.idfcfirstbank.com/personal-banking/deposits/fixed-deposit/fd-interest-rates";

  try {
    await browserManager.navigateTo(page, url);
    const ScraperCls = getScraperForBank(bankName);
    const scraper = new ScraperCls(bankName, url);
    const rawData = await scraper.scrape(page);

    const errors = [];
    const validated = scraper.processAndValidate(rawData, errors);

    console.log("=== RAW SCRAPED RATES FOR IDFC ===");
    console.log(`Total raw: ${rawData.fd_rates.length}`);
    rawData.fd_rates.forEach((r, idx) => {
      console.log(`Row ${idx}: Tenure: "${r.tenure_raw}" | Gen: "${r.general_raw}" | Sr: "${r.senior_raw}"`);
    });

    console.log("=== VALIDATED RATES FOR IDFC ===");
    console.log(`Total validated: ${validated.fd_rates.length}`);
    validated.fd_rates.forEach((r, idx) => {
      console.log(`Row ${idx}: Tenure: "${r.tenure}" | Gen: ${r.general_rate}% | Sr: ${r.senior_citizen_rate}% | Prod: ${r.product_type} | Category: ${r.deposit_category} | Segment: ${r.customer_segment} | Callable: ${r.callable} | Scheme: ${r.scheme_type}`);
    });
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await page.close();
    await browserManager.close();
  }
}

main();
