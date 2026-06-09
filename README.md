# Enterprise Fixed Deposit Scraping Platform (Node.js)

A production-grade, enterprise-scale data scraping and normalization platform written in **Node.js (ES Modules)** to extract, validate, and track Fixed Deposit (FD) interest rates from **12 major Indian banks**. 

The system leverages Playwright for headless browser automation, Cheerio for fast fallback HTML parsing, PDF parsing utilities for document analysis, Zod for strict schema validation, and Pino for high-performance structured logging.

---

## 1. Supported Banks & Extraction Strategies

The platform handles various front-end technologies, Akamai protection policies, and document formats. Below is a breakdown of the specific logic applied to each of the 12 banks:

| Bank Name | Target URL | Scraping Strategy & Implementation |
| :--- | :--- | :--- |
| **HDFC Bank** | [HDFC FD Rates](https://www.hdfcbank.com/personal/save/deposits/fixed-deposit-interest-rates) | **Akamai Anti-Bot Bypass + Cheerio Fallback**: Attempts live navigation. If Akamai bot protection drops the request or triggers a timeout, it automatically falls back to [hdfc_fallback.html](file:///d:/Blostem-projects/web%20scrape/scrapers/hdfc_fallback.html) to parse the interest rates. |
| **SBI** | [SBI Retail term deposits](https://sbi.co.in/web/interest-rates/deposit-rates/retail-domestic-term-deposits) | **Standard Table Extraction**: Scrapes the retail term deposit page, filters nested tables, and isolates general vs. senior citizen rates. |
| **ICICI Bank** | [ICICI FD Rates](https://www.icicibank.com/personal-banking/deposits/fixed-deposit/fd-interest-rates) | **Dynamic Accordion Simulation**: Simulates a user click on the `"Less than 3 Cr."` tab button to refresh the DOM. This loads the full retail rate table (10 tenures) instead of the default 2-row "Popular FD Rates" accordion and avoids premature closure penalty tables. |
| **Axis Bank** | [Axis FD Rates PDF](https://www.axis.bank.in/docs/default-source/default-document-library/interest-rates/domestic-fixed-deposits-06-june-26.pdf?sfvrsn=5eb4a7d0_1) | **HTTP-GET PDF Downloader + Cheerio Fallback**: Direct PDF downloads under automation often trigger 403 Forbidden redirects. Therefore, Axis Bank leverages a pre-fetched clean local HTML fallback ([axis_fallback.html](file:///d:/Blostem-projects/web%20scrape/scrapers/axis_fallback.html)) to parse 18 retail rate slabs with Cheerio. |
| **Kotak Mahindra Bank** | [Kotak Interest Rates](https://www.kotak.com/en/rates/interest-rates.html) | **Structured Table Filter**: Locates the domestic term deposit tables, flattens column-spanned headers, and explicitly ignores "RECURRING DEPOSIT" tables using keyword exclusion logic. |
| **PNB** | [PNB Interest Rates](https://www.pnbindia.in/interest-rates-deposit.html) | **Dual Table Parser**: Identifies the w.e.f. rate tables, filters out penalty/charges tables by checking for penal headers, and extracts the core slab rates. |
| **IndusInd Bank** | [IndusInd Rates](https://www.indusind.bank.in/in/en/personal/rates.html) | **DOM Table Extraction**: Navigates to the interest rate portal and extracts the retail fixed deposit grid. |
| **Yes Bank** | [Yes Bank FD Rates](https://www.yes.bank.in/personal-banking/yes-individual/deposits/fixed-deposit) | **HTTP/2 Anti-Bot Fallback**: Employs live DOM extraction. If Yes Bank's HTTP/2 handshake drops, it automatically falls back to [yes_bank_fallback.html](file:///d:/Blostem-projects/web%20scrape/scrapers/yes_bank_fallback.html) with current rates effective June 2, 2026. |
| **IDFC First Bank** | [IDFC First FD Rates](https://www.idfcfirstbank.com/personal-banking/deposits/fixed-deposit/fd-interest-rates) | **Padding & Note-Filtering**: Pads all rows to the maximum table width. Excludes note/disclaimer rows containing numbers (e.g., "Note: Minimum tenure is 1 year") by length limits and keyword filtering, ensuring precise header alignment. |
| **Indian Overseas Bank** | [IOB Deposit Rates](https://www.iob.bank.in/en/domestic-nro-nre-retail-term-deposit-rates) | **Dynamic Footnote calculation**: The IOB page lists only general citizen rates. The scraper extracts the general rates and dynamically computes the senior citizen rate by adding the flat **+0.50% premium** as defined in the bank's footnote policy. |
| **South Indian Bank** | [South Indian Bank Rates](https://www.southindianbank.com/interestrates/interestrates.aspx) | **Kalpakanidhi Filter**: Locates the domestic term deposit tables, filters out the Kalpakanidhi (KND) quarterly compounding tables to avoid duplication, and extracts the retail term rates. |
| **Federal Bank** | [Federal Bank Interest Rates](https://www.federalbank.co.in/interest-rates) | **Standard Table Parser**: Scrapes the deposit rates page and automatically filters out penal interest tables using keyword checks. |

---

## 2. Core Architecture

The system is organized into modular ES Modules files inside the `core/` and `scrapers/` folders:

*   **[main.js](file:///d:/Blostem-projects/web%20scrape/main.js)**: CLI Entry point. Seeds/reads bank coordinates from Excel, initializes the browser manager, runs scrapers concurrently with a thread pool limit of 5, performs change-detection, and persists outputs.
*   **[core/browser.js](file:///d:/Blostem-projects/web%20scrape/core/browser.js)**: Playwright headless browser manager configured with custom viewport sizes, long timeout tolerances, and realistic User-Agent headers to prevent bot-detection.
*   **[core/extractor.js](file:///d:/Blostem-projects/web%20scrape/core/extractor.js)**: Multi-layered Cheerio/DOM table parser. Employs semantic table tag matching, rowspan/colspan expansion, dynamic row padding, and header keyphrase filtering (e.g. mapping "Tenure", "General Rate", "Senior Citizen Rate").
*   **[core/normalizer.js](file:///d:/Blostem-projects/web%20scrape/core/normalizer.js)**: Normalizes raw interest rate strings (e.g., converting `"7.25% p.a."` to `7.25`) and resolves diverse tenure strings (e.g. `"7 days to 14 days"`, `"1 Year 11 days"`, `"180 days - 269 days"`) into precise `min_days` and `max_days` bounds.
*   **[core/validators.js](file:///d:/Blostem-projects/web%20scrape/core/validators.js)**: Zod schemas representing `FDRateItem` and `BankFDScheme`. Performs runtime validation and calculates a data quality score (0.0 to 1.0) based on completeness.
*   **[core/changeDetector.js](file:///d:/Blostem-projects/web%20scrape/core/changeDetector.js)**: Compares current scraped rates against `results.json` from the last run, outputting a precise delta report in `change_report.json` identifying added/removed tenures, rate adjustments, and policy updates.
*   **[core/jsonWriter.js](file:///d:/Blostem-projects/web%20scrape/core/jsonWriter.js)**: Robust file persistence utility that writes results, logs, and creates detailed JSON validation logs.

---

## 3. Strict Validation & Normalization Policies

To ensure data integrity, the base scraper applies several quality gates:
1.  **Inversion Rejection**: Checks if `min_days > max_days`. For instance, tenure strings incorrectly resolved as `185 days to < 1 Year` (where min is greater than max) are automatically rejected.
2.  **Rate Lower-Bound Audit**: Rejects any retail rate below **2.0%** to filter out placeholder values, penalties, or unrelated fees.
3.  **Interval Overlap Detection**: Detects and logs warning alerts for overlapping tenures (e.g., `1 year` ending at 365 days and `Above 1 year` starting at 365 days) which helps identify mixed tables.
4.  **Skipping RD/Penalty Tables**: Automatically skips tables containing terms like "RECURRING DEPOSIT", "PENALTY", "PREMATURE", or "CHARGES" in their headers.

---

## 4. Output Schema Specification

The final generated data file is stored in `output/results.json`. It is strictly formatted as a JSON array of bank objects containing **only** the following keys:

```json
[
  {
    "bank_name": "HDFC Bank",
    "url": "https://www.hdfcbank.com/personal/save/deposits/fixed-deposit-interest-rates",
    "rates": [
      {
        "tenure": "7 days to 14 days",
        "interest_rate": 2.75,
        "senior_citizen_interest_rate": 3.25
      },
      ...
    ]
  }
]
```

- **`bank_name`**: The clean string name of the bank.
- **`url`**: The original URL source from which the rates were collected.
- **`rates`**: List of rate objects, each containing:
  - **`tenure`**: Clean normalized tenure string (e.g. `"1 Year to less than 15 Months"`).
  - **`interest_rate`**: Validated interest rate for general public (number).
  - **`senior_citizen_interest_rate`**: Validated interest rate for senior citizens (number).

No other fields, placeholders, null rates, or invalid values are written into `output/results.json`.

---

## 5. Directory Structure

```text
web-scrape/
├── main.js                  # CLI runner and scraping orchestrator
├── package.json             # Node.js dependencies & test scripts
├── package-lock.json        # Node.js lockfile
├── README.md                # Comprehensive documentation (this file)
│
├── core/                    # Core modules
│   ├── browser.js           # Headless Playwright browser wrapper
│   ├── changeDetector.js    # Delta comparison logic
│   ├── extractor.js         # DOM/Cheerio table extractor
│   ├── jsonWriter.js        # File saving & validation report output
│   ├── logger.js            # Pino logger instance
│   ├── normalizer.js        # Tenure parsing & rate formatting logic
│   └── validators.js        # Zod schemas & quality score transforms
│
├── scrapers/                # Scraper modules
│   ├── baseScraper.js       # Base abstract class with verification hooks
│   ├── registry.js          # central registry loading all scrapers
│   ├── *Scraper.js          # Individual scraper files for the 12 banks
│   └── *fallback.html       # Clean fallback HTML for anti-bot tolerance
│
├── tests/                   # Native test runner tests
│   ├── normalizer.test.js   # Normalizer/tenure parser test suite
│   └── validators.test.js   # Zod schema and quality scoring tests
│
├── input/
│   └── banks.xlsx           # Excel seed spreadsheet containing Bank Names and URLs
│
├── scratch/
│   ├── verify_schema.js     # Schema cross-verification script
│   └── *.js                 # Temporary verification scripts
│
└── output/                  # Data outputs and reports
    ├── results.json         # Clean, validated interest rates
    ├── change_report.json   # Detected rate changes since last run
    ├── validation_report.json # Schema warnings and validation flags
    └── scrape_log.json      # Complete execution logs in JSON format
```

---

## 6. Installation & Execution

### Prerequisites
*   [Node.js](https://nodejs.org/) (v20+ recommended)
*   Windows, macOS, or Linux OS

### Local Setup
1.  **Install dependencies**:
    ```bash
    npm install
    ```
2.  **Install Playwright browser binaries**:
    ```bash
    npx playwright install chromium
    ```

### Running the Scraper Pipeline
```bash
node main.js
```
This runs the full scraping pipeline concurrently. Once finished, inspect the outputs in the `output/` folder.

### Running the Test Suite
The tests leverage Node.js's native test runner (`node --test`), which requires zero external testing frameworks:
```bash
node --test tests/normalizer.test.js tests/validators.test.js
```

### Running the Schema Verification Script
To verify the output file format matches our schema and validation guidelines:
```bash
node scratch/verify_schema.js
```
Expected output:
```text
Verifying 12 banks in results.json...
All banks verified successfully. The results.json strictly matches the required schema and constraints!
```
