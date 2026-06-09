import asyncio
from playwright.async_api import async_playwright
import sys
import re

async def run():
    sys.stdout.reconfigure(encoding='utf-8')
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        
        url = "https://www.axisbank.com/interest-rates"
        try:
            print(f"Navigating to {url}...")
            await page.goto(url, wait_until="load", timeout=30000)
            await page.wait_for_timeout(2000)
            
            html = await page.content()
            print("HTML Length:", len(html))
            
            # Search for any PDF URLs in the HTML source using regex
            pdf_urls = re.findall(r'https?://[^\s"\'<>]*?\.pdf[^\s"\'<>]*?', html, re.IGNORECASE)
            print(f"Found {len(pdf_urls)} PDF URLs in raw HTML:")
            for p_url in set(pdf_urls):
                if "deposit" in p_url.lower() or "interest" in p_url.lower() or "rate" in p_url.lower():
                    print("  ", p_url)
            
            # Print text content containing "deposit" or "fixed" or "interest"
            print("\nSearching for interest/deposit sections in text:")
            # Find elements with text containing fixed deposit
            locators = page.locator("xpath=//*[contains(text(), 'Fixed Deposit') or contains(text(), 'Term Deposit')]")
            count = await locators.count()
            print(f"Found {count} elements with 'Fixed Deposit' or 'Term Deposit'")
            for i in range(min(count, 15)):
                el = locators.nth(i)
                tag = await el.evaluate("node => node.tagName")
                text = await el.inner_text()
                print(f"  Tag: {tag} | Text: {text[:100].strip()}")
                
        except Exception as e:
            print("Error:", e)
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
