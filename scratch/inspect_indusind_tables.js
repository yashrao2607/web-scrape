import { PlaywrightBrowserManager } from '../core/browser.js';
import fs from 'fs';

async function main() {
  const browserManager = new PlaywrightBrowserManager(true);
  await browserManager.start();
  const page = await browserManager.getPage();

  const url = "https://www.indusind.bank.in/in/en/personal/rates.html";

  try {
    await browserManager.navigateTo(page, url);
    
    // Evaluate in browser context to find all tables
    const tableInfos = await page.evaluate(() => {
      const tables = Array.from(document.querySelectorAll('table'));
      return tables.map((t, idx) => {
        // Find preceding header or section text
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
        
        // If still empty, check parent elements' headers
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

        // Check visibility
        const style = window.getComputedStyle(t);
        const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && t.getBoundingClientRect().width > 0;

        // Get first row or headers to identify
        const headers = Array.from(t.querySelectorAll('tr')).slice(0, 2).map(tr => tr.innerText.replace(/\s+/g, ' ').trim());

        return {
          index: idx,
          headingText: headingText.replace(/\s+/g, ' ').slice(0, 100),
          tagName: t.tagName,
          isVisible,
          display: style.display,
          headers
        };
      });
    });

    console.log("=== TABLE INFO FROM INDUSIND PAGE ===");
    fs.writeFileSync('scratch/indusind_tables.json', JSON.stringify(tableInfos, null, 2), 'utf8');
    console.log("Wrote scratch/indusind_tables.json");

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await page.close();
    await browserManager.close();
  }
}

main();

