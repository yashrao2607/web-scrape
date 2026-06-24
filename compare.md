# Comparison of zerodha.json and webscrape.json

This document summarizes the differences found between `zerodha.json` and `webscrape.json` of bank interest rates.

## High-Level Summary

| Metric | zerodha.json | webscrape.json | Difference |
|---|---|---|---|
| **Total Banks** | 25 | 24 | -1 |
| **Unique Banks** | 25 | 24 | - |

### Banks Only in zerodha.json (1)
- **IDBI Bank** (URL: `https://www.bankbazaar.com/fixed-deposit/idbi-fixed-deposit-rate.html`)

## Bank-by-Bank Detailed Comparison

### Yes Bank

- **Rates Count Difference**: zerodha has **18** entries, webscrape has **14** entries.
- **Tenures only in zerodha**:
  - `12 months 1 day to 17 months`
  - `272 days to 335 days`
  - `36 months to 59 months`
  - `18 months 1 day to 23 months`
  - `35 months`
  - `24 months to 34 months`
  - `35 months 1 day to 35 months 29 days`
  - `60 months 1 day to 120 months`
  - `60 months`
  - `336 days to 364 days`
- **Tenures only in webscrape**:
  - `18 months 1 day to less than 24 months`
  - `36 months to less than 60 months`
  - `24 months to less than 36 months`
  - `12 months 1 day to less than 18 months`
  - `272 days to less than 12 months`
  - `60 months to 120 months`
- **Discrepancies in Rates**:
  | Tenure (zerodha) | Tenure (webscrape) | Field | zerodha Value | webscrape Value |
  |---|---|---|---|---|
  | 121 days to 180 days | 121 days to 180 days | senior_citizen_interest_rate | `4.75` | `5.25` |

## Fully Identical Banks
The following banks have exactly identical URLs, tenures, and interest rates in both files:
- Axis Bank
- Bandhan Bank
- Bank of Baroda
- Bank of India
- Bank of Maharashtra
- Canara Bank
- Central Bank of India
- Federal Bank
- HDFC Bank
- ICICI Bank
- IDFC First Bank
- Indian Bank
- Indian Overseas Bank
- IndusInd Bank
- KTDFC
- Kotak Mahindra Bank
- LIC Housing Finance
- PNB
- PNB Housing Finance
- RBL Bank
- SBI
- Shriram Finance
- South Indian Bank
