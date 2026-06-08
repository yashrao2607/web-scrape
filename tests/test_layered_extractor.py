import pytest
from unittest.mock import MagicMock, patch
from core.extractor import LayeredExtractor

def test_match_headers_exact():
    headers = ["Tenure", "General Public Rate (% p.a.)", "Senior Citizen Rate (% p.a.)"]
    mapping = LayeredExtractor.match_headers(headers)
    assert mapping["tenure_idx"] == 0
    assert mapping["general_idx"] == 1
    assert mapping["senior_idx"] == 2

def test_match_headers_fuzzy():
    headers = ["Period of Deposit", "Interest Rate for regular citizens", "Sr. Citizens"]
    mapping = LayeredExtractor.match_headers(headers)
    assert mapping["tenure_idx"] == 0
    assert mapping["general_idx"] == 1
    assert mapping["senior_idx"] == 2

def test_parse_extracted_table():
    table = [
        ["Tenure", "Rate", "Senior Rate"],
        ["7 days to 14 days", "3.00%", "3.50%"],
        ["1 Year", "7.10%", "7.60%"]
    ]
    parsed = LayeredExtractor.parse_extracted_table(table)
    assert len(parsed) == 2
    assert parsed[0]["tenure_raw"] == "7 days to 14 days"
    assert parsed[0]["general_raw"] == "3.00%"
    assert parsed[0]["senior_raw"] == "3.50%"
    assert parsed[1]["tenure_raw"] == "1 Year"

def test_parse_extracted_table_missing_columns():
    table = [
        ["col_one", "col_two"],
        ["value1", "value2"]
    ]
    parsed = LayeredExtractor.parse_extracted_table(table)
    assert len(parsed) == 0

@pytest.mark.asyncio
async def test_extract_from_unstructured_text():
    # Mock playwright page.inner_text
    from unittest.mock import AsyncMock
    page = MagicMock()
    # Mock body inner text containing rates
    page.inner_text = AsyncMock(return_value="""
    Fixed Deposit Scheme:
    1 Year: 7.10% Interest Rate. Senior Citizen: 7.60%
    46 days to 179 days - 4.50%
    Some regular text without match.
    """)
    
    # We pass the mock page
    results = await LayeredExtractor.extract_from_unstructured_text(page)
    
    assert len(results) == 2
    assert results[0]["tenure_raw"] == "1 Year"
    assert results[0]["general_raw"] == "7.10"
    assert results[0]["senior_raw"] == "7.60"
    
    assert results[1]["tenure_raw"] == "46 days to 179 days"
    assert results[1]["general_raw"] == "4.50"

def test_extract_from_pdf():
    # Mock pdfplumber.open
    mock_pdf = MagicMock()
    mock_page = MagicMock()
    mock_pdf.pages = [mock_page]
    
    # Mock extract_tables
    mock_page.extract_tables.return_value = [
        [
            ["Tenure", "Rate", "Senior Rate"],
            ["1 Year", "7.00%", "7.50%"]
        ]
    ]
    
    with patch("pdfplumber.open", return_value=mock_pdf):
        # We need mock_pdf to support context manager __enter__
        mock_pdf.__enter__.return_value = mock_pdf
        results = LayeredExtractor.extract_from_pdf("dummy_path.pdf")
        
    assert len(results) == 1
    assert results[0]["tenure_raw"] == "1 Year"
    assert results[0]["general_raw"] == "7.00%"
    assert results[0]["senior_raw"] == "7.50%"
