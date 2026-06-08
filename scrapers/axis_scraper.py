import tempfile
from scrapers.base_scraper import BaseScraper
from core.extractor import LayeredExtractor
from typing import Dict, Any

class AxisScraper(BaseScraper):
    """
    Scraper implementation for Axis Bank (PDF-based).
    """
    async def scrape(self, page: Any) -> Dict[str, Any]:
        self.logger.info("starting_axis_scrape")
        
        # Axis Bank publishes interest rates as a PDF.
        # We download the PDF directly using context request to bypass Playwright's download loop.
        pdf_dir = tempfile.gettempdir()
        temp_pdf = f"{pdf_dir}/axis_rates.pdf"
        
        try:
            response = await page.context.request.get(self.url)
            with open(temp_pdf, "wb") as f:
                f.write(await response.body())
            self.logger.info("downloaded_axis_pdf", path=temp_pdf)
            rates = LayeredExtractor.extract_from_pdf(temp_pdf)
        except Exception as e:
            self.logger.error("axis_pdf_download_or_parse_failed", error=str(e))
            rates = []
            
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
            "effective_from": None,
            "effective_to": None,
            "scraper_version": "1.0.0"
        }
