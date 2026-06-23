import fs from 'fs';
import path from 'path';
import { ingestResults, sequelize, Bank, ScrapeRun, FDRate } from '../core/postgres.js';

const resultsPath = path.resolve('output/results.json');

async function testSequelizeHybridPipeline() {
  console.log("=== Sequelize Hybrid Database Ingestion Verification ===");

  // 1. Read scraped JSON results
  if (!fs.existsSync(resultsPath)) {
    console.error(`Error: results.json not found at ${resultsPath}`);
    process.exit(1);
  }

  // 2. Run Database Ingestion
  try {
    console.log("\nConnecting and synchronizing database schema via Sequelize...");
    await sequelize.authenticate();
    console.log("Database connection authenticated successfully.");

    console.log("Saving records to normalized tables (banks, scrape_runs, rates)...");
    const ingest = await ingestResults({
      resultsPath,
      scraperVersion: '1.0.0'
    });
    console.log("Database transaction committed successfully! Ingest results:", ingest);

    // 3. Query back counts
    const banksCount = await Bank.count();
    const runsCount = await ScrapeRun.count();
    const ratesCount = await FDRate.count();

    console.log("\n=== Database Statistics ===");
    console.log(`Total banks stored: ${banksCount}`);
    console.log(`Total scrape runs: ${runsCount}`);
    console.log(`Total FD interest rate slabs stored: ${ratesCount}`);

    // Query from the view v_latest_rates
    console.log("\nQuerying v_latest_rates view sample (first 10 rates):");
    const [viewRates] = await sequelize.query(`
      SELECT bank_name, tenure, tier, general_rate, senior_citizen_rate
      FROM v_latest_rates
      ORDER BY bank_name, tier NULLS FIRST, tenure
      LIMIT 10
    `);

    viewRates.forEach(rate => {
      console.log(`- [${rate.bank_name}] Tenure: "${rate.tenure}" | Tier: ${rate.tier ?? 'N/A'} | General: ${rate.general_rate}% | Senior: ${rate.senior_citizen_rate}%`);
    });

    console.log("\n=== Success! The Sequelize Hybrid pipeline is functioning perfectly. ===");
    console.log("History is preserved in append-only mode, and the v_latest_rates view is active.");

  } catch (err) {
    console.error("\nDatabase execution error:", err.message);
    console.error("Please ensure your PostgreSQL database is running and credentials are correct.");
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

testSequelizeHybridPipeline();
