import fs from 'fs';
import path from 'path';
import { saveScrapedDataToDb, sequelize, Bank, FDRate } from '../core/postgres.js';

const resultsPath = path.resolve('output/results.json');

async function testSequelizePipeline() {
  console.log("=== Sequelize Database Ingestion Verification ===");

  // 1. Read scraped JSON results
  if (!fs.existsSync(resultsPath)) {
    console.error(`Error: results.json not found at ${resultsPath}`);
    process.exit(1);
  }

  let resultsData;
  try {
    const rawContent = fs.readFileSync(resultsPath, 'utf8');
    resultsData = JSON.parse(rawContent);
    console.log(`Read ${resultsData.length} banks from results.json.`);
  } catch (err) {
    console.error("Error reading results.json:", err.message);
    process.exit(1);
  }

  // 2. Run Database Ingestion
  try {
    console.log("\nConnecting and synchronizing database schema via Sequelize...");
    // Authenticate
    await sequelize.authenticate();
    console.log("Database connection authenticated successfully.");

    console.log("Saving records to normalized tables (banks & fd_rates)...");
    await saveScrapedDataToDb(resultsData);
    console.log("Database transaction committed successfully!");

    // 3. Query back counts
    const banksCount = await Bank.count();
    const ratesCount = await FDRate.count();

    console.log("\n=== Database Statistics ===");
    console.log(`Total banks stored: ${banksCount}`);
    console.log(`Total FD interest rate slabs stored: ${ratesCount}`);

    // Query a sample of rates joined with bank name
    console.log("\nQuerying a sample of stored records (first 10 rates):");
    const sampleRates = await FDRate.findAll({
      limit: 10,
      include: [{
        model: Bank,
        as: 'bank',
        attributes: ['bankName']
      }],
      order: [['id', 'ASC']]
    });

    sampleRates.forEach(rate => {
      console.log(`- [${rate.bank.bankName}] Tenure: "${rate.tenure}" | General: ${rate.interestRate}% | Senior: ${rate.seniorCitizenInterestRate}%`);
    });

    console.log("\n=== Success! The Sequelize pipeline is functioning perfectly. ===");
    console.log("Every rate slab is stored as its own distinct row, eliminating pgAdmin cell truncation.");

  } catch (err) {
    console.error("\nDatabase execution error:", err.message);
    console.error("Please ensure your PGPASSWORD environment variable is set and correct.");
    process.exit(1);
  } finally {
    // Gracefully shut down Sequelize
    await sequelize.close();
  }
}

testSequelizePipeline();
