import { HDFCScraper } from '../scrapers/hdfcScraper.js';
import { YesBankScraper } from '../scrapers/yesBankScraper.js';
import { AxisScraper } from '../scrapers/axisScraper.js';
import { getScraperForBank } from '../scrapers/registry.js';
import { PlaywrightBrowserManager } from '../core/browser.js';

console.log("=== RUNNING NODE.JS PART 2 SCRAPER VERIFICATION ===\n");

// 1. Verify registry lookup
console.log("1. Testing registry lookups:");
const bankNames = ["HDFC Bank", "SBI", "Axis Bank", "Yes Bank", "IDFC First Bank", "Indian Overseas Bank", "Federal Bank"];
bankNames.forEach(name => {
  const cls = getScraperForBank(name);
  console.log(`  "${name}" => ${cls ? cls.name : "Not Found"}`);
});

// 2. Test fallbacks for HDFC, YES Bank, and Axis Bank
console.log("\n2. Testing Fallback Parsers:");

// We create a mock Playwright Page that triggers fallbacks (or navigates to a blank page)
const mockPage = {
  url: () => "about:blank",
  context: () => ({
    request: {
      get: async () => ({
        status: () => 403, // Axis PDF download returns 403 to trigger fallback
        body: async () => Buffer.from("Access Denied")
      })
    }
  })
};

async function testScraperFallback(ScraperClass, name, url) {
  const scraper = new ScraperClass(name, url);
  const rawData = await scraper.scrape(mockPage);
  const errors = [];
  const result = scraper.processAndValidate(rawData, errors);
  
  console.log(`\n  --- ${name} Fallback Scrape Result ---`);
  console.log("  Rates Extracted Count:", result.fd_rates.length);
  console.log("  Errors found:", errors.length);
  console.log("  First rate item sample:", result.fd_rates.length > 0 ? JSON.stringify(result.fd_rates[0], null, 2) : "None");
  console.log("  Validation Score:", result.validation_score);
  console.log("  Scrape Confidence:", result.scrape_confidence);
  
  // Verify that customer segment was classified correctly for mixed segment tables
  const mixedSegmentsCount = result.fd_rates.filter(r => r.customer_segment === "mixed").length;
  console.log(`  Mixed segments count: ${mixedSegmentsCount} / ${result.fd_rates.length}`);
}

async function runTests() {
  await testScraperFallback(HDFCScraper, "HDFC Bank", "https://www.hdfcbank.com/personal/save/deposits/fixed-deposit-interest-rates");
  await testScraperFallback(YesBankScraper, "Yes Bank", "https://www.yes.bank.in/personal-banking/yes-individual/deposits/fixed-deposit");
  await testScraperFallback(AxisScraper, "Axis Bank", "https://www.axisbank.com/interest-rates.pdf");
  
  console.log("\n=== VERIFICATION COMPLETE ===");
}

runTests().catch(e => console.error("Test execution failed:", e));
