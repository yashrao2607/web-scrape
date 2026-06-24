# Audit Findings — FD Rate Scraper

## 🔴 CRITICAL BUGS

### 1. ~~ChangeDetector silently drops tiered rates~~ ✅ FIXED
**File:** `core/changeDetector.js:55-70`

**Problem:** `oldRatesMap` and `newRatesMap` used only `r.tenure` as key. For multi-tier banks, rates with identical tenure but different tiers overwrote each other.

**Fix applied:** Keys now use `makeKey = r => \`${r.tenure}||${r.tier ?? ''}\``. All three comparison loops (`added`, `rate_changed`, `removed`) use this composite key for lookups while preserving the original `tenure` and `tier` values in the change report.

---

### 2. ~~`parseTenure` abbreviations `"Yr"`, `"Mths"` not explicitly matched~~ ✅ FIXED
**File:** `core/normalizer.js:1-3`

**Correction:** The original patterns `y(ear)?s?` and `m(onth)?s?` actually **did capture the number correctly** for "Yr" and "Mths" — the optional groups silently skipped the abbreviation letters. However, they left residual characters in `primaryPart` (e.g., "r" from "1 Yr"), which broke compound tenures like `"1 Yr 6 Mths"` (only the first part would parse).

**Fix applied:** Changed patterns to explicitly match abbreviations and consume trailing whitespace:
```
y(?:ear|r)?s?\s*   — matches y, yr, yrs, year, years
m(?:onth|th)?s?\s* — matches m, mth, mths, month, months
d(?:ay|a)?s?\s*    — matches d, da, day, days
```
`\s*` suffix enables compound tenure parsing (e.g., `"1 Yr 6 Mths"` now correctly returns 547.5 days / 18 months / 1.5 years).

---

### 3. ~~Bank of Maharashtra overwrites senior rate from ALL sources~~ ✅ FIXED
**File:** `scrapers/bankOfMaharashtraScraper.js:35-43`

**Problem:** Senior rate was unconditionally set to `general + 0.50%` for every rate from any source, clobbering correctly extracted senior columns from HTML tables.

**Fix applied:** Now checks if extracted senior rate is missing or identical to general (within 0.01 tolerance) before applying the +0.50% premium.

---

### 4. ~~Shriram Finance: reversed fallback order~~ ✅ FIXED
**File:** `scrapers/shriramFinanceScraper.js:21-31`

**Problem:** `parseRatesFromText` ran before HTML table extraction (opposite of all other scrapers), discarding table data if text parsing produced results.

**Fix applied:** Swapped to standard fallback order: tables → `parseRatesFromText` → `extractFromUnstructuredText`. The index-4 column assumption (`nums[4]` on line 82) remains — requires page layout audit to confirm correctness.

---

## 🟡 MODERATE ISSUES

### 5. ~~Registry exact-name mismatches~~ ✅ FIXED
**File:** `scrapers/registry.js:36-39`

| Before | After | main.js Excel Name |
|---|---|---|
| `"IDFC"` | `"IDFC First Bank"` | `"IDFC First Bank"` |
| `"South Indian bank"` | `"South Indian Bank"` | `"South Indian Bank"` |
| `"Federal bank"` | `"Federal Bank"` | `"Federal Bank"` |

**Fix applied:** Changed registry keys to exactly match main.js Excel names. Fuzzy fallback still works for any future name variants.

---

### 6. ~~Central Bank & RBL skip senior rate index 1 with 3+ matches~~ ✅ FIXED
**Files:** `scrapers/centralBankOfIndiaScraper.js:98`, `scrapers/rblBankScraper.js:100`

**Problem:** Both used `>= 3 ? index 2 : index 0/1` pattern. With 2 matches, RBL used index 0 (general) as senior, skipping the actual senior column. With 3+ matches, both skipped index 1 entirely.

**Fix applied:** Both now use `>= 2 ? index 1 : index 0` — second rate column is always used as senior when available, falling back to general rate when only one rate exists.

---

### 7. ~~Indian Bank text fallback loses senior column~~ ✅ FIXED
**File:** `scrapers/indianBankScraper.js:108`

**Problem:** `senior_raw` always used `rateMatches[0][1]` (same as general), discarding the actual senior column in the page text.

**Fix applied:** Changed to `rateMatches.length >= 2 ? rateMatches[1][1] : rateMatches[0][1]`. The existing +0.50% post-process still correctly fires only when senior is genuinely absent or equal to general.

