import { PlaywrightBrowserManager } from '../core/browser.js';

const browser = new PlaywrightBrowserManager(true);
await browser.start();
const page = await browser.getPage();
await browser.navigateTo(page, "https://www.bankbazaar.com/fixed-deposit/lic-housing-fixed-deposit-rate.html");
await page.waitForTimeout(3000);

// Find all H tags and their following tables
const structure = await page.evaluate(() => {
  const results = [];
  const headings = document.querySelectorAll("h1, h2, h3, h4, h5, h6");
  headings.forEach(h => {
    results.push({ tag: h.tagName, text: h.innerText.trim().substring(0, 80) });
  });
  
  // Also check tables with their preceding headings
  const tables = document.querySelectorAll("table");
  results.push("--- TABLES ---");
  tables.forEach((t, i) => {
    let prev = t.previousElementSibling;
    let heading = "";
    while (prev) {
      if (/^H[1-6]$/i.test(prev.tagName)) { heading = prev.innerText.trim(); break; }
      const h = prev.querySelector("h1, h2, h3, h4, h5, h6");
      if (h) { heading = h.innerText.trim(); break; }
      prev = prev.previousElementSibling;
    }
    results.push(`Table ${i}: heading="${heading.substring(0, 80)}", rows=${t.querySelectorAll("tr").length}`);
    const firstRow = t.querySelector("tr");
    if (firstRow) {
      const cells = firstRow.querySelectorAll("td, th");
      const cellTexts = Array.from(cells).map(c => c.innerText.trim());
      results.push(`  Header: ${JSON.stringify(cellTexts)}`);
    }
  });
  return results;
});

structure.forEach(s => console.log(s));
await browser.close();
