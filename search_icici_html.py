import asyncio
from playwright.async_api import async_playwright
import re

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        print("Navigating to ICICI...")
        await page.goto("https://www.icicibank.com/personal-banking/deposits/fixed-deposit/fd-interest-rates", wait_until="load", timeout=60000)
        await page.wait_for_timeout(3000)
        
        # Check all iframe sources
        iframes = page.frames
        print(f"Total frames: {len(iframes)}")
        for i, f in enumerate(iframes):
            print(f"Frame {i}: name={f.name}, url={f.url}")
            
        html = await page.content()
        
        # Find occurrences of standard interest rates or tenures in HTML
        # Let's search for "7 days"
        occurrences = [m.start() for m in re.finditer(r"7\s*days", html, re.IGNORECASE)]
        print(f"Found {len(occurrences)} occurrences of '7 days'")
        for idx, pos in enumerate(occurrences[:5]):
            start = max(0, pos - 100)
            end = min(len(html), pos + 100)
            print(f"Occurrence {idx+1}: {html[start:end]!r}\n")
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
