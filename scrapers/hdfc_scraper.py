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
            # Let's perform a wait check for tables or text loading
            try:
                await page.wait_for_selector("table, [role='table']", timeout=5000)
            except Exception:
                self.logger.warning("timeout_waiting_for_tables_attempting_anyway")
            
            # Level 1 & 2: Extract tables
            tables = await LayeredExtractor.extract_from_page(page)
            rates = []
            for t in tables:
                parsed = LayeredExtractor.parse_extracted_table(t)
                if parsed:
                    rates.extend(parsed)
            
            # Level 3 & 4: Fallback to unstructured text if tables are empty
            if not rates:
                rates = await LayeredExtractor.extract_from_unstructured_text(page)
        
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
