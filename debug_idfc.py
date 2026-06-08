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
        print("Navigating to IDFC First Bank...")
        await page.goto("https://www.idfcfirstbank.com/personal-banking/deposits/fixed-deposit/fd-interest-rates", wait_until="load", timeout=60000)
        await page.wait_for_timeout(3000)
        
        html = await page.content()
        soup = BeautifulSoup(html, "html.parser")
        
        tables = soup.find_all("table")
        print(f"Found {len(tables)} tables on IDFC First page.")
        
        for idx, t in enumerate(tables):
            print(f"\nTable {idx+1}:")
            rows = t.find_all("tr")
            print(f"  Row count: {len(rows)}")
            for r_idx, r in enumerate(rows[:5]):
                cells = [c.get_text(strip=True) for c in r.find_all(["th", "td"])]
                print(f"    Row {r_idx+1}: {cells}")
                
        # Also print some page text to search for rates
        text = await page.inner_text("body")
        print("\nChecking for '7 days' or '180 days' in text:")
        matches = [line.strip() for line in text.split("\n") if "7 days" in line.lower() or "180 days" in line.lower()]
        for m in matches[:10]:
            print(f"  Line: {m}")
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
