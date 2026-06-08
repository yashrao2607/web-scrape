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
        await page.goto("https://www.icicibank.com/personal-banking/deposits/fixed-deposit/fd-interest-rates", wait_until="load", timeout=60000)
        await page.wait_for_timeout(3000)
        
        # Write report to file with UTF-8 encoding
        with open("icici_debug_output.txt", "w", encoding="utf-8") as f:
            f.write("=== ICICI PAGE STRUCTURE ===\n")
            
            # Print page title
            title = await page.title()
            f.write(f"Title: {title}\n\n")
            
            # Print all button / clickables
            f.write("=== BUTTONS AND LINKS ===\n")
            buttons = await page.locator("button, a, [role='button'], [role='tab']").all()
            for idx, btn in enumerate(buttons):
                try:
                    text = await btn.inner_text()
                    id_attr = await btn.get_attribute("id")
                    class_attr = await btn.get_attribute("class")
                    if text.strip():
                        f.write(f"Btn {idx}: tag={await btn.evaluate('el => el.tagName')}, id={id_attr}, class={class_attr}, text={text.strip()}\n")
                except Exception as e:
                    f.write(f"Btn {idx}: Error reading: {str(e)}\n")
            
            # Print all tables
            f.write("\n=== TABLES ===\n")
            tables = await page.locator("table").all()
            f.write(f"Found {len(tables)} tables.\n")
            for idx, table in enumerate(tables):
                f.write(f"\nTable {idx+1}:\n")
                rows = await table.locator("tr").all()
                f.write(f"  Row count: {len(rows)}\n")
                for r_idx, row in enumerate(rows):
                    cells = await row.locator("th, td").all()
                    cell_texts = [await cell.inner_text() for cell in cells]
                    cell_texts_clean = [t.strip().replace("\n", " ") for t in cell_texts]
                    f.write(f"    Row {r_idx+1}: {cell_texts_clean}\n")
            
        await browser.close()
    print("Done! Output written to icici_debug_output.txt")

if __name__ == "__main__":
    asyncio.run(run())
