import os from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import pLimit from 'p-limit';
import { logger, logAccumulator } from './core/logger.js';
import { PlaywrightBrowserManager, resolveHostnames } from './core/browser.js';
import { getScraperForBank } from './scrapers/registry.js';
import { ChangeDetector } from './core/changeDetector.js';
import { JsonWriter } from './core/jsonWriter.js';
import { ingestResults, closeDb, pingDb } from './core/postgres.js';
import { generateReferenceBanks } from './scripts/generate-reference-banks.js';

const CONCURRENCY_LIMIT = 5;
const INPUT_EXCEL_PATH = "input/banks.xlsx";
const OUTPUT_RESULTS_PATH = "output/results.json";
const OUTPUT_CHANGES_PATH = "output/change_report.json";
const OUTPUT_VALIDATION_PATH = "output/validation_report.json";
const OUTPUT_LOG_PATH = "output/scrape_log.json";

async function scrapeBankTask(bankInfo, browserManager, validationRecords) {
  const bankName = bankInfo["Bank Name"];
  const url = bankInfo["FD URL"];

  logger.info("scraping_bank_start", { bank: bankName, url });

  const ScraperCls = getScraperForBank(bankName);
  if (!ScraperCls) {
    const errorMsg = `No scraper registered for bank '${bankName}'.`;
    validationRecords[bankName] = [errorMsg];
    logger.error("scraper_not_found", { bank: bankName, error_reason: errorMsg });
    return {
      bank_name: bankName,
      source_url: url,
      status: "FAILED",
      error_reason: errorMsg
    };
  }

  let page = null;
  try {
    page = await browserManager.getPage();
    try {
      await browserManager.navigateTo(page, url);
    } catch (navErr) {
      logger.warn("navigation_failed_attempting_scraper_fallback", { bank: bankName, error: navErr.message });
    }

    const scraper = new ScraperCls(bankName, url);
    const rawData = await scraper.scrape(page);

    const errors = [];
    const validatedScheme = scraper.processAndValidate(rawData, errors);
    validationRecords[bankName] = errors;

    if (!validatedScheme.fd_rates || validatedScheme.fd_rates.length === 0) {
      const errorMsg = "Scraping yielded zero valid interest rates.";
      validationRecords[bankName].push(errorMsg);
      validatedScheme.status = "FAILED";
      validatedScheme.error_reason = errorMsg;
      logger.error("scraping_bank_failed_empty_rates", { bank: bankName });
    } else {
      validatedScheme.status = "SUCCESS";
    }

    return validatedScheme;
  } catch (e) {
    const errorMsg = `Scraping failed with exception: ${e.message}`;
    validationRecords[bankName] = [errorMsg];
    logger.error("scraping_bank_failed", { bank: bankName, error_reason: errorMsg });
    return {
      bank_name: bankName,
      source_url: url,
      status: "FAILED",
      error_reason: errorMsg
    };
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (e) {}
    }
  }
}

