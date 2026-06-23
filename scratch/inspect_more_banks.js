import { PlaywrightBrowserManager } from '../core/browser.js';
import { LayeredExtractor } from '../core/extractor.js';

const urls = [
  ["Bank of India", "https://www.bankbazaar.com/fixed-deposit/bank-of-india-fixed-deposit-rate.html"],
  ["Bank of Maharashtra", "https://www.bankbazaar.com/fixed-deposit/bank-of-maharashtra-fixed-deposit-rate.html"],
  ["Indian Bank", "https://www.bankbazaar.com/fixed-deposit/indian-bank-fixed-deposit-rate.html"],
  ["Central Bank of India", "https://www.bankbazaar.com/fixed-deposit/central-bank-of-india-fixed-deposit-rate.html"],
  ["Bandhan Bank", "https://www.bankbazaar.com/fixed-deposit/bandhan-bank-fixed-deposit-rate.html"],
  ["PNB Housing Finance", "https://www.bankbazaar.com/fixed-deposit/pnbhfl-fixed-deposit-rate.html"],
  ["KTDFC", "https://www.bankbazaar.com/fixed-deposit/ktdfc-fixed-deposit-rate.html"],
  ["LIC Housing Finance", "https://www.bankbazaar.com/fixed-deposit/lic-housing-fixed-deposit-rate.html"],
];

const browser = new PlaywrightBrowserManager(true);
await browser.start();

for (const [name, url] of urls) {
  console.log(`\n========== ${name} ==========`);
  const page = await browser.getPage();
  try {
    await browser.navigateTo(page, url);
    await page.waitForTimeout(3000);

    const tables = await LayeredExtractor.extractFromPage(page);
    console.log(`Found ${tables.length} tables`);
    
    for (let i = 0; i < tables.length; i++) {
      const t = tables[i];
      console.log(`Table ${i}: section="${t.section_name?.substring(0, 80)}", rows=${t.matrix.length}, cols=${t.matrix[0]?.length || 0}`);
      
      if (t.matrix.length > 0) {
        console.log(`  Row 0: ${JSON.stringify(t.matrix[0])}`);
        if (t.matrix.length > 1) console.log(`  Row 1: ${JSON.stringify(t.matrix[1])}`);
      }
      
      const parsed = LayeredExtractor.parseExtractedTable(t);
      console.log(`  Parsed rates: ${parsed?.length || 0}`);
      if (parsed && parsed.length > 0) {
        console.log(`  First: ${JSON.stringify(parsed[0], null, 0)}`);
        console.log(`  Last: ${JSON.stringify(parsed[parsed.length - 1], null, 0)}`);
      }
    }

    if (tables.length === 0 || tables.every(t => LayeredExtractor.parseExtractedTable(t).length === 0)) {
      console.log("Trying unstructured text fallback...");
      const unstructured = await LayeredExtractor.extractFromUnstructuredText(page);
      console.log(`Unstructured rates: ${unstructured.length}`);
    }
  } catch (e) {
    console.log(`Error: ${e.message}`);
  } finally {
    await page.close();
  }
}

await browser.close();
console.log("\nDone.");
