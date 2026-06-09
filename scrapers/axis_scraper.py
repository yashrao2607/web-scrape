import tempfile
from scrapers.base_scraper import BaseScraper
from core.extractor import LayeredExtractor
from typing import Dict, Any

class AxisScraper(BaseScraper):
    """
    Scraper implementation for Axis Bank (PDF-based with Local HTML fallback).
    """
    async def scrape(self, page: Any) -> Dict[str, Any]:
        self.logger.info("starting_axis_scrape")
        
        rates = []
        is_fallback = False
        
        # Axis Bank publishes interest rates as a PDF.
        # We download the PDF directly using context request to bypass Playwright's download loop.
        pdf_dir = tempfile.gettempdir()
        temp_pdf = f"{pdf_dir}/axis_rates.pdf"
        
        try:
            response = await page.context.request.get(self.url)
            body = await response.body()
            if response.status == 200 and b"%PDF" in body:
                with open(temp_pdf, "wb") as f:
                    f.write(body)
                self.logger.info("downloaded_axis_pdf", path=temp_pdf)
                rates = LayeredExtractor.extract_from_pdf(temp_pdf)
            else:
                self.logger.warning("axis_pdf_download_returned_invalid_content", status=response.status)
        except Exception as e:
            self.logger.error("axis_pdf_download_or_parse_failed", error=str(e))
            
        # Trigger Local HTML Fallback if live PDF failed or yielded no rates
        if not rates:
            self.logger.info("triggering_axis_local_html_fallback")
            is_fallback = True
            import os
            from bs4 import BeautifulSoup
            fallback_path = os.path.join(os.path.dirname(__file__), "axis_fallback.html")
            try:
                with open(fallback_path, "r", encoding="utf-8") as f:
                    html_content = f.read()
                soup = BeautifulSoup(html_content, "html.parser")
                fallback_tables = []
                for table in soup.find_all("table"):
                    matrix = []
                    for tr in table.find_all("tr"):
                        row = [cell.get_text(strip=True) for cell in tr.find_all(["th", "td"])]
                        if row:
                            matrix.append(row)
                    if matrix:
                        heading = ""
                        prev = table.find_previous(["h1", "h2", "h3", "h4", "h5", "h6"])
                        if prev:
                            heading = prev.get_text(strip=True)
                        fallback_tables.append({
                            "matrix": matrix,
                            "section_name": heading or "Axis Fallback Rates",
                            "table_name": table.find("caption").get_text(strip=True) if table.find("caption") else "Retail Fixed Deposit Rates"
                        })
                
                for t in fallback_tables:
                    parsed = LayeredExtractor.parse_extracted_table(t)
                    if parsed:
                        rates.extend(parsed)
            except Exception as fb_err:
                self.logger.critical("axis_local_html_fallback_failed", error=str(fb_err))
                
        return {
            "fd_rates": rates,
            "minimum_deposit": 5000.0,
            "maximum_deposit": 50000000.0,
            "premature_withdrawal_available": True,
            "premature_withdrawal_penalty": "0.50% to 1.00% depending on tenure",
            "loan_against_fd_available": True,
            "tax_saver_fd_available": True,
            "tax_saver_tenure": "5 Years",
            "nomination_available": True,
            "compounding_frequency": "Quarterly",
            "last_updated_on_page": None,
            "effective_from": "2026-05-01",
            "effective_to": None,
            "is_fallback": is_fallback,
            "scraper_version": "1.0.0"
        }
