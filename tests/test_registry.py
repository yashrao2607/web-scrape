from scrapers.registry import get_scraper_for_bank
from scrapers.hdfc_scraper import HDFCScraper
from scrapers.sbi_scraper import SBIScraper
from scrapers.icici_scraper import ICICIScraper

def test_get_scraper_for_bank_exact():
    assert get_scraper_for_bank("HDFC Bank") is HDFCScraper
    assert get_scraper_for_bank("SBI") is SBIScraper
    assert get_scraper_for_bank("ICICI Bank") is ICICIScraper

def test_get_scraper_for_bank_fuzzy():
    assert get_scraper_for_bank("hdfc") is HDFCScraper
    assert get_scraper_for_bank("state bank of india (sbi)") is SBIScraper
    assert get_scraper_for_bank("icici") is ICICIScraper

def test_get_scraper_for_bank_not_found():
    assert get_scraper_for_bank("Unknown Bank") is None
