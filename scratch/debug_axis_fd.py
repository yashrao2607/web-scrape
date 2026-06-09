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
            response = await page.goto(url, wait_until="load", timeout=30000)
            print("Response Status:", response.status)
            print("Title:", await page.title())
            html = await page.content()
            print("Content Length:", len(html))
            print("Content Preview (first 1000 chars):")
            print(html[:1000])
        except Exception as e:
            print("Error:", e)
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
