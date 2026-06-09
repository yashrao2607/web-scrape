import os from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import pLimit from 'p-limit';
import { logger, logAccumulator } from './core/logger.js';
import { PlaywrightBrowserManager } from './core/browser.js';
import { getScraperForBank } from './scrapers/registry.js';
import { ChangeDetector } from './core/changeDetector.js';
import { JsonWriter } from './core/jsonWriter.js';
import { ingestResults, closeDb, pingDb } from './core/db.js';
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

  // 1. Initialize input file containing all 12 banks
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
    ["Federal Bank", "https://www.federalbank.co.in/interest-rates"]
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, "Banks");
  XLSX.writeFile(wb, INPUT_EXCEL_PATH);
  logger.info("initialized_input_excel_with_12_banks", { path: INPUT_EXCEL_PATH });

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

  // 3. Setup Playwright browser manager
  const browserManager = new PlaywrightBrowserManager(true);
  await browserManager.start();

  const validationRecords = {};
  const limit = pLimit(CONCURRENCY_LIMIT);

  const tasks = banksList.map(bankInfo =>
    limit(() => scrapeBankTask(bankInfo, browserManager, validationRecords))
  );

  const results = await Promise.all(tasks);

  await browserManager.close();

  // 4. Process successful results
  const successfulResults = results.filter(r => r && r.status === "SUCCESS");

  // Map to simplified schema containing only: bank_name, url, rates (tenure, interest_rate, senior_citizen_interest_rate, tier)
  // Banks like IndusInd publish multiple rate tiers for the same tenure string (e.g. <3 Cr, 3-5 Cr).
  // Pre-pass: count occurrences per tenure. If a tenure appears once -> tier=null.
  // If it appears N>1 times -> tier=1,2,3,... in page order.
  const simplifiedResults = successfulResults.map(bank => {
    const counts = new Map();
    for (const r of bank.fd_rates) {
      counts.set(r.tenure, (counts.get(r.tenure) || 0) + 1);
    }
    const tierIndex = new Map();
    return {
      bank_name: bank.bank_name,
      url: bank.source_url,
      rates: bank.fd_rates.map(r => {
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

  // 5. Ingest into Postgres (append-mode: full history preserved).
  //    Skip if --skip-db is passed on the CLI.
  const skipDb = process.argv.includes("--skip-db");
  if (!skipDb && successfulResults.length > 0) {
    try {
      const dbOk = await pingDb();
      if (!dbOk) throw new Error("pingDb returned falsy");
      const ingest = await ingestResults({
        resultsPath: OUTPUT_RESULTS_PATH,
        scraperVersion: "1.0.0"
      });
      logger.info("db_ingest_complete", ingest);
    } catch (dbErr) {
      // DB failure is non-fatal: JSON file is the source of truth, scrape still succeeded.
      logger.error("db_ingest_skipped_after_failure", {
        error: dbErr.message,
        hint: "JSON output is intact. Re-run with --skip-db to skip ingestion, or fix DB and re-ingest."
      });
    } finally {
      await closeDb();
    }
  }

  // 6. Regenerate reference-banks.js from the latest DB rates.
  //    mig.js requires this file, so every successful scrape keeps it fresh.
  //    Non-fatal: if the generator fails, the existing reference-banks.js is unchanged.
  if (!skipDb) {
    try {
      const ref = await generateReferenceBanks();
      logger.info("reference_banks_generated", ref);
    } catch (refErr) {
      logger.warn("reference_banks_generation_failed", {
        error: refErr.message,
        hint: "reference-banks.js unchanged. Re-run with: node scripts/generate-reference-banks.js"
      });
    }
  }

  logger.info("scraping_pipeline_complete", { successful: successfulResults.length, total: banksList.length });

  // Write accumulated logs to scrape_log.json
  JsonWriter.writeJson(logAccumulator, OUTPUT_LOG_PATH);
}

main().catch(e => {
  console.error("Critical pipeline failure:", e);
  process.exit(1);
});
