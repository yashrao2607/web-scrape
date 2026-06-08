import pytest
from unittest.mock import AsyncMock, patch, mock_open, MagicMock
from scrapers.hdfc_scraper import HDFCScraper
from scrapers.sbi_scraper import SBIScraper
from scrapers.icici_scraper import ICICIScraper

@pytest.mark.asyncio
async def test_hdfc_scraper_html():
    scraper = HDFCScraper("HDFC Bank", "http://hdfc.com")
    mock_page = AsyncMock()
    mock_page.wait_for_selector = AsyncMock()
    
    with patch("core.extractor.LayeredExtractor.extract_from_page", return_value=[[["Tenure", "Rate"], ["1 Year", "7.00%"]]]), \
         patch("core.extractor.LayeredExtractor.parse_extracted_table", return_value=[{"tenure_raw": "1 Year", "general_raw": "7.00%", "senior_raw": "7.50%"}]):
        res = await scraper.scrape(mock_page)
        assert res["minimum_deposit"] == 5000.0
        assert len(res["fd_rates"]) == 1
        assert res["fd_rates"][0]["tenure_raw"] == "1 Year"

@pytest.mark.asyncio
async def test_sbi_scraper_html():
    scraper = SBIScraper("SBI", "http://sbi.com")
    mock_page = AsyncMock()
    mock_page.wait_for_selector = AsyncMock()
    
    with patch("core.extractor.LayeredExtractor.extract_from_page", return_value=[[["Tenure", "Rate"], ["1 Year", "6.50%"]]]), \
         patch("core.extractor.LayeredExtractor.parse_extracted_table", return_value=[{"tenure_raw": "1 Year", "general_raw": "6.50%", "senior_raw": "7.00%"}]):
        res = await scraper.scrape(mock_page)
        assert res["minimum_deposit"] == 1000.0
        assert len(res["fd_rates"]) == 1

@pytest.mark.asyncio
async def test_icici_scraper_html():
    scraper = ICICIScraper("ICICI Bank", "http://icici.com")
    mock_page = AsyncMock()
    mock_page.wait_for_selector = AsyncMock()
    
    with patch("core.extractor.LayeredExtractor.extract_from_page", return_value=[[["Tenure", "Rate"], ["1 Year", "7.10%"]]]), \
         patch("core.extractor.LayeredExtractor.parse_extracted_table", return_value=[{"tenure_raw": "1 Year", "general_raw": "7.10%", "senior_raw": "7.60%"}]):
        res = await scraper.scrape(mock_page)
        assert res["minimum_deposit"] == 10000.0
        assert len(res["fd_rates"]) == 1

@pytest.mark.asyncio
async def test_scraper_pdf_flow():
    # Test HDFC PDF scrape flow
    scraper = HDFCScraper("HDFC Bank", "http://hdfc.com/rates.pdf")
    mock_page = AsyncMock()
    
    mock_response = AsyncMock()
    mock_response.body = AsyncMock(return_value=b"pdf_content")
    mock_page.context.request.get = AsyncMock(return_value=mock_response)
    
    with patch("builtins.open", mock_open()) as mock_file, \
         patch("core.extractor.LayeredExtractor.extract_from_pdf", return_value=[{"tenure_raw": "1 Year", "general_raw": "7.00%", "senior_raw": "7.50%"}]) as mock_pdf_extractor:
        res = await scraper.scrape(mock_page)
        assert res["minimum_deposit"] == 5000.0
        assert len(res["fd_rates"]) == 1
        assert res["fd_rates"][0]["tenure_raw"] == "1 Year"
        mock_pdf_extractor.assert_called_once()

@pytest.mark.asyncio
async def test_sbi_scraper_pdf():
    scraper = SBIScraper("SBI", "http://sbi.com/rates.pdf")
    mock_page = AsyncMock()
    mock_response = AsyncMock()
    mock_response.body = AsyncMock(return_value=b"pdf_content")
    mock_page.context.request.get = AsyncMock(return_value=mock_response)
    
    with patch("builtins.open", mock_open()), \
         patch("core.extractor.LayeredExtractor.extract_from_pdf", return_value=[{"tenure_raw": "1 Year", "general_raw": "6.50%"}]) as mock_pdf_extractor:
        res = await scraper.scrape(mock_page)
        assert res["minimum_deposit"] == 1000.0
        assert len(res["fd_rates"]) == 1

@pytest.mark.asyncio
async def test_icici_scraper_pdf():
    scraper = ICICIScraper("ICICI Bank", "http://icici.com/rates.pdf")
    mock_page = AsyncMock()
    mock_response = AsyncMock()
    mock_response.body = AsyncMock(return_value=b"pdf_content")
    mock_page.context.request.get = AsyncMock(return_value=mock_response)
    
    with patch("builtins.open", mock_open()), \
         patch("core.extractor.LayeredExtractor.extract_from_pdf", return_value=[{"tenure_raw": "1 Year", "general_raw": "7.10%"}]) as mock_pdf_extractor:
        res = await scraper.scrape(mock_page)
        assert res["minimum_deposit"] == 10000.0
        assert len(res["fd_rates"]) == 1

@pytest.mark.asyncio
async def test_hdfc_scraper_fallback():
    scraper = HDFCScraper("HDFC Bank", "http://hdfc.com")
    mock_page = AsyncMock()
    mock_page.url = "about:blank"
    
    # Run scraper
    res = await scraper.scrape(mock_page)
    
    assert res["minimum_deposit"] == 5000.0
    # Fallback rates list should have 15 elements
    assert len(res["fd_rates"]) == 15
    assert res["fd_rates"][0]["tenure_raw"] == "7 days to 14 days"
    assert res["fd_rates"][0]["general_raw"] == "2.75%"
    assert res["fd_rates"][0]["senior_raw"] == "3.25%"


