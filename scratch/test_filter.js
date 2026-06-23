import { PlaywrightBrowserManager } from '../core/browser.js';
import { getScraperForBank } from '../scrapers/registry.js';
import { logger } from '../core/logger.js';

async function testFilter() {
  console.log("=== Dry-Running Scraped Rates Filtering ===");
  
  const browserManager = new PlaywrightBrowserManager(true);
  await browserManager.start();

  const banks = [
    "HDFC Bank",
    "SBI",
    "ICICI Bank",
    "Axis Bank",
    "Kotak Mahindra Bank",
    "PNB",
    "IndusInd Bank",
    "Yes Bank",
    "IDFC First Bank",
    "Indian Overseas Bank",
    "South Indian Bank",
    "Federal Bank"
  ];
  const page = await browserManager.getPage();

  for (const bankName of banks) {
    console.log(`\nTesting Bank: ${bankName}...`);
    const ScraperCls = getScraperForBank(bankName);
    
    // We'll use fallbacks or navigations
    let url = "";
    if (bankName === "HDFC Bank") url = "https://www.hdfcbank.com/personal/save/deposits/fixed-deposit-interest-rates";
    else if (bankName === "SBI") url = "https://sbi.co.in/web/interest-rates/deposit-rates/retail-domestic-term-deposits";
    else if (bankName === "ICICI Bank") url = "https://www.icicibank.com/personal-banking/deposits/fixed-deposit/fd-interest-rates";
    else if (bankName === "Axis Bank") url = "https://www.axis.bank.in/docs/default-source/default-document-library/interest-rates/domestic-fixed-deposits-06-june-26.pdf?sfvrsn=5eb4a7d0_1";
    else if (bankName === "Kotak Mahindra Bank") url = "https://www.kotak.com/en/rates/interest-rates.html";
    else if (bankName === "PNB") url = "https://www.pnbindia.in/interest-rates-deposit.html";
    else if (bankName === "IndusInd Bank") url = "https://www.indusind.bank.in/in/en/personal/rates.html";
    else if (bankName === "Yes Bank") url = "https://www.yes.bank.in/personal-banking/yes-individual/deposits/fixed-deposit";
    else if (bankName === "IDFC First Bank") url = "https://www.idfcfirstbank.com/personal-banking/deposits/fixed-deposit/fd-interest-rates";
    else if (bankName === "Indian Overseas Bank") url = "https://www.iob.bank.in/en/domestic-nro-nre-retail-term-deposit-rates";
    else if (bankName === "South Indian Bank") url = "https://www.southindianbank.com/interestrates/interestrates.aspx";
    else if (bankName === "Federal Bank") url = "https://www.federalbank.co.in/interest-rates";

    try {
      try {
        await browserManager.navigateTo(page, url);
      } catch (navErr) {}

      const scraper = new ScraperCls(bankName, url);
      const rawData = await scraper.scrape(page);
      
      const errors = [];
      const validated = scraper.processAndValidate(rawData, errors);
      
      const rawCount = validated.fd_rates ? validated.fd_rates.length : 0;
      
      // Apply strict filter
      const filtered = (validated.fd_rates || []).filter(r => 
        r.product_type === "retail_fd" &&
        r.deposit_category === "regular" &&
        (r.customer_segment === "resident" || r.customer_segment === "mixed") &&
        r.callable === true &&
        r.scheme_type === "regular_fd"
      );

      console.log(`- Raw Rates count: ${rawCount}`);
      console.log(`- Filtered Rates count: ${filtered.length}`);

      if (filtered.length === 0 && rawCount > 0) {
        console.warn(`  [Warning]: Filtered count is 0 but raw count is ${rawCount}!`);
      } else if (bankName === "IndusInd Bank") {
        console.log("  Sample IndusInd Filtered Tenures:");
        filtered.slice(0, 5).forEach(r => {
          console.log(`    * Tenure: "${r.tenure}" | Gen: ${r.general_rate}% | Sr: ${r.senior_citizen_rate}%`);
        });
      }
    } catch (err) {
      console.error(`  Error scraping ${bankName}:`, err.message);
    }
  }

  await page.close();
  await browserManager.close();
  console.log("\n=== Dry-Run Complete ===");
}

testFilter();
