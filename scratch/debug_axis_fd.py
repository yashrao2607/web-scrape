import asyncio
from playwright.async_api import async_playwright
import sys

async def run():
    sys.stdout.reconfigure(encoding='utf-8')
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        
        url = "https://www.axisbank.com/fixed-deposit-interest-rate"
        try:
            print(f"Navigating to {url}...")
            await page.goto(url, wait_until="load", timeout=30000)
            await page.wait_for_timeout(2000)
            
            # Check if there are tables
            tables_count = await page.locator("table").count()
            print(f"Number of HTML tables found: {tables_count}")
            
            # Check all links ending in .pdf or containing interest rates
            links = await page.eval_on_selector_all("a", "elements => elements.map(el => ({text: el.innerText, href: el.href}))")
            print(f"Total links on page: {len(links)}")
            
            pdf_links = [l for l in links if ".pdf" in l['href'].lower() or "deposit" in l['href'].lower() and "rate" in l['href'].lower()]
            print("Filtered links:")
            for l in pdf_links:
                print(f"  Text: {l['text'].strip()} | Link: {l['href']}")
                
        except Exception as e:
            print("Error:", e)
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
