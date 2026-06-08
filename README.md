# Bank FD Interest Rates Web Scraper

A production-ready web scraping system designed to extract, validate, and track Fixed Deposit (FD) interest rates from major Indian banks. The system features automated change detection, data validation, and multi-layered extraction capabilities.

## Overview

This project automates the collection of FD interest rate data from bank websites, handling various challenges like dynamic content, PDF documents, and inconsistent page structures. It provides structured, validated output with change tracking across scraping sessions.

**Supported Banks:**

- HDFC Bank
- State Bank of India (SBI)
- ICICI Bank

## Features

- **Multi-Layered Extraction Architecture**: Progressive extraction strategy from semantic tables to unstructured text patterns
- **PDF Support**: Extract rate tables from PDF documents using pdfplumber
- **Concurrent Scraping**: Configurable concurrency limit for parallel bank scraping
- **Data Validation**: Pydantic models with automatic quality scoring
- **Change Detection**: Compare current and historical data to identify rate changes
- **Robust Error Handling**: Retry mechanisms with exponential backoff
- **Docker Support**: Containerized deployment with Playwright browsers
- **Comprehensive Logging**: Structured JSON logs for monitoring and debugging

## Project Structure

```
web-scrape/
├── main.py                 # Entry point - orchestrates the scraping pipeline
├── requirements.txt        # Python dependencies
├── Dockerfile             # Container configuration
│
├── core/                  # Core modules
│   ├── browser.py         # Playwright browser management
│   ├── extractor.py       # Multi-layered data extraction
│   ├── validators.py      # Pydantic validation models
│   ├── normalizer.py      # Rate and tenure parsing utilities
│   ├── change_detector.py # Historical data comparison
│   ├── json_writer.py     # Output file handling
│   └── retry_handler.py   # Retry decorator with backoff
│
├── scrapers/              # Bank-specific scraper implementations
│   ├── base_scraper.py    # Abstract base class
│   ├── hdfc_scraper.py    # HDFC Bank scraper
│   ├── icici_scraper.py   # ICICI Bank scraper
│   ├── sbi_scraper.py     # SBI scraper
│   ├── registry.py        # Scraper lookup registry
│   └── hdfc_fallback.html # Local fallback for HDFC
│
├── input/                 # Input configuration
│   └── banks.xlsx         # Bank names and FD page URLs
│
├── output/                # Generated output files
│   ├── results.json       # Scraped FD rate data
│   ├── change_report.json # Detected changes
│   ├── validation_report.json # Validation issues
│   └── scrape_log.json    # Execution logs
│
└── tests/                 # Test suite
    ├── test_browser.py
    ├── test_change_detector.py
    ├── test_extractors.py
    └── ...
```

## Data Extraction Strategy

The `LayeredExtractor` class implements a 5-level extraction strategy:

| Level | Method                       | Description                                                     |
| ----- | ---------------------------- | --------------------------------------------------------------- |
| 1     | Semantic Table Detection     | Extract HTML tables, ARIA grid roles, and flex layouts          |
| 2     | Header-Based Column Matching | Identify tenure, general rate, and senior citizen rate columns  |
| 3     | Keyword-Based Parsing        | Parse unstructured text for rate patterns                       |
| 4     | Pattern Recognition          | Regex patterns for common rate formats (e.g., "7 days - 3.00%") |
| 5     | PDF Extraction               | Fallback to pdfplumber for PDF documents                        |

## Data Schema

### FDRateItem

```json
{
  "tenure": "1 Year to less than 15 Months",
  "general_rate": 6.25,
  "senior_citizen_rate": 6.75,
  "effective_from": null,
  "effective_to": null,
  "notes": null
}
```

### BankFDScheme

```json
{
  "bank_name": "HDFC Bank",
  "source_url": "https://www.hdfcbank.com/...",
  "scraped_at": "2026-06-08T19:23:15.517352Z",
  "fd_rates": [...],
  "minimum_deposit": 5000.0,
  "maximum_deposit": 20000000.0,
  "premature_withdrawal_available": true,
  "premature_withdrawal_penalty": "1.0% interest rate penalty",
  "loan_against_fd_available": true,
  "tax_saver_fd_available": true,
  "tax_saver_tenure": "5 Years",
  "nomination_available": true,
  "compounding_frequency": "Quarterly",
  "data_quality_score": 0.95,
  "scraper_version": "1.0.0"
}
```

## Installation

### Prerequisites

- Python 3.11+
- pip package manager

### Local Setup

```bash
# Clone the repository
git clone <repository-url>
cd web-scrape

# Create virtual environment
python -m venv .venv
.venv\Scripts\activate  # Windows
# source .venv/bin/activate  # Linux/macOS

# Install dependencies
pip install -r requirements.txt

# Install Playwright browsers
playwright install chromium
```

### Docker Setup

```bash
# Build the container
docker build -t fd-scraper .

# Run the scraper
docker run --rm -v $(pwd)/output:/app/output fd-scraper
```

## Usage

### Basic Execution

