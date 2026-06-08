from typing import Dict, Type, Optional
from scrapers.base_scraper import BaseScraper

# Import bank scrapers
from scrapers.hdfc_scraper import HDFCScraper
from scrapers.sbi_scraper import SBIScraper
from scrapers.icici_scraper import ICICIScraper
from scrapers.axis_scraper import AxisScraper
from scrapers.kotak_scraper import KotakScraper
from scrapers.pnb_scraper import PNBScraper
from scrapers.indusind_scraper import IndusIndScraper
from scrapers.yes_bank_scraper import YesBankScraper
from scrapers.idfc_first_scraper import IDFCFirstScraper
from scrapers.iob_scraper import IOBScraper
from scrapers.south_indian_bank_scraper import SouthIndianBankScraper
from scrapers.federal_bank_scraper import FederalBankScraper

SCRAPER_REGISTRY: Dict[str, Type[BaseScraper]] = {
    "HDFC Bank": HDFCScraper,
    "SBI": SBIScraper,
    "ICICI Bank": ICICIScraper,
    "Axis Bank": AxisScraper,
    "Kotak Mahindra Bank": KotakScraper,
    "PNB": PNBScraper,
    "IndusInd Bank": IndusIndScraper,
    "Yes Bank": YesBankScraper,
    "IDFC": IDFCFirstScraper,
    "Indian Overseas Bank": IOBScraper,
    "South Indian bank": SouthIndianBankScraper,
    "Federal bank": FederalBankScraper
}

def get_scraper_for_bank(bank_name: str) -> Optional[Type[BaseScraper]]:
    """
    Looks up and returns the scraper class configured for the given bank name.
    """
    # Try exact match, then substring match
    if bank_name in SCRAPER_REGISTRY:
        return SCRAPER_REGISTRY[bank_name]
        
    for name, scraper_cls in SCRAPER_REGISTRY.items():
        if name.lower() in bank_name.lower() or bank_name.lower() in name.lower():
            return scraper_cls
            
    return None
