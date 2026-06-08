import asyncio
import tempfile
import sys
from playwright.async_api import async_playwright
from core.extractor import LayeredExtractor

async def run():
    sys.stdout.reconfigure(encoding='utf-8')
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        url = "https://www.axis.bank.in/docs/default-source/default-document-library/interest-rates/domestic-fixed-deposits-06-june-26.pdf?sfvrsn=5eb4a7d0_1"
        print(f"Downloading Axis PDF from {url}...")
        
        pdf_dir = tempfile.gettempdir()
        temp_pdf = f"{pdf_dir}/axis_rates_debug.pdf"
        
        try:
            response = await page.context.request.get(url)
            body = await response.body()
            print(f"Downloaded PDF size: {len(body)} bytes")
            with open(temp_pdf, "wb") as f:
                f.write(body)
                
            import pdfplumber
            with pdfplumber.open(temp_pdf) as pdf:
                print(f"Total PDF pages: {len(pdf.pages)}")
                for page_num, pdf_page in enumerate(pdf.pages):
                    text = pdf_page.extract_text()
                    print(f"\n--- Page {page_num+1} Text Sample ---")
                    if text:
                        print(text[:400])
                    else:
                        print("[No text found]")
                        
                    tables = pdf_page.extract_tables()
                    print(f"Found {len(tables)} tables on Page {page_num+1}.")
                    for t_idx, table in enumerate(tables):
                        print(f"  Table {t_idx+1} Row Count: {len(table)}")
                        # Print first row of each table
                        if table:
                            print(f"    First row: {table[0]}")
                            
        except Exception as e:
            print(f"Failed to download or parse PDF: {str(e)}")
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
