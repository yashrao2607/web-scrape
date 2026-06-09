import asyncio
from playwright.async_api import async_playwright
import tempfile
import sys

async def run():
    sys.stdout.reconfigure(encoding='utf-8')
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 800}
        )
        page = await context.new_page()
        
        try:
            print("Navigating to homepage first...")
            response = await page.goto("https://www.axisbank.com/", wait_until="load", timeout=30000)
            print("Homepage Status:", response.status)
            print("Homepage Title:", await page.title())
            await page.wait_for_timeout(5000)
            
            # Try loading interest rates page
            print("Navigating to interest-rates page...")
            response = await page.goto("https://www.axisbank.com/retail/interest-rates", wait_until="load", timeout=30000)
            print("Interest rates page Status:", response.status)
            print("Interest rates page Title:", await page.title())
            
            await page.wait_for_timeout(2000)
            html = await page.content()
            print("Content Length:", len(html))
            
        except Exception as e:
            print("Error:", e)
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
