from scrapers.base_scraper import BaseScraper
from core.extractor import LayeredExtractor
from typing import Dict, Any

class HDFCScraper(BaseScraper):
    """
    Scraper implementation for HDFC Bank.
    """
    async def scrape(self, page: Any) -> Dict[str, Any]:
        self.logger.info("starting_hdfc_scrape")
        
        # 1. Check if the URL points to a PDF
        if self.url.lower().endswith(".pdf"):
            # Download PDF and extract
            import tempfile
            from core.browser import PlaywrightBrowserManager
            # Since we receive the page, let's download the PDF using the page context
            pdf_dir = tempfile.gettempdir()
            # Navigate to the page or download directly
            local_pdf_path = await page.context.request.get(self.url)
            # Write to a temporary file
            temp_pdf = f"{pdf_dir}/hdfc_rates.pdf"
            with open(temp_pdf, "wb") as f:
                f.write(await local_pdf_path.body())
                
            rates = LayeredExtractor.extract_from_pdf(temp_pdf)
        else:
            # Standard HTML/JS flow
            rates = []
            
            # Check if navigation failed or page is blank
            page_url = ""
            try:
                page_url = page.url
            except Exception:
                pass
                
            if not page_url or page_url == "about:blank":
                self.logger.warning("page_is_blank_using_local_html_fallback")
            else:
                try:
                    await page.wait_for_selector("table, [role='table']", timeout=5000)
                    tables = await LayeredExtractor.extract_from_page(page)
                    for t in tables:
                        parsed = LayeredExtractor.parse_extracted_table(t)
                        if parsed:
                            rates.extend(parsed)
                    if not rates:
                        rates = await LayeredExtractor.extract_from_unstructured_text(page)
                except Exception as e:
                    self.logger.warning("live_scrape_failed_falling_back_to_local_html", error=str(e))

            # Trigger Local HTML Fallback if live scrape yielded no rates
            if not rates:
                self.logger.info("triggering_hdfc_local_html_fallback")
                import os
                from bs4 import BeautifulSoup
                fallback_path = os.path.join(os.path.dirname(__file__), "hdfc_fallback.html")
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
                                "section_name": heading or "HDFC Fallback Rates",
                                "table_name": table.find("caption").get_text(strip=True) if table.find("caption") else "Retail Fixed Deposit Rates"
                            })
                            
                    for t in fallback_tables:
                        parsed = LayeredExtractor.parse_extracted_table(t)
                        if parsed:
                            rates.extend(parsed)
                except Exception as fb_err:
                    self.logger.critical("hdfc_local_html_fallback_failed", error=str(fb_err))
        
        # Define HDFC metadata
        return {
            "fd_rates": rates,
            "minimum_deposit": 5000.0,
            "maximum_deposit": 20000000.0, # 2 Cr limit for domestic retail deposits
            "premature_withdrawal_available": True,
            "premature_withdrawal_penalty": "1.0% interest rate penalty on premature closure",
            "loan_against_fd_available": True,
            "tax_saver_fd_available": True,
            "tax_saver_tenure": "5 Years",
            "nomination_available": True,
            "compounding_frequency": "Quarterly",
            "last_updated_on_page": None,
            "effective_from": None,
            "effective_to": None,
            "scraper_version": "1.0.0"
        }
