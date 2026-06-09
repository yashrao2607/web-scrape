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
        
        urls = [
            "https://www.axisbank.com/shareholders-corner/financial-results/interest-rates",
            "https://www.axisbank.com/retail/interest-rates",
            "https://www.axisbank.com/interest-rates-charges"
        ]
        
        for url in urls:
            try:
                print(f"\nNavigating to {url}...")
                await page.goto(url, wait_until="load", timeout=30000)
                await page.wait_for_timeout(2000)
                links = await page.eval_on_selector_all("a", "elements => elements.map(el => ({text: el.innerText, href: el.href}))")
                
                print(f"Found {len(links)} links on page.")
                target_links = []
                for l in links:
                    txt = l['text'].lower()
                    href = l['href'].lower()
                    if any(k in txt or k in href for k in ["deposit", "fixed", "interest", "rate"]):
                        target_links.append(l)
                        
                print(f"Found {len(target_links)} target links:")
                for l in target_links[:40]:  # Limit print to 40
                    print(f"  Text: {l['text'].strip()} | Link: {l['href']}")
            except Exception as e:
                print(f"Error on {url}: {e}")
                
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
