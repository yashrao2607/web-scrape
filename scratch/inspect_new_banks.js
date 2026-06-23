import { PlaywrightBrowserManager } from '../core/browser.js';
import { LayeredExtractor } from '../core/extractor.js';
import fs from 'fs';

const urls = [
  ["Canara Bank", "https://www.canarabank.bank.in/pages/deposit-interest-rates"],
  ["Bank of Baroda", "https://www.bankbazaar.com/fixed-deposit/bank-of-baroda-fixed-deposit-rate.html"],
  ["RBL Bank", "https://www.bankbazaar.com/fixed-deposit/rbl-bank-fixed-deposit-rate.html"],
  ["IDBI Bank", "https://www.bankbazaar.com/fixed-deposit/idbi-fixed-deposit-rate.html"],
  ["Shriram Finance", "https://www.bankbazaar.com/fixed-deposit/shriram-finance-fixed-deposit-rate.html"],
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
      console.log(`Table ${i}: section="${t.section_name}", name="${t.table_name}", rows=${t.matrix.length}, cols=${t.matrix[0]?.length || 0}`);
      
      // Show first 3 rows
      for (let r = 0; r < Math.min(3, t.matrix.length); r++) {
        console.log(`  Row ${r}: ${JSON.stringify(t.matrix[r])}`);
      }
      
      // Try parsing
      const parsed = LayeredExtractor.parseExtractedTable(t);
      console.log(`  Parsed rates: ${parsed?.length || 0}`);
      if (parsed && parsed.length > 0) {
        console.log(`  First: ${JSON.stringify(parsed[0])}`);
        console.log(`  Last: ${JSON.stringify(parsed[parsed.length - 1])}`);
      }
    }

    // Try unstructured as fallback
    if (tables.length === 0 || tables.every(t => LayeredExtractor.parseExtractedTable(t).length === 0)) {
      console.log("Trying unstructured text fallback...");
      const unstructured = await LayeredExtractor.extractFromUnstructuredText(page);
      console.log(`Unstructured rates: ${unstructured.length}`);
      if (unstructured.length > 0) {
        console.log(`First: ${JSON.stringify(unstructured[0])}`);
        console.log(`Last: ${JSON.stringify(unstructured[unstructured.length - 1])}`);
      }
    }
  } catch (e) {
    console.log(`Error: ${e.message}`);
  } finally {
    await page.close();
  }
}

await browser.close();
console.log("\nDone.");