---

### 8. ~~`v_latest_rates` view can't detect removed rates~~ ✅ FIXED
**Files:** `sql/schema.sql:73-84`, `core/postgres.js:224-235`

**Problem:** The correlated subquery found the latest run per `(bank, tenure, tier)`. If a bank removed a tenure/tier, its old rate persisted forever.

**Fix applied:** Added a second subquery that filters to the latest overall run per bank: `AND r.scrape_run_id = (SELECT MAX(r3.scrape_run_id) FROM rates r3 WHERE r3.bank_id = r.bank_id)`. Removed rates no longer appear because they aren't in the bank's latest run.

---

### 9. ~~API uses global latest run~~ ✅ FIXED
**File:** `deploy/vercel/api/index.js`

**Problem:** `getLatestRunId()` returned a global latest `scrape_run_id` across all banks. Banks that failed in the latest run were invisible to the API.

**Fix applied:** Replaced `getLatestRunId()` with `getLatestRunForBank(bankId)` which queries the latest run that has rates for that specific bank. Both `/api/latest` and `/api/rates/:bankName` endpoints now use per-bank latest runs. Dead code removed, `mapRates()` extracted as shared helper.

---

### 10. PostgreSQL UNIQUE constraint allows duplicate NULL tiers
**File:** `sql/schema.sql:48`, `sql/schema.sql:33-34`

PostgreSQL UNIQUE constraints treat NULLs as distinct. So `(run_1, bank_1, "1 Year", NULL)` can exist multiple times. The `ignoreDuplicates: true` in `postgres.js:303` relies on this constraint and would NOT prevent these duplicates. Only the main.js dedup (line 178-188) prevents them.

**Fix:** Either enforce the dedup at the database level with a partial unique index that handles NULLs, or keep the application-level dedup as the sole guard.

---

## 🟢 MINOR / COSMETIC ISSUES

### 11. PDF extractor requires decimal point in rates
**File:** `core/extractor.js:392`

`(\d+\.\d+)` requires a decimal point. Integer rates like `7` (without `.00`) do not match and are silently skipped.

**Fix:** Make the decimal portion optional: `(\d+(?:\.\d+)?)`.

---

### 12. Unstructured text extractor requires `%` sign
**File:** `core/extractor.js:350`

The pattern `(\d+(?:\.\d+)?)\s*%` requires a trailing `%`. Lines like `"7 Days: 7.50"` (no %) won't match.

**Fix:** Make the `%` optional, or add a second pattern without it.

---

### 13. LIC Housing — duplicate regex alternation entry
**File:** `scrapers/licHousingFinanceScraper.js:61`

```js
const TENURE_LIKE = /^\d+\s*(Year|Month|day|day)/i;
```

`day` appears twice. Harmless but sloppy.

---

### 14. 8 of 11 custom scrapers share identical boilerplate
RBL, IDBI, Indian, Central, Bandhan, BOB, BOI, BOM — all have the same 3-tier pattern (HTML → text → unstructured) with near-identical iterate-over-lines + regex extraction.

---

### 15. Inconsistent `senior_raw` formatting
Some scrapers return `"7.50%"` (with `%`), others `"7.50"` (bare). Both work since `normalizeRate()` strips `%`, but inconsistent.

---

## ✅ VERIFIED CORRECT

| Component | Status |
|---|---|
| 14 standard scrapers (HDFC, SBI, ICICI, Kotak, PNB, IndusInd, Yes, IDFC, Federal, KTDFC, Axis, IOB, Canara, South Indian) | Clean |
| Bandhan, BOB, BOI text parsers | Clean indexing |
| IDBI pre-filter + parsing | Clean |
| PNB Housing senior +0.25% (no double-add) | Verified correct |
| LIC Housing pending-tenure logic | Correct |
| IOB +0.50% senior | Correct |
| Canara conditional +0.50% (≥180d) | Correct |
| Axis PDF + static HTML fallback | Correct |
| Zod schema/validation | Correct |
| `normalizeRate` (handles %, commas, edge cases) | Correct |
| main.js filtering + dedup + tier indexing | Correct |
| `processAndValidate` interval overlap, anomaly detection | Correct |
| API dedup (`dedupRates` uses `r.interest_rate`) | Now correct |
| South Indian Bank — empty rates identified as known limitation | Documented |