```bash
python main.py
```

### Configuration

Edit `input/banks.xlsx` to configure which banks to scrape:

| Bank Name  | FD URL                                                                              |
| ---------- | ----------------------------------------------------------------------------------- |
| HDFC Bank  | https://www.hdfcbank.com/personal/save/deposits/fixed-deposit-interest-rates        |
| SBI        | https://sbi.co.in/web/interest-rates/deposit-rates/retail-domestic-term-deposits    |
| ICICI Bank | https://www.icicibank.com/personal-banking/deposits/fixed-deposit/fd-interest-rates |

### Concurrency Settings

Adjust `CONCURRENCY_LIMIT` in `main.py` to control parallel scraping:

```python
CONCURRENCY_LIMIT = 5  # Maximum concurrent bank scrapes
```

## Output Files

### results.json

Contains successfully scraped data for all banks:

```json
[
  {
    "bank_name": "HDFC Bank",
    "fd_rates": [
      {
        "tenure": "7 days to 14 days",
        "general_rate": 2.75,
        "senior_citizen_rate": 3.25
      },
      {
        "tenure": "15 days to 29 days",
        "general_rate": 2.75,
        "senior_citizen_rate": 3.25
      }
    ],
    "status": "SUCCESS"
  }
]
```

### change_report.json

Tracks changes between current and previous scrapes:

```json
[
  {
    "bank": "HDFC Bank",
    "changes_detected": true,
    "rate_changes": [
      {
        "tenure": "1 Year",
        "change_type": "rate_changed",
        "old_general_rate": 6.0,
        "new_general_rate": 6.25
      }
    ],
    "metadata_changes": []
  }
]
```

### validation_report.json

Data quality issues and validation warnings:

```json
{
  "validation_summary": {
    "total_banks_checked": 3,
    "banks_with_issues": 0
  },
  "failures_and_warnings": {
    "HDFC Bank": [],
    "SBI": [],
    "ICICI Bank": []
  }
}
```

### scrape_log.json

Detailed execution log:

```json
[
  {
    "event": "starting_scraping_pipeline",
    "level": "info",
    "timestamp": "2026-06-08T19:22:06.555496Z"
  },
  {
    "event": "scraping_bank_start",
    "bank": "HDFC Bank",
    "url": "https://www.hdfcbank.com/...",
    "level": "info",
    "timestamp": "2026-06-08T19:22:14.777274Z"
  }
]
```

## Extending the System

### Adding a New Bank Scraper

1. Create a new scraper in `scrapers/`:

```python
# scrapers/newbank_scraper.py
from scrapers.base_scraper import BaseScraper
from core.extractor import LayeredExtractor

class NewBankScraper(BaseScraper):
    async def scrape(self, page) -> Dict[str, Any]:
        self.logger.info("starting_newbank_scrape")

        await page.wait_for_selector("table", timeout=5000)
        tables = await LayeredExtractor.extract_from_page(page)
        rates = []
        for t in tables:
            parsed = LayeredExtractor.parse_extracted_table(t)
            if parsed:
                rates.extend(parsed)

        return {
            "fd_rates": rates,
            "minimum_deposit": 5000.0,
            "maximum_deposit": 20000000.0,
            "premature_withdrawal_available": True,
            "loan_against_fd_available": True,
            "tax_saver_fd_available": True,
            "scraper_version": "1.0.0"
        }
```

2. Register the scraper in `scrapers/registry.py`:

```python
from scrapers.newbank_scraper import NewBankScraper

SCRAPER_REGISTRY: Dict[str, Type[BaseScraper]] = {
    "HDFC Bank": HDFCScraper,
    "SBI": SBIScraper,
    "ICICI Bank": ICICIScraper,
    "New Bank": NewBankScraper,  # Add here
}
```

3. Add the bank to `input/banks.xlsx`

## Testing

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=. --cov-report=html

# Run specific test file
pytest tests/test_extractors.py -v
```

## Error Handling

- **Navigation Failures**: Automatic fallback to scraper-specific handling
- **Table Detection Timeout**: Proceeds with available content
- **Invalid Rate Values**: Logged and skipped with validation warnings
- **Duplicate Tenures**: Detected and flagged during validation

## Data Quality Scoring

The `BankFDScheme` model automatically calculates a `data_quality_score` (0.0-1.0) based on:

- Presence of FD rates (-0.5 if empty)
- Completeness of metadata fields (-0.05 each for missing fields)
- Unresolved tenure values (-0.15 proportional penalty)

## Dependencies

| Package        | Purpose                |
| -------------- | ---------------------- |
| playwright     | Browser automation     |
| pydantic       | Data validation        |
| pandas         | Excel input processing |
| structlog      | Structured logging     |
| tenacity       | Retry logic            |
| pdfplumber     | PDF extraction         |
| beautifulsoup4 | HTML parsing           |
| pytest         | Testing framework      |

## License

This project is intended for educational and research purposes. Ensure compliance with bank website terms of service when scraping.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

---

Last updated: June 2026
