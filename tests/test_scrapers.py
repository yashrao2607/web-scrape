import pytest
from unittest.mock import MagicMock
from scrapers.hdfc_scraper import HDFCScraper
from scrapers.sbi_scraper import SBIScraper
from scrapers.icici_scraper import ICICIScraper

def test_scraper_initialization():
    s = HDFCScraper("HDFC Bank", "http://hdfc.com")
    assert s.bank_name == "HDFC Bank"
    assert s.url == "http://hdfc.com"

def test_scraper_process_and_validate_success():
    scraper = HDFCScraper("HDFC Bank", "http://hdfc.com")
    raw_data = {
        "fd_rates": [
            {"tenure_raw": "1 Year", "general_raw": "7.10%", "senior_raw": "7.60%"}
        ],
        "minimum_deposit": 5000.0,
        "premature_withdrawal_available": True,
        "compounding_frequency": "Quarterly"
    }
    errors = []
    scheme = scraper.process_and_validate(raw_data, errors)
    assert len(errors) == 0
    assert scheme.bank_name == "HDFC Bank"
    assert scheme.minimum_deposit == 5000.0
    assert len(scheme.fd_rates) == 1
    rate = scheme.fd_rates[0]
    assert rate.tenure_raw == "1 Year"
    assert rate.general_rate == 7.10
    assert rate.senior_citizen_rate == 7.60

def test_scraper_process_and_validate_with_warnings():
    scraper = SBIScraper("SBI", "http://sbi.com")
    raw_data = {
        "fd_rates": [
            # Invalid rate row (missing rate)
            {"tenure_raw": "7 Days", "general_raw": "", "senior_raw": ""},
            # Valid rate row
            {"tenure_raw": "1 Year", "general_raw": "6.50%", "senior_raw": "7.00%"},
            # Duplicate rate row
            {"tenure_raw": "1 Year", "general_raw": "6.50%", "senior_raw": "7.00%"}
        ]
    }
    errors = []
    scheme = scraper.process_and_validate(raw_data, errors)
    # Warnings should be collected in errors list
    assert len(errors) > 0
    assert len(scheme.fd_rates) == 1  # Only the single valid row was added (duplicate skipped, invalid rate skipped)
    assert scheme.fd_rates[0].tenure_raw == "1 Year"

def test_scraper_process_and_validate_global_error():
    scraper = HDFCScraper("HDFC Bank", "http://hdfc.com")
    raw_data = {
        "minimum_deposit": "not a float"
    }
    errors = []
    scheme = scraper.process_and_validate(raw_data, errors)
    assert len(errors) > 0
    assert scheme.fd_rates == []

