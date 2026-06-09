# Bank FD Interest Rates Scraper - Complete Architecture Documentation

This document provides an in-depth explanation of the entire system architecture, data flow, scraping mechanisms, and processing pipeline.

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Data Flow Pipeline](#2-data-flow-pipeline)
3. [Core Components Deep Dive](#3-core-components-deep-dive)
4. [Bank-Specific Scraping Methods](#4-bank-specific-scraping-methods)
5. [Extraction Layer Architecture](#5-extraction-layer-architecture)
6. [Validation & Normalization](#6-validation--normalization)
7. [Change Detection Mechanism](#7-change-detection-mechanism)
8. [Output Generation Pipeline](#8-output-generation-pipeline)
9. [Error Handling & Resilience](#9-error-handling--resilience)
10. [Complete Data Journey](#10-complete-data-journey)

---

## 1. System Architecture Overview

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              MAIN.PY (Orchestrator)                          │
│  - Reads input/banks.xlsx                                                    │
│  - Initializes browser manager                                               │
│  - Coordinates concurrent scraping tasks                                     │
│  - Triggers post-processing pipeline                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BROWSER MANAGER (Playwright)                         │
│  - Launches headless Chromium browser                                       │
│  - Creates isolated browser contexts per task                               │
│  - Handles navigation with fallback strategies                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
           ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
           │ HDFC Scraper │  │  SBI Scraper │  │ICICI Scraper │
           └──────────────┘  └──────────────┘  └──────────────┘
                    │                 │                 │
                    └─────────────────┼─────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LAYERED EXTRACTOR                                    │
│  Level 1: Semantic Table Detection (HTML tables, ARIA grids)                │
│  Level 2: Header-Based Column Matching                                       │
│  Level 3: Keyword-Based Parsing                                              │
│  Level 4: Pattern Recognition (Regex)                                        │
│  Level 5: PDF Table Extraction                                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         VALIDATION & NORMALIZATION                           │
│  - Parse tenure strings to standardized format                               │
│  - Extract numeric rates from percentage strings                             │
│  - Validate against Pydantic schemas                                         │
│  - Calculate data quality scores                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         OUTPUT GENERATION                                    │
│  ┌─────────────┐  ┌─────────────────┐  ┌──────────────────┐                │
│  │results.json │  │change_report.json│  │validation_report │                │
│  └─────────────┘  └─────────────────┘  └──────────────────┘                │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Summary Table

| Component         | File                        | Responsibility                                  | Key Methods                                      |
| ----------------- | --------------------------- | ----------------------------------------------- | ------------------------------------------------ |
| Orchestrator      | `main.py`                   | Pipeline coordination, concurrency management   | `main()`, `scrape_bank_task()`                   |
| Browser Manager   | `core/browser.py`           | Playwright lifecycle, page creation, navigation | `start()`, `get_page()`, `navigate_to()`         |
| Base Scraper      | `scrapers/base_scraper.py`  | Abstract interface, validation pipeline         | `scrape()`, `process_and_validate()`             |
| HDFC Scraper      | `scrapers/hdfc_scraper.py`  | HDFC Bank specific extraction                   | `scrape()`                                       |
| SBI Scraper       | `scrapers/sbi_scraper.py`   | SBI specific extraction                         | `scrape()`                                       |
| ICICI Scraper     | `scrapers/icici_scraper.py` | ICICI Bank specific extraction                  | `scrape()`                                       |
| Layered Extractor | `core/extractor.py`         | Multi-level data extraction                     | `extract_from_page()`, `parse_extracted_table()` |
| Normalizer        | `core/normalizer.py`        | Parse tenure and rate strings                   | `parse_tenure()`, `normalize_rate()`             |
| Validators        | `core/validators.py`        | Pydantic schemas, data quality                  | `FDRateItem`, `BankFDScheme`                     |
| Change Detector   | `core/change_detector.py`   | Compare historical vs current data              | `detect_changes()`                               |
| JSON Writer       | `core/json_writer.py`       | File output operations                          | `write_json()`, `generate_validation_report()`   |
| Retry Handler     | `core/retry_handler.py`     | Exponential backoff retry logic                 | `get_retry_decorator()`                          |
| Registry          | `scrapers/registry.py`      | Scraper class lookup                            | `get_scraper_for_bank()`                         |

---

## 2. Data Flow Pipeline

### Complete Pipeline Stages

```
┌────────────┐    ┌────────────┐    ┌────────────┐    ┌────────────┐    ┌────────────┐
│   STAGE 1  │───▶│   STAGE 2  │───▶│   STAGE 3  │───▶│   STAGE 4  │───▶│   STAGE 5  │
│   INPUT    │    │  SCRAPING  │    │EXTRACTION  │    │ VALIDATION │    │   OUTPUT   │
└────────────┘    └────────────┘    └────────────┘    └────────────┘    └────────────┘
     │                  │                  │                  │                  │
     ▼                  ▼                  ▼                  ▼                  ▼
 banks.xlsx       Playwright          Layered            Pydantic          results.json
 (Bank names      Browser             Extractor          Models            change_report.json
  + URLs)         Headless            5 Levels           Quality Score     validation_report.json
                  Chromium            PDF support        Rate validation   scrape_log.json
```

### Stage Details Table

| Stage                  | Input                     | Processing                               | Output                    | Duration           |
| ---------------------- | ------------------------- | ---------------------------------------- | ------------------------- | ------------------ |
| 1. Input Loading       | `input/banks.xlsx`        | pandas reads Excel, validates columns    | List of bank dictionaries | ~1-2 sec           |
| 2. Browser Setup       | Bank list                 | Launch Chromium, create contexts         | Active browser instance   | ~2-3 sec           |
| 3. Concurrent Scraping | Browser + URLs            | Navigate, wait for content, extract      | Raw HTML/tables           | ~5-30 sec per bank |
| 4. Data Extraction     | Raw content               | Layered extraction, table parsing        | Raw rate dictionaries     | ~1-5 sec per bank  |
| 5. Validation          | Raw rates                 | Pydantic validation, normalization       | `BankFDScheme` objects    | ~0.5 sec per bank  |
| 6. Change Detection    | Current + historical data | Compare rates, detect additions/removals | Change report list        | ~0.1 sec           |
| 7. Output Writing      | All processed data        | JSON serialization, file writes          | 4 output files            | ~0.5 sec           |

---

## 3. Core Components Deep Dive

### 3.1 Main Orchestrator (`main.py`)

#### Execution Flow

```
main()
  │
  ├──▶ Check/Create input/banks.xlsx
  │
  ├──▶ Read bank list (pandas)
  │
  ├──▶ Initialize PlaywrightBrowserManager (headless=True)
  │
  ├──▶ Create Semaphore (CONCURRENCY_LIMIT=5)
  │
  ├──▶ Start browser
  │
  ├──▶ Create async tasks for each bank
  │      │
  │      └──▶ scrape_bank_task()
  │             ├── acquire semaphore
  │             ├── get page from browser
  │             ├── navigate to URL
  │             ├── instantiate bank scraper
  │             ├── call scraper.scrape(page)
  │             ├── call scraper.process_and_validate()
  │             └── release resources
  │
  ├──▶ await asyncio.gather(*tasks)
  │
  ├──▶ Close browser
  │
  ├──▶ Filter successful results
  │
  ├──▶ Write results.json
  │
  ├──▶ Run ChangeDetector
  │
  ├──▶ Write change_report.json
  │
  ├──▶ Write validation_report.json
  │
  └──▶ Write scrape_log.json
```

#### Key Configuration Table

| Variable                 | Value                           | Purpose                       |
| ------------------------ | ------------------------------- | ----------------------------- |
| `CONCURRENCY_LIMIT`      | 5                               | Max parallel browser tasks    |
| `INPUT_EXCEL_PATH`       | `input/banks.xlsx`              | Bank configuration source     |
| `OUTPUT_RESULTS_PATH`    | `output/results.json`           | Scraped data destination      |
| `OUTPUT_CHANGES_PATH`    | `output/change_report.json`     | Change report destination     |
| `OUTPUT_VALIDATION_PATH` | `output/validation_report.json` | Validation issues destination |
| `OUTPUT_LOG_PATH`        | `output/scrape_log.json`        | Execution log destination     |

### 3.2 Browser Manager (`core/browser.py`)

#### Browser Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                    PlaywrightBrowserManager                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  start()                                                         │
│    ├── async_playwright().start()                               │
│    ├── playwright.chromium.launch(                              │
│    │       headless=True,                                        │
│    │       args=[                                                │
│    │         "--disable-dev-shm-usage",                         │
│    │         "--no-sandbox",                                    │
│    │         "--disable-setuid-sandbox"                         │
│    │       ]                                                     │
│    │   )                                                         │
│    └── Returns Browser instance                                  │
│                                                                  │
│  get_page()                                                      │
│    ├── browser.new_context(                                      │
│    │       user_agent="Mozilla/5.0...",                         │
│    │       viewport={width: 1280, height: 800},                 │
│    │       accept_downloads=True                                 │
│    │   )                                                         │
│    ├── context.new_page()                                        │
│    ├── page.set_default_timeout(30000)                          │
│    └── Returns Page instance                                     │
│                                                                  │
│  navigate_to(page, url)                                          │
│    ├── Try: page.goto(url, wait_until="networkidle")            │
│    └── Fallback: page.goto(url, wait_until="load")              │
│                                                                  │
│  close()                                                         │
│    ├── browser.close()                                           │
│    └── playwright.stop()                                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Browser Configuration Table

| Setting      | Value                  | Reason                    |
| ------------ | ---------------------- | ------------------------- |
| `headless`   | `True`                 | No UI needed for scraping |
| `user_agent` | Chrome 120 on Windows  | Appear as regular browser |
| `viewport`   | 1280x800               | Standard desktop viewport |
| `timeout`    | 30000ms                | Allow for slow bank sites |
| `wait_until` | `networkidle` → `load` | Handle dynamic content    |

---

## 4. Bank-Specific Scraping Methods

### 4.1 Scraper Architecture

Each bank scraper follows this pattern:

```
┌─────────────────────────────────────────────────────────────────┐
│                      BaseScraper (Abstract)                      │
├─────────────────────────────────────────────────────────────────┤
│  Properties:                                                     │
│    - bank_name: str                                              │
│    - url: str                                                    │
│    - logger: structlog.Logger                                    │
│                                                                  │
│  Abstract Methods:                                               │
│    + scrape(page) -> Dict[str, Any]                             │
│                                                                  │
│  Concrete Methods:                                               │
│    + process_and_validate(raw_data, errors) -> BankFDScheme     │
│      ├── Extract rates from raw_data["fd_rates"]                │
│      ├── Check for duplicate tenures                            │
│      ├── Normalize rate values using normalize_rate()           │
│      ├── Create FDRateItem objects                              │
│      ├── Handle validation errors                               │
│      └── Build BankFDScheme with metadata                       │
└─────────────────────────────────────────────────────────────────┘
                              △
                              │ inherits
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────┴───────┐     ┌───────┴───────┐     ┌───────┴───────┐
│ HDFCScraper   │     │  SBIScraper    │     │ ICICIScraper  │
└───────────────┘     └───────────────┘     └───────────────┘
```

### 4.2 HDFC Bank Scraping Method

#### Flow Diagram

```
HDFCScraper.scrape(page)
│
├──▶ Check if URL ends with .pdf?
│      │
│      ├── YES ──▶ Download PDF
│      │            ├── page.context.request.get(url)
│      │            ├── Save to temp file
│      │            └── LayeredExtractor.extract_from_pdf()
│      │
│      └── NO ──▶ Continue to HTML extraction
│                   │
│                   ├─▶ Check page.url is not blank
│                   │     │
│                   │     ├─▶ Has URL ──▶ Wait for table selector
│                   │     │                │
│                   │     │                ├─▶ extract_from_page()
│                   │     │                ├─▶ parse_extracted_table()
│                   │     │                └─▶ If no rates: extract_from_unstructured_text()
│                   │     │
│                   │     └─▶ Blank page ──▶ TRIGGER FALLBACK
│                   │
│                   └─▶ FALLBACK: Local HTML File
│                         │
│                         ├─▶ Read hdfc_fallback.html
│                         ├─▶ Parse with BeautifulSoup
│                         ├─▶ Extract all <table> elements
│                         └─▶ parse_extracted_table()
│
└──▶ Return raw data dict with HDFC metadata
```

#### HDFC Metadata Configuration

| Field                            | Value                        | Notes                   |
| -------------------------------- | ---------------------------- | ----------------------- |
| `minimum_deposit`                | ₹5,000                       | Minimum FD amount       |
| `maximum_deposit`                | ₹2,00,00,000                 | ₹2 Crore limit          |
| `premature_withdrawal_available` | `True`                       | Early closure allowed   |
| `premature_withdrawal_penalty`   | "1.0% interest rate penalty" | Penalty clause          |
| `loan_against_fd_available`      | `True`                       | Loan facility available |
| `tax_saver_fd_available`         | `True`                       | Tax-saving FD offered   |
| `tax_saver_tenure`               | "5 Years"                    | Tax saver duration      |
| `nomination_available`           | `True`                       | Nomination facility     |
| `compounding_frequency`          | "Quarterly"                  | Interest compounding    |
| `scraper_version`                | "1.0.0"                      | Scraper version         |

### 4.3 SBI Scraping Method

#### Flow Diagram

```
SBIScraper.scrape(page)
│
├──▶ Check if URL ends with .pdf?
│      │
│      ├── YES ──▶ Download PDF
│      │            └── extract_from_pdf()
│      │
│      └── NO ──▶ HTML extraction
│                   │
│                   ├─▶ Wait for table selector (5s timeout)
│                   │     └─▶ Log warning if timeout
│                   │
│                   ├─▶ extract_from_page()
│                   ├─▶ parse_extracted_table() for each table
│                   │
│                   └─▶ If no rates:
│                         └─▶ extract_from_unstructured_text()
│
└──▶ Return raw data dict with SBI metadata
```

#### SBI Metadata Configuration

| Field                            | Value                                                               |
| -------------------------------- | ------------------------------------------------------------------- |
| `minimum_deposit`                | ₹1,000                                                              |
| `maximum_deposit`                | ₹2,00,00,000                                                        |
| `premature_withdrawal_available` | `True`                                                              |
| `premature_withdrawal_penalty`   | "0.50% penalty for tenure < 1 yr, 1.00% penalty for tenure >= 1 yr" |
| `loan_against_fd_available`      | `True`                                                              |
| `tax_saver_fd_available`         | `True`                                                              |
| `tax_saver_tenure`               | "5 Years to 10 Years"                                               |
| `nomination_available`           | `True`                                                              |
| `compounding_frequency`          | "Quarterly"                                                         |

### 4.4 ICICI Bank Scraping Method

#### Flow Diagram

```
ICICIScraper.scrape(page)
│
├──▶ Check if URL ends with .pdf?
│      │
│      ├── YES ──▶ Download PDF
│      │            └── extract_from_pdf()
│      │
│      └── NO ──▶ HTML extraction
│                   │
│                   ├─▶ Wait for table selector (5s timeout)
│                   │
│                   ├─▶ extract_from_page()
│                   ├─▶ parse_extracted_table() for each table
│                   │
│                   └─▶ If no rates:
│                         └─▶ extract_from_unstructured_text()
│
└──▶ Return raw data dict with ICICI metadata
```

#### ICICI Metadata Configuration

| Field                            | Value                                                  |
| -------------------------------- | ------------------------------------------------------ |
| `minimum_deposit`                | ₹10,000                                                |
| `maximum_deposit`                | ₹2,00,00,000                                           |
| `premature_withdrawal_available` | `True`                                                 |
| `premature_withdrawal_penalty`   | "0.50% to 1.00% depending on tenure and deposit value" |
| `loan_against_fd_available`      | `True`                                                 |
| `tax_saver_fd_available`         | `True`                                                 |
| `tax_saver_tenure`               | "5 Years"                                              |
| `nomination_available`           | `True`                                                 |
| `compounding_frequency`          | "Quarterly"                                            |

### 4.5 Bank Scraping Comparison Table

| Aspect                     | HDFC                        | SBI                      | ICICI             |
| -------------------------- | --------------------------- | ------------------------ | ----------------- |
| PDF Support                | ✅ Yes                      | ✅ Yes                   | ✅ Yes            |
| HTML Table Extraction      | ✅ Yes                      | ✅ Yes                   | ✅ Yes            |
| Local Fallback             | ✅ Yes (hdfc_fallback.html) | ❌ No                    | ❌ No             |
| Unstructured Text Fallback | ✅ Yes                      | ✅ Yes                   | ✅ Yes            |
| Min Deposit                | ₹5,000                      | ₹1,000                   | ₹10,000           |
| Premature Penalty          | 1.0% flat                   | 0.5-1.0% based on tenure | 0.5-1.0% variable |
| Tax Saver Tenure           | 5 Years                     | 5-10 Years               | 5 Years           |

---

## 5. Extraction Layer Architecture

### 5.1 Layered Extraction Overview

The `LayeredExtractor` class implements a progressive extraction strategy:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          EXTRACTION LAYERS                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Level 1: SEMANTIC TABLE DETECTION                                          │
│  ├── Extract <table> elements with colspan/rowspan expansion               │
│  ├── Extract [role="table"] and [role="grid"] elements                     │
│  └── Output: List of 2D string matrices                                     │
│                                                                              │
│  Level 2: HEADER-BASED COLUMN MATCHING                                      │
│  ├── Identify TENURE column using keywords                                  │
│  ├── Identify GENERAL RATE column using keywords                            │
│  ├── Identify SENIOR CITIZEN RATE column using keywords                     │
│  └── Output: Column index mapping                                           │
│                                                                              │
│  Level 3: KEYWORD-BASED PARSING                                             │
│  ├── Search for tenure keywords in unstructured text                        │
│  ├── Search for rate patterns                                               │
│  └── Output: List of raw rate dictionaries                                  │
│                                                                              │
│  Level 4: PATTERN RECOGNITION                                               │
│  ├── Regex pattern: "(\d+ days?)\s*[-:]\s*(\d+\.?\d*)%"                    │
│  ├── Extract tenure and rate pairs                                          │
│  └── Output: List of raw rate dictionaries                                  │
│                                                                              │
│  Level 5: PDF TABLE EXTRACTION                                              │
│  ├── Use pdfplumber to open PDF                                             │
│  ├── Extract tables from each page                                          │
│  ├── Clean and normalize cell content                                       │
│  └── Apply Level 2 parsing to extracted tables                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Level 1: Semantic Table Detection

#### Browser-Side JavaScript Execution

The system executes JavaScript in the browser context to extract tables:

```javascript
// Executed in browser context via page.evaluate()
() => {
  const results = [];

  // 1. Standard HTML tables with colspan/rowspan expansion
  const standardTables = document.querySelectorAll("table");
  standardTables.forEach((table) => {
    const rows = table.querySelectorAll("tr");
    const grid = [];

    // Build 2D grid accounting for colspan/rowspan
    rows.forEach((tr, rIndex) => {
      let colIndex = 0;
      tr.querySelectorAll("th, td").forEach((cell) => {
        // Find next available column
        while (grid[rIndex][colIndex] !== undefined) colIndex++;

        const text = cell.innerText.trim();
        const colspan = cell.colSpan || 1;
        const rowspan = cell.rowSpan || 1;

        // Fill grid cells
        for (let r = 0; r < rowspan; r++) {
          for (let c = 0; c < colspan; c++) {
            grid[rIndex + r][colIndex + c] = text;
          }
        }
        colIndex += colspan;
      });
    });

    results.push(grid);
  });

  // 2. ARIA role tables
  const gridTables = document.querySelectorAll('[role="table"], [role="grid"]');
  // ... similar extraction

  return results;
};
```

#### Output Format

```python
# Returns List[List[List[str]]]
# Example:
[
  [  # Table 1
    ["Tenure", "General Public", "Senior Citizen"],  # Header row
    ["7 days to 14 days", "2.75%", "3.25%"],          # Data row 1
    ["15 days to 29 days", "2.75%", "3.25%"]          # Data row 2
  ],
  [  # Table 2
    # ... another table
  ]
]
```

### 5.3 Level 2: Header-Based Column Matching

#### Keyword Definitions Table

| Category     | Keywords                                                                                            |
| ------------ | --------------------------------------------------------------------------------------------------- |
| Tenure       | `tenure`, `duration`, `period`, `days`, `months`, `years`, `maturity`, `term`, `tenor`, `tenors`    |
| General Rate | `general`, `public`, `rate`, `interest rate`, `general public`, `regular`, `non-senior`, `interest` |
| Senior Rate  | `senior`, `citizen`, `sr. citizen`, `sr`, `seniors`                                                 |

#### Matching Algorithm Steps

| Step | Process                                                                     | Priority |
| ---- | --------------------------------------------------------------------------- | -------- |
| 1    | Find TENURE column - first keyword match wins                               | Highest  |
| 2    | Find GENERAL RATE column - score-based selection (boost non-senior columns) | High     |
| 3    | Find SENIOR CITIZEN column - must contain "senior" keyword                  | Medium   |

### 5.4 Level 3 & 4: Unstructured Text Extraction

#### Pattern Matching Examples

|{}
