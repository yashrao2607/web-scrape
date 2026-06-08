from typing import Dict, Type, Optional
from scrapers.base_scraper import BaseScraper

# We will import the actual classes dynamically or directly.
# Using standard direct import:
from scrapers.hdfc_scraper import HDFCScraper
from scrapers.sbi_scraper import SBIScraper
from scrapers.icici_scraper import ICICIScraper

SCRAPER_REGISTRY: Dict[str, Type[BaseScraper]] = {
    "HDFC Bank": HDFCScraper,
    "SBI": SBIScraper,
    "ICICI Bank": ICICIScraper,
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
