import asyncio
from playwright.async_api import async_playwright
from bs4 import BeautifulSoup
import sys

async def run():
    sys.stdout.reconfigure(encoding='utf-8')
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        await page.goto("https://www.pnbindia.in/interest-rates-deposit.html", wait_until="load", timeout=60000)
        await page.wait_for_timeout(3000)
        
        html = await page.content()
        soup = BeautifulSoup(html, "html.parser")
        
        tables = soup.find_all("table")
        print(f"Total tables: {len(tables)}")
        
        for idx, t in enumerate(tables):
            text = t.get_text().lower()
            # Search for tables containing "7 to 14 days" or "7 days" or "domestic term deposits"
            if "7 to 14" in text or "7 days" in text or "domestic term" in text or "below 2 crore" in text or "less than 2 crore" in text:
                print(f"\n================ TABLE {idx+1} ================")
                rows = t.find_all("tr")
                print(f"Row count: {len(rows)}")
                for r_idx, r in enumerate(rows[:15]):
                    cells = [c.get_text(strip=True) for c in r.find_all(["th", "td"])]
                    print(f"  Row {r_idx+1}: {cells}")
                    
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
