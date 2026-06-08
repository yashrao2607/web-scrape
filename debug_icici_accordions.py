import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        print("Navigating to ICICI...")
        await page.goto("https://www.icicibank.com/personal-banking/deposits/fixed-deposit/fd-interest-rates", wait_until="load", timeout=60000)
        await page.wait_for_timeout(3000)
        
        # 1. Print all headings (h1, h2, h3, h4)
        print("\n--- HEADINGS ---")
        headings = await page.locator("h1, h2, h3, h4, h5").all()
        for idx, h in enumerate(headings):
            text = await h.inner_text()
            print(f"Heading {idx+1}: {text.strip()}")
            
        # 2. Print all buttons and links that might toggle accordions/tabs
        print("\n--- BUTTONS / COLLAPSIBLES / TABS ---")
        elements = await page.locator("button, a.accordion-toggle, .accordion-title, [role='tab']").all()
        for idx, el in enumerate(elements):
            text = await el.inner_text()
            tag = await el.evaluate("el => el.tagName")
            clazz = await el.get_attribute("class")
            print(f"El {idx+1}: tag={tag}, class={clazz}, text={text.strip()}")
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
