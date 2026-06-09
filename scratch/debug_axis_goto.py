import asyncio
from playwright.async_api import async_playwright
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
        
        url = "https://www.axis.bank.in/docs/default-source/default-document-library/interest-rates/domestic-fixed-deposits-06-june-26.pdf?sfvrsn=5eb4a7d0_1"
        try:
            print("Navigating to axis.bank.in PDF directly...")
            response = await page.goto(url, wait_until="load", timeout=30000)
            print("PDF Page Status:", response.status)
            print("PDF Page Title:", await page.title())
            print("Final URL after redirects:", page.url)
            
            # Now let's try a different date or different URL on axis.bank.in
            # e.g., domestic-fixed-deposits.pdf
            url2 = "https://www.axis.bank.in/docs/default-source/interest-rate/interest-rates-on-deposits.pdf"
            print(f"\nNavigating to general deposits PDF: {url2}...")
            response2 = await page.goto(url2, wait_until="load", timeout=30000)
            print("Status:", response2.status)
            print("Final URL:", page.url)
            print("Title:", await page.title())
            
        except Exception as e:
            print("Error:", e)
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
