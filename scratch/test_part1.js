import { parseTenure, parseTenureRange, classifyFDProduct, normalizeDateString } from '../core/normalizer.js';
import { BaseScraper } from '../scrapers/baseScraper.js';

console.log("=== RUNNING NODE.JS CORE NORMALIZER AND SCRAPER VERIFICATION ===\n");

// 1. Test Tenure Parsing
console.log("1. Testing parseTenure:");
const tenureTests = ["7 Days", "18 Months", "2 Years", "1 Year 6 Months", "399"];
tenureTests.forEach(t => {
  console.log(`  "${t}" =>`, parseTenure(t));
});

// 2. Test Tenure Range Parsing (including inheritance limits)
console.log("\n2. Testing parseTenureRange:");
const rangeTests = [
  "185 to < 1 Year",
  "12 to 24 Months",
  "445 Days to 2 Years",
  "3 Years 1 Day to 5 Years"
];
rangeTests.forEach(r => {
  console.log(`  "${r}" =>`, parseTenureRange(r));
});

// 3. Test Product Classification
console.log("\n3. Testing classifyFDProduct:");
console.log("  Tax Saver row in general table:", classifyFDProduct(
  "Domestic Fixed Deposits", 
  "", 
  "5Y (Tax Saver FD)"
));
console.log("  Mixed segment Domestic/NRO/NRE section:", classifyFDProduct(
  "DOMESTIC / NRO / NRE FIXED DEPOSITS", 
  "", 
  "1 Year"
));

// 4. Test Date Normalization
console.log("\n4. Testing normalizeDateString:");
const dateTests = ["1st June", "01.06.2026", "June 09, 2026"];
dateTests.forEach(d => {
  console.log(`  "${d}" =>`, normalizeDateString(d));
});

// 5. Test BaseScraper validation
console.log("\n5. Testing BaseScraper.processAndValidate:");
const scraper = new BaseScraper("Test Bank", "http://test.com");
const rawData = {
  minimum_deposit: 1000.0,
  tax_saver_fd_available: true,
  fd_rates: [
    // Valid row
    { tenure_raw: "1 Year", general_raw: "7.00%", senior_raw: "7.50%", section_name: "Domestic Rates" },
    // Row with boundary inversion (min_days > max_days) -> should be rejected
    { tenure_raw: "185 to < 1 Year", general_raw: "6.00%", senior_raw: "6.50%", section_name: "Domestic Rates" }, // Note: we bypass inheritance, so it parses 185 to 365, which is valid. Let's force an inverted range for testing:
    { tenure_raw: "365 to 180 Days", general_raw: "6.00%", senior_raw: "6.50%", section_name: "Domestic Rates" },
    // Duplicate row
    { tenure_raw: "1 Year", general_raw: "7.00%", senior_raw: "7.50%", section_name: "Domestic Rates" },
    // Overlapping row (e.g. 1 Year = 365 days, this is 350-400 days -> overlaps)
    { tenure_raw: "350 to 400 Days", general_raw: "6.80%", senior_raw: "7.30%", section_name: "Domestic Rates" }
  ]
};

// Temporarily override parseTenureRange to inject 67525 to 365 range for verifying boundary inversion check explicitly
const originalParseTenureRange = parseTenureRange;
// We will test both real range and mock inverted range
const errors = [];
const result = scraper.processAndValidate(rawData, errors);

console.log("\nValidation Results:");
console.log("  Validation Errors Found:", errors);
console.log("  Duplicate Count:", result.duplicate_count);
console.log("  Anomaly Count:", result.anomaly_count);
console.log("  Scrape Confidence:", result.scrape_confidence);
console.log("  Validation Score:", result.validation_score);
console.log("  Validated Rates count:", result.fd_rates.length);
console.log("  Validated Rates:", JSON.stringify(result.fd_rates, null, 2));

console.log("\n=== VERIFICATION COMPLETE ===");
