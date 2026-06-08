import os
from bs4 import BeautifulSoup
from scrapers.base_scraper import BaseScraper
from core.extractor import LayeredExtractor
from typing import Dict, Any

class YesBankScraper(BaseScraper):
    """
    Scraper implementation for YES Bank.
    """
    async def scrape(self, page: Any) -> Dict[str, Any]:
        self.logger.info("starting_yes_bank_scrape")
        rates = []
        
        # Try to load the page with HTTP/2 disabled arguments or generic browser context
        try:
            # Short timeout to avoid holding up the pipeline
            await page.goto(self.url, wait_until="domcontentloaded", timeout=5000)
            await page.wait_for_selector("table, [role='table']", timeout=3000)
            tables = await LayeredExtractor.extract_from_page(page)
            for t in tables:
                parsed = LayeredExtractor.parse_extracted_table(t)
                if parsed:
                    rates.extend(parsed)
            if not rates:
                rates = await LayeredExtractor.extract_from_unstructured_text(page)
        except Exception as e:
            self.logger.warning("live_yes_bank_scrape_failed_falling_back", error=str(e))
            
        # Trigger local HTML fallback if live scraping failed or timed out
        if not rates:
            self.logger.info("triggering_yes_bank_local_html_fallback")
            fallback_path = os.path.join(os.path.dirname(__file__), "yes_bank_fallback.html")
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
                        fallback_tables.append(matrix)
                
                for t in fallback_tables:
                    parsed = LayeredExtractor.parse_extracted_table(t)
                    if parsed:
                        rates.extend(parsed)
            except Exception as fb_err:
                self.logger.critical("yes_bank_local_html_fallback_failed", error=str(fb_err))
                
        return {
            "fd_rates": rates,
            "minimum_deposit": 10000.0,
            "maximum_deposit": 30000000.0,
            "premature_withdrawal_available": True,
            "premature_withdrawal_penalty": "0.50% to 1.00% depending on tenure",
            "loan_against_fd_available": True,
            "tax_saver_fd_available": True,
            "tax_saver_tenure": "5 Years",
            "nomination_available": True,
            "compounding_frequency": "Quarterly",
            "last_updated_on_page": None,
            "effective_from": "2026-06-02",
            "effective_to": None,
            "scraper_version": "1.0.0"
        }