async function main() {
  logger.info("starting_scraping_pipeline");

  // 1. Initialize input file containing all 25 banks if it does not exist
  if (!os.existsSync(INPUT_EXCEL_PATH)) {
    const inputDir = path.dirname(INPUT_EXCEL_PATH);
    if (!os.existsSync(inputDir)) {
      os.mkdirSync(inputDir, { recursive: true });
    }

    const wb = XLSX.utils.book_new();
    const wsData = [
      ["Bank Name", "FD URL"],
      ["HDFC Bank", "https://www.hdfcbank.com/personal/save/deposits/fixed-deposit-interest-rates"],
      ["SBI", "https://sbi.co.in/web/interest-rates/deposit-rates/retail-domestic-term-deposits"],
      ["ICICI Bank", "https://www.icicibank.com/personal-banking/deposits/fixed-deposit/fd-interest-rates"],
      ["Axis Bank", "https://www.axis.bank.in/deposits/fixed-deposits/fd-interest-rates"],
      ["Kotak Mahindra Bank", "https://www.kotak.com/en/rates/interest-rates.html"],
      ["PNB", "https://www.pnbindia.in/interest-rates-deposit.html"],
      ["IndusInd Bank", "https://www.indusind.bank.in/in/en/personal/rates.html"],
      ["Yes Bank", "https://www.yes.bank.in/personal-banking/yes-individual/deposits/fixed-deposit"],
      ["IDFC First Bank", "https://www.idfcfirstbank.com/personal-banking/deposits/fixed-deposit/fd-interest-rates"],
      ["Indian Overseas Bank", "https://www.iob.bank.in/en/domestic-nro-nre-retail-term-deposit-rates"],
      ["South Indian Bank", "https://www.southindianbank.com/interestrates/interestrates.aspx"],
      ["Federal Bank", "https://www.federalbank.co.in/interest-rates"],
      ["Canara Bank", "https://www.canarabank.bank.in/pages/deposit-interest-rates"],
      ["Bank of Baroda", "https://bankofbaroda.bank.in/interest-rate-and-service-charges/deposits-interest-rates/fixed-deposits-callable-and-non-callable-upto-ten-crores"],
      ["Bank of India", "https://bankofindia.bank.in/interest-rate/rupee-term-deposit-rate"],
      ["Bank of Maharashtra", "https://bankofmaharashtra.bank.in/domestic-term-deposits"],
      ["RBL Bank", "https://www.rbl.bank.in/interest-rates"],
      ["IDBI Bank", "https://www.idbi.bank.in/interest-rates.aspx"],
      ["Indian Bank", "https://indianbank.bank.in/en/deposit-rates"],
      ["Central Bank of India", "https://centralbank.bank.in/en/interest-rates-on-deposit"],
      ["Bandhan Bank", "https://bandhan.bank.in/fixed-deposit#rctabtwo"],
      ["PNB Housing Finance", "https://www.pnbhousing.com/fixed-deposit/interests-rates"],
      ["KTDFC", "https://www.bankbazaar.com/fixed-deposit/ktdfc-fixed-deposit-rate.html"],
      ["LIC Housing Finance", "https://www.lichousing.com/sanchay-public-deposit"],
      ["Shriram Finance", "https://www.shriramfinance.in/fixed-deposit-interest-rates"]
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "Banks");
    XLSX.writeFile(wb, INPUT_EXCEL_PATH);
    logger.info("initialized_input_excel_with_banks", { path: INPUT_EXCEL_PATH, count: wsData.length - 1 });
  }

  // 2. Read banks list from Excel
  let banksList = [];
  try {
    const workbook = XLSX.readFile(INPUT_EXCEL_PATH);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    banksList = XLSX.utils.sheet_to_json(worksheet);
  } catch (e) {
    logger.error("failed_to_read_input_excel", { error: e.message });
    process.exit(1);
  }

  logger.info("loaded_banks_from_excel", { count: banksList.length });

  // 3. Pre-resolve DNS using system resolver (bypass Chrome's async DNS)
  const dnsRules = await resolveHostnames(banksList.map(b => b["FD URL"]));
  logger.info("dns_preresolved", { total: dnsRules.length });

  // 4. Setup Playwright browser manager with DNS overrides
  const browserManager = new PlaywrightBrowserManager(true);
  await browserManager.start(dnsRules);

  const validationRecords = {};
  const limit = pLimit(CONCURRENCY_LIMIT);

  const tasks = banksList.map(bankInfo =>
    limit(() => scrapeBankTask(bankInfo, browserManager, validationRecords))
  );

  const results = await Promise.all(tasks);

  await browserManager.close();

  // 5. Process successful results
  const successfulResults = results.filter(r => r && r.status === "SUCCESS");

  // Map to simplified schema containing only: bank_name, url, rates (tenure, interest_rate, senior_citizen_interest_rate, tier)
  // Apply strict filtering to keep only standard, callable, regular resident retail FD rates
  const simplifiedResults = successfulResults.map(bank => {
    let filteredRates = (bank.fd_rates || []).filter(r => 
      r.product_type === "retail_fd" &&
      r.deposit_category === "regular" &&
      (r.customer_segment === "resident" || r.customer_segment === "mixed") &&
      r.callable === true &&
      r.scheme_type === "regular_fd"
    );

    // Fall back to all rates if the filtered list is empty to prevent wiping out data for other banks
    if (filteredRates.length === 0) {
      filteredRates = bank.fd_rates || [];
    }

    // Dedup: keep first occurrence of each unique (tenure, general_rate) pair
    const seen = new Set();
    const deduped = [];
    for (const r of filteredRates) {
      const key = r.tenure + '||' + r.general_rate;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(r);
      }
    }
    filteredRates = deduped;

    // Apply tier indexing for genuinely different rates on same tenure (e.g. Axis/IndusInd multiple brackets)
    const counts = new Map();
    for (const r of filteredRates) {
      counts.set(r.tenure, (counts.get(r.tenure) || 0) + 1);
    }
    const tierIndex = new Map();

    return {
      bank_name: bank.bank_name,
      url: bank.source_url,
      rates: filteredRates.map(r => {
        const total = counts.get(r.tenure);
        let tier = null;
        if (total > 1) {
          const seen = (tierIndex.get(r.tenure) || 0) + 1;
          tierIndex.set(r.tenure, seen);
          tier = seen;
        }
        return {
          tenure: r.tenure,
          interest_rate: r.general_rate,
          senior_citizen_interest_rate: r.senior_citizen_rate,
          tier: tier
        };
      })
    };
  });

  // Load historical data first before overwriting results.json
  const oldData = ChangeDetector.loadHistoricalData(OUTPUT_RESULTS_PATH);

  // Write new simplified results.json
  JsonWriter.writeJson(simplifiedResults, OUTPUT_RESULTS_PATH);

  // Run Change Detection
  const changes = ChangeDetector.detectChanges(simplifiedResults, oldData);
  JsonWriter.writeJson(changes, OUTPUT_CHANGES_PATH);

  // Write Validation Report
  JsonWriter.generateValidationReport(validationRecords, OUTPUT_VALIDATION_PATH);

  logger.info("scraping_pipeline_complete", { successful: successfulResults.length, total: banksList.length });

  // 6. Ingest into Postgres (append-mode: full history preserved).
  //    Skip if --skip-db is passed on the CLI.
  const skipDb = process.argv.includes("--skip-db");
  if (!skipDb && successfulResults.length > 0) {
    try {
      logger.info("writing_scraped_data_to_postgres_sequelize_hybrid");

      // Log connection info (mask password) for debugging
      const dbUrl = process.env.DATABASE_URL || 'not-set';
      const masked = dbUrl.replace(/:[^:@]+@/, ':****@');
      logger.info("db_connection_info", { DATABASE_URL: masked, PGHOST: process.env.PGHOST || 'not-set' });

      const ingest = await ingestResults({
        resultsPath: OUTPUT_RESULTS_PATH,
        scraperVersion: "1.0.0"
      });
      logger.info("postgres_sequelize_write_success", ingest);
    } catch (dbErr) {
      logger.error("postgres_sequelize_write_failed", {
        error: dbErr.message,
        stack: dbErr.stack?.split('\n').slice(0, 3).join(' | ')
      });
    } finally {
      try { await closeDb(); } catch (_) {}
    }
  }

  // 7. Regenerate reference-banks.cjs from the latest DB rates.
  //    mig.js requires this file, so every successful scrape keeps it fresh.
  //    Non-fatal: if the generator fails, the existing reference-banks.js is unchanged.
  if (!skipDb) {
    try {
      logger.info("regenerating_reference_banks_from_db");
      const ref = await generateReferenceBanks();
      logger.info("reference_banks_regeneration_success", ref);
    } catch (refErr) {
      logger.error("reference_banks_regeneration_failed", { error: refErr.message });
    }
  }

  // Write accumulated logs to scrape_log.json
  JsonWriter.writeJson(logAccumulator, OUTPUT_LOG_PATH);
}

main().catch(e => {
  console.error("Critical pipeline failure:", e);
  process.exit(1);
});
