import os from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import pLimit from 'p-limit';
import { logger, logAccumulator } from './core/logger.js';
import { PlaywrightBrowserManager } from './core/browser.js';
import { getScraperForBank } from './scrapers/registry.js';
import { ChangeDetector } from './core/changeDetector.js';
import { JsonWriter } from './core/jsonWriter.js';
import { insertScrapedData, pool } from './core/postgres.js';

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
    ["Axis Bank", "https://www.axis.bank.in/docs/default-source/default-document-library/interest-rates/domestic-fixed-deposits-06-june-26.pdf?sfvrsn=5eb4a7d0_1"],
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

  // Map to simplified schema containing only: bank_name, url, rates (tenure, interest_rate, senior_citizen_interest_rate)
  const simplifiedResults = successfulResults.map(bank => ({
    bank_name: bank.bank_name,
    url: bank.source_url,
    rates: bank.fd_rates.map(r => ({
      tenure: r.tenure,
      interest_rate: r.general_rate,
      senior_citizen_interest_rate: r.senior_citizen_rate
    }))
  }));

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

  // Write to PostgreSQL database
  try {
    logger.info("writing_scraped_data_to_postgres");
    const rowId = await insertScrapedData(simplifiedResults);
    logger.info("postgres_write_success", { rowId });
  } catch (dbErr) {
    logger.error("postgres_write_failed", { error: dbErr.message });
  }

  // Write accumulated logs to scrape_log.json
  JsonWriter.writeJson(logAccumulator, OUTPUT_LOG_PATH);

  // Close PostgreSQL pool connections
  try {
    await pool.end();
    logger.info("postgres_pool_closed_successfully");
  } catch (dbEndErr) {
    logger.error("failed_to_close_postgres_pool", { error: dbEndErr.message });
  }
}

main().catch(e => {
  console.error("Critical pipeline failure:", e);
  process.exit(1);
});
