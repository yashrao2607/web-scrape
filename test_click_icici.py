import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        await page.goto("https://www.icicibank.com/personal-banking/deposits/fixed-deposit/fd-interest-rates", wait_until="load", timeout=60000)
        await page.wait_for_timeout(3000)
        
        import sys
        sys.stdout.reconfigure(encoding='utf-8')
        print("Clicking Less than 3 Cr. button...")
        # Locating button using XPath or text
        btn = page.locator("button:has-text('Less than')").filter(has_text="3 Cr")
        if await btn.count() > 0:
            await btn.first.click()
            print("Clicked! Waiting for table update...")
            await page.wait_for_timeout(3000)
            
            # Print table content now
            tables = await page.locator("table").all()
            print(f"Found {len(tables)} tables after click.")
            for idx, table in enumerate(tables):
                rows = await table.locator("tr").all()
                print(f"Table {idx+1} (Rows: {len(rows)}):")
                for r_idx, row in enumerate(rows[:15]):
                    cells = await row.locator("th, td").all()
                    texts = [await cell.inner_text() for cell in cells]
                    print(f"  Row {r_idx+1}: {[t.strip().replace(chr(160), ' ') for t in texts]}")
        else:
            print("Button not found!")
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
