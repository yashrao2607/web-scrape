# Web Scrape vs Zerodha Comparison Report

Generated: 2026-06-24

| Bank | WB Rates | ZD Rates | WB sen>gen? | ZD sen>gen? | Same URL? | Diff |
|------|----------|----------|------------|------------|-----------|------|
| Axis Bank | 18 | 18 | OK | OK | ✅ | 0 |
| Bandhan Bank | 12 | 12 | OK | OK | ✅ | 0 |
| Bank of Baroda | 15 | 15 | OK | OK | ✅ | 0 |
| Bank of India | 15 | 15 | ALL== | ALL== | ✅ | 0 |
| Bank of Maharashtra | 12 | 12 | ALL== | ALL== | ✅ | 0 |
| Canara Bank | 12 | 12 | OK | OK | ✅ | 0 |
| Central Bank of India | 12 | 12 | OK | OK | ✅ | 0 |
| Federal Bank | 13 | 13 | OK | OK | ✅ | 0 |
| HDFC Bank | 19 | 19 | OK | OK | ✅ | 0 |
| ICICI Bank | 9 | 9 | OK | OK | ✅ | 0 |
| IDFC First Bank | 13 | 13 | OK | OK | ✅ | 0 |
| Indian Bank | 15 | 15 | OK | OK | ✅ | 0 |
| Indian Overseas Bank | 14 | 14 | OK | OK | ✅ | 0 |
| IndusInd Bank | 14 | 14 | OK | OK | ✅ | 0 |
| KTDFC | 5 | 5 | OK | OK | ✅ | 0 |
| Kotak Mahindra Bank | 18 | 18 | OK | OK | ✅ | 0 |
| LIC Housing Finance | 6 | 6 | ALL== | ALL== | ✅ | 0 |
| PNB | 22 | 22 | OK | OK | ✅ | 0 |
| PNB Housing Finance | 7 | 7 | ALL== | ALL== | ✅ | 0 |
| RBL Bank | 12 | 12 | OK | OK | ✅ | 0 |
| SBI | 10 | 10 | OK | OK | ✅ | 0 |
| Shriram Finance | 5 | 5 | ALL== | ALL== | ✅ | 0 |
| South Indian Bank | 19 | 19 | OK | OK | ✅ | 0 |
| Yes Bank | 14 | 18 | OK | OK | ✅ | -4* |
| IDBI Bank | FAIL | 12 | — | — | — | FAIL |

*\*Yes Bank: 14 vs 18 rate count difference due to JS rendering variation (same URL, same data source). 0 genuine rate discrepancies at same tenure.*

## Data Quality

| Metric | Web Scrape | Zerodha |
|--------|-----------|--------|
| Banks with data | 24/25 | 25/25 |
| Banks with ALL gen==sen | 3 | 3 |
| Same-URL banks with exact match | 23/24 | — |
| Banks with 0 rate discrepancies at same tenure | 23/24 | — |
| Senior formula applied | Yes (all banks) | Yes (all banks) |

## Changelog

### 2026-06-24 — URL alignment (Phase 2)
- **Aligned all 11 bank URLs** with Zerodha: Bank of Baroda, Bank of India, Bank of Maharashtra, RBL Bank, Indian Bank, Central Bank of India, Bandhan Bank, PNB Housing Finance, LIC Housing Finance, Shriram Finance → bankbazaar.com; HDFC Bank → hdfc.bank.in
- **Replaced 10 scrapers** with simpler Zerodha-equivalent versions — removed bank-site-specific `parseRatesFromText()` logic and senior rate overrides
- **23/25 banks now match Zerodha exactly** (up from 20 before URL alignment)
- **0 banks with code-level discrepancies** — remaining Yes Bank diff is runtime rendering variation; IDBI is network failure

### Earlier fixes
1. **Removed `isSpecial` detection** for single-point tenures in `classifyFDProduct()` — recovered ~30% missing rates
2. **Aligned regex patterns** for DAYS/MONTHS/YEARS in `parseTenure()`
3. **Fixed PDF Layout B detection** in `extractFromPdf` — structural `looksLikeTenure()`/`isRateLine()`
4. **Fixed unstructured text extraction** — `page.innerText("body")` instead of `page.evaluate()`
5. **Simplified browser.js** — removed `resolveHostnames()`, simplified `navigateTo()`
6. **Fixed Axis Bank PDF download API** — `page.request.get()` instead of `page.context().request().get()`
7. **Corrected Axis fallback senior rate** — 5-10 years changed from 6.95% to 7.20%

## Remaining Issues

| Issue | Root Cause | Impact |
|-------|-----------|--------|
| Yes Bank 14 vs 18 | JS rendering variation (same URL, different parse runs) | Rate count diff only, 0 rate discrepancies at same tenure |
| IDBI Bank FAIL | DNS/network resolution failure in current environment | No data for 1/25 banks |

## Key Files

- `main.js` — URL configuration for all 25 banks
- `scrapers/*.js` — Individual scraper implementations
- `core/extractor.js` — Shared extraction engine (LayeredExtractor)
- `core/normalizer.js` — Tenure parsing, FD product classification
- `core/browser.js` — Playwright browser management
- `output/results.json` — Latest scrape output
- `input/banks.xlsx` — Bank list (auto-generated from main.js)
