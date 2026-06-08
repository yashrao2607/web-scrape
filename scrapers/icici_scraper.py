from scrapers.base_scraper import BaseScraper
from core.extractor import LayeredExtractor
from typing import Dict, Any

class ICICIScraper(BaseScraper):
    """
    Scraper implementation for ICICI Bank.
    """
    async def scrape(self, page: Any) -> Dict[str, Any]:
        self.logger.info("starting_icici_scrape")
        
        if self.url.lower().endswith(".pdf"):
            import tempfile
            pdf_dir = tempfile.gettempdir()
            response = await page.context.request.get(self.url)
            temp_pdf = f"{pdf_dir}/icici_rates.pdf"
            with open(temp_pdf, "wb") as f:
                f.write(await response.body())
            rates = LayeredExtractor.extract_from_pdf(temp_pdf)
        else:
            try:
                await page.wait_for_selector("table, [role='table']", timeout=5000)
            except Exception:
                self.logger.warning("timeout_waiting_for_tables_attempting_anyway")
            
            tables = await LayeredExtractor.extract_from_page(page)
            rates = []
            for t in tables:
                parsed = LayeredExtractor.parse_extracted_table(t)
                if parsed:
                    rates.extend(parsed)
            
            if not rates:
                rates = await LayeredExtractor.extract_from_unstructured_text(page)
                
        return {
            "fd_rates": rates,
            "minimum_deposit": 10000.0,
            "maximum_deposit": 20000000.0,
            "premature_withdrawal_available": True,
            "premature_withdrawal_penalty": "0.50% to 1.00% depending on tenure and deposit value",
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
