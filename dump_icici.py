import asyncio
from playwright.async_api import async_playwright
from bs4 import BeautifulSoup

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        print("Navigating to ICICI...")
        await page.goto("https://www.icicibank.com/personal-banking/deposits/fixed-deposit/fd-interest-rates", wait_until="load", timeout=60000)
        
        # Give it a bit of time to render dynamic content
        await page.wait_for_timeout(3000)
        
        html = await page.content()
        soup = BeautifulSoup(html, "html.parser")
        
        print("\nSearching for all tables on the page:")
        tables = soup.find_all("table")
        print(f"Found {len(tables)} table elements.")
        
        for idx, t in enumerate(tables):
            print(f"\nTable {idx+1}:")
            # Print first 2 rows
            rows = t.find_all("tr")
            print(f"  Row count: {len(rows)}")
            for r_idx, r in enumerate(rows[:5]):
                cells = [c.get_text(strip=True) for c in r.find_all(["th", "td"])]
                print(f"    Row {r_idx+1}: {cells}")
                
        # Also print some of the text to see if there are standard rates there
        text = await page.inner_text("body")
        print("\nChecking for '7 days' or '29 days' in text:")
        matches = [line.strip() for line in text.split("\n") if "7 days" in line.lower() or "2.75" in line or "3.00" in line]
        for m in matches[:10]:
            print(f"  Line: {m}")
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
