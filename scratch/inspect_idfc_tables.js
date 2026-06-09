import { PlaywrightBrowserManager } from '../core/browser.js';
import fs from 'fs';

async function main() {
  const browserManager = new PlaywrightBrowserManager(true);
  await browserManager.start();
  const page = await browserManager.getPage();

  const url = "https://www.idfcfirstbank.com/personal-banking/deposits/fixed-deposit/fd-interest-rates";

  try {
    await browserManager.navigateTo(page, url);
    
    // Evaluate in browser context to find all tables
    const tableInfos = await page.evaluate(() => {
      const tables = Array.from(document.querySelectorAll('table'));
      return tables.map((t, idx) => {
        let headingText = "";
        let sibling = t.previousElementSibling;
        let limit = 0;
        while (!headingText && sibling && limit < 10) {
          if (/h[1-6]/i.test(sibling.tagName) || sibling.classList.contains('title') || sibling.innerText.trim()) {
            headingText = sibling.innerText.trim();
          }
          sibling = sibling.previousElementSibling;
          limit++;
        }
        
        if (!headingText) {
          let parent = t.parentElement;
          let pLimit = 0;
          while (!headingText && parent && pLimit < 5) {
            const h = parent.querySelector('h1, h2, h3, h4, h5, h6, .title, .heading');
            if (h) {
              headingText = h.innerText.trim();
            }
            parent = parent.parentElement;
            pLimit++;
          }
        }

        const style = window.getComputedStyle(t);
        const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && t.getBoundingClientRect().width > 0;

        const rows = Array.from(t.querySelectorAll('tr')).map(tr => 
          Array.from(tr.querySelectorAll('th, td')).map(cell => cell.innerText.replace(/\s+/g, ' ').trim())
        );

        return {
          index: idx,
          headingText: headingText.replace(/\s+/g, ' ').slice(0, 100),
          tagName: t.tagName,
          isVisible,
          display: style.display,
          rowCount: rows.length,
          rows: rows.slice(0, 15) // print first 15 rows
        };
      });
    });

    console.log("=== TABLE INFO FROM IDFC FIRST PAGE ===");
    fs.writeFileSync('scratch/idfc_tables.json', JSON.stringify(tableInfos, null, 2), 'utf8');
    console.log("Wrote scratch/idfc_tables.json");

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await page.close();
    await browserManager.close();
  }
}

main();
