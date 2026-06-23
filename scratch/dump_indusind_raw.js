import { PlaywrightBrowserManager } from '../core/browser.js';
import { getScraperForBank } from '../scrapers/registry.js';

async function main() {
  const browserManager = new PlaywrightBrowserManager(true);
  await browserManager.start();
  const page = await browserManager.getPage();

  const bankName = "IndusInd Bank";
  const url = "https://www.indusind.bank.in/in/en/personal/rates.html";

  try {
    await browserManager.navigateTo(page, url);
    const ScraperCls = getScraperForBank(bankName);
    const scraper = new ScraperCls(bankName, url);
    const rawData = await scraper.scrape(page);

    const errors = [];
    const validated = scraper.processAndValidate(rawData, errors);

    console.log("=== RAW EXTRACTED RATES FOR INDUSIND ===");
    console.log(`Total rates: ${validated.fd_rates.length}`);

    validated.fd_rates.forEach((r, idx) => {
      console.log(`Row ${idx}:`);
      console.log(`  Tenure: "${r.tenure}"`);
      console.log(`  Rate: ${r.general_rate}% (Sr: ${r.senior_citizen_rate}%)`);
      console.log(`  Section: "${r.section_name}"`);
      console.log(`  Table: "${r.table_name}"`);
      console.log(`  Product Type: ${r.product_type}`);
      console.log(`  Deposit Category: ${r.deposit_category}`);
      console.log(`  Customer Segment: ${r.customer_segment}`);
      console.log(`  Callable: ${r.callable}`);
      console.log(`  Scheme Type: ${r.scheme_type}`);
    });
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await page.close();
    await browserManager.close();
  }
}

main();
