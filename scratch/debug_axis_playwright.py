import asyncio
from playwright.async_api import async_playwright
import tempfile
import sys

async def run():
    sys.stdout.reconfigure(encoding='utf-8')
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        url = "https://www.axisbank.com/docs/default-source/default-document-library/interest-rates/fixed-deposits/domestic-fixed-deposits.pdf"
        
        try:
            print("Requesting with playwright context...")
            response = await page.context.request.get(url)
            body = await response.body()
            print("Status:", response.status)
            print("Content Length:", len(body))
            print("First 200 bytes:", body[:200].decode('utf-8', errors='ignore'))
            
            temp_pdf = f"{tempfile.gettempdir()}/axis_rates_test.pdf"
            with open(temp_pdf, "wb") as f:
                f.write(body)
            print("Saved to:", temp_pdf)
        except Exception as e:
            print("Error:", e)
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
