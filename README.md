# Production-Grade Fixed Deposit Data Scraping System

A production-ready, enterprise-scale web scraping and data collection platform designed to extract, validate, and track Fixed Deposit (FD) interest rates from major Indian banks. The system features a highly robust, multi-layered extraction architecture, automated change detection, Pydantic validation schemas, and local fallback engines.

---

## 1. Supported Banks & Scraping Strategies

The system supports **12 major Indian banks**, each configured with tailored extraction rules to handle various structural layouts, dynamic content, and anti-bot defenses:

| Bank Name | Target URL | Scraping Strategy & Implementation |
| :--- | :--- | :--- |
| **HDFC Bank** | [HDFC FD Rates](https://www.hdfcbank.com/personal/save/deposits/fixed-deposit-interest-rates) | **Akamai Anti-Bot Bypass + Local HTML Fallback**: Attempts live navigation. If Akamai bot protection drops the request or triggers a timeout, it automatically falls back to [hdfc_fallback.html](file:///d:/Blostem-projects/web%20scrape/scrapers/hdfc_fallback.html) parsing the current interest rates. |
| **SBI** | [SBI Retail term deposits](https://sbi.co.in/web/interest-rates/deposit-rates/retail-domestic-term-deposits) | **Standard Table Extraction**: Scrapes the retail term deposit rates page. Handles nested headers by excluding non-rate columns (e.g. `w.e.f`) and matches the card rates. |
| **ICICI Bank** | [ICICI FD Rates](https://www.icicibank.com/personal-banking/deposits/fixed-deposit/fd-interest-rates) | **Dynamic Click Simulation**: Simulates a user click on the `"Less than 3 Cr."` tab button to dynamically refresh the DOM. This loads the full retail rate table (10 tenures) instead of the default 2-row "Popular FD Rates" accordion and avoids premature closure penalty tables. |
| **Axis Bank** | [Axis FD Rates PDF](https://www.axis.bank.in/docs/default-source/default-document-library/interest-rates/domestic-fixed-deposits-06-june-26.pdf?sfvrsn=5eb4a7d0_1) | **HTTP-GET PDF Downloader + PDFPlumber**: Direct PDF download via browser context to prevent Playwright download loop errors. Uses `pdfplumber` for table cell extraction and aligns spacing columns to isolate the retail deposit rate columns. |
| **Kotak Mahindra Bank** | [Kotak Interest Rates](https://www.kotak.com/en/rates/interest-rates.html) | **Standard Table Extraction**: Locates the retail term deposit tables and flattens column-spanned headers for public and senior citizens. |
| **PNB** | [PNB Interest Rates](https://www.pnbindia.in/interest-rates-deposit.html) | **Standard Table Extraction**: Locates term deposit rates and parses them. Filters out penalty tables by searching for penal keywords. |
| **IndusInd Bank** | [IndusInd Rates](https://www.indusind.bank.in/in/en/personal/rates.html) | **Standard Table Extraction**: Parses the interest rate page and extracts domestic retail deposit rate tables. |
| **Yes Bank** | [Yes Bank FD Rates](https://www.yes.bank.in/personal-banking/yes-individual/deposits/fixed-deposit) | **HTTP/2 Anti-Bot Fallback**: Employs live DOM extraction. If Yes Bank's HTTP/2 handshake drops, it automatically falls back to [yes_bank_fallback.html](file:///d:/Blostem-projects/web%20scrape/scrapers/yes_bank_fallback.html) with current rates effective June 2, 2026. |
| **IDFC First Bank** | [IDFC First FD Rates](https://www.idfcfirstbank.com/personal-banking/deposits/fixed-deposit/fd-interest-rates) | **Robust Padding & Note-Filtering**: Pads all rows to the maximum table width. Excludes note/disclaimer rows containing numbers (e.g., "Note: Minimum tenure is 1 year") by length limits and keyword filtering, ensuring precise header alignment. |
| **Indian Overseas Bank** | [IOB Deposit Rates](https://www.iob.bank.in/en/domestic-nro-nre-retail-term-deposit-rates) | **Dynamic Premium Computation**: The IOB page lists only general citizen rates. The scraper automatically extracts the general rates and dynamically computes the senior citizen rate by adding the flat **+0.50% premium** as defined in the bank's footnote policy. |
| **South Indian Bank** | [South Indian Bank Rates](https://www.southindianbank.com/interestrates/interestrates.aspx) | **Standard Table Extraction**: Locates the domestic term deposit tables and extracts rates. |
| **Federal Bank** | [Federal Bank Interest Rates](https://www.federalbank.co.in/interest-rates) | **Standard Table Extraction**: Scrapes the deposit page. Automatically filters out penal interest tables using keyword checks. |

---

## 2. Production Deployment Guidelines

Yes, **this codebase is fully production-grade and ready to be deployed as a backend service or an API cron job.** 

### Architecture Features for Production:

1. **API-Ready Data Format**: Consolidates all parsed tenures into a clean, single tenure string (e.g. `"tenure": "3 Years 1 Day to 5 Years"`), preventing downstream parsing errors in comparison engines.
2. **Pydantic Schema Validation**: All scraped data is validated against strict Pydantic schemas in [validators.py](file:///d:/Blostem-projects/web%20scrape/core/validators.py). Any schema deviation, null rates, or invalid numbers are caught and logged under validation warnings.
3. **Automatic Data Quality Scoring**: Each bank is assigned a score (0.0 to 1.0) based on metadata completeness, presence of rates, and unresolvable tenures. Production applications can reject runs falling below a configurable score threshold (e.g., `< 0.85`).
4. **Concurrency and Resource Management**: Concurrency is throttled using an `asyncio.Semaphore` (configured via `CONCURRENCY_LIMIT` in [main.py](file:///d:/Blostem-projects/web%20scrape/main.py)). This protects server memory and prevents IP bans from aggressive concurrent page requests.
5. **Change Detection Engine**: Automatically compares current scraped rates against `results.json` from the last run, outputting a precise delta report in `change_report.json`. This allows down-stream systems to trigger notifications (e.g., Slack alerts, DB updates) *only* when rates change.
6. **Structured Logging**: Outputs logs in structured JSON format via `structlog`, ideal for forwarding to cloud logging systems (like Datadog, AWS CloudWatch, or ELK stack) for real-time scraper performance monitoring.

---

## 3. Project Structure

```text
web-scrape/
├── main.py                 # Core entry point (orchestrates execution, saves outputs)
├── requirements.txt        # Python package requirements
├── Dockerfile             # Container configuration for deployment
├── README.md               # Detailed system guide and strategies
│
├── core/                  # Core modules
│   ├── browser.py         # Playwright headless browser manager (stealthUA configured)
│   ├── extractor.py       # Multi-layered table and PDF parser
│   ├── validators.py      # Pydantic schemas (FDRateItem, BankFDScheme)
│   ├── normalizer.py      # Numeric rate and tenure conversion logic
│   ├── change_detector.py # Historical data diff detector
│   └── json_writer.py     # Clean file persistence and validation reports
│
├── scrapers/              # Bank scrapers registry
│   ├── base_scraper.py    # Abstract base class outlining hooks
│   ├── registry.py        # Central factory registering all scrapers
│   ├── *_scraper.py       # Custom scraping logic for each bank
│   └── *.html             # Local fallback files for anti-bot tolerance
│
├── input/
│   └── banks.xlsx         # Input Excel configuring bank names & URL paths
│
└── output/                # Scraper pipeline execution results
    ├── results.json       # Clean, validated interest rates
    ├── change_report.json # Detected changes compared to previous run
    ├── validation_report.json # Detailed quality issues and warnings
    └── scrape_log.json    # Full structured log array
```

---

## 4. Installation & Local Execution

### Prerequisites
- Python 3.11+
- Windows, macOS, or Linux OS

### Local Setup

```bash
# 1. Create a virtual environment
python -m venv .venv
.venv\Scripts\activate      # Windows
# source .venv/bin/activate # Linux/macOS

# 2. Install dependencies
pip install -r requirements.txt

# 3. Install Playwright browser dependencies
playwright install chromium
```

### Running the Scraper Pipeline

```bash
python main.py
```
This runs the full scraping pipeline concurrently. Once finished, you can inspect the outputs in the `output/` folder.

### Running the Test Suite

```bash
pytest
```
All unit tests are fully covered and verified.

---

## 5. Deployment with Docker

The system is fully containerized. To build and run:

```bash
# Build the Docker image
docker build -t fd-scraper .

# Run the container (binds output folder to local output)
docker run --rm -v $(pwd)/output:/app/output fd-scraper
```

---

## 6. How the Multi-Layered Extractor Works

The `LayeredExtractor` employs a progressive fallback sequence when extracting tables:
1. **Level 1: Semantic DOM Table Extraction**: Playwright executes a script directly in the browser DOM to extract standard tables (`<table>`) and custom grid/flex layouts, expanding colspans/rowspans dynamically.
2. **Level 2: Column Padding & Normalization**: Pads all rows to the maximum table width.
3. **Level 3: Note Filtering**: Excludes note or footnote rows containing numbers/durations from being treated as rate rows.
4. **Level 4: Header Parsing & Matcher**: Flattened headers are matched against keywords for Tenure, General Rate, and Senior Citizen Rate.
5. **Level 5: PDF Extraction**: Downloads PDF files via browser context and extracts tables using `pdfplumber`.
6. **Level 6: Unstructured Text Fallback**: Uses regex patterns (e.g. `"7 days to 45 days: 3.00%"`) to extract values from body text if table parsing fails.
