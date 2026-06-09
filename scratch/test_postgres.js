import fs from 'fs';
import path from 'path';
import { insertScrapedData, pool } from '../core/postgres.js';

const resultsPath = path.resolve('output/results.json');

async function testPostgresPipeline() {
  console.log("=== PostgreSQL Pipeline Verification (Step 1) ===");

  // 1. Check if results.json exists
  if (!fs.existsSync(resultsPath)) {
    console.error(`Error: Scraped results file not found at ${resultsPath}.`);
    console.error("Please run the scraper first using 'node main.js'.");
    process.exit(1);
  }

  let resultsData;
  try {
    const rawContent = fs.readFileSync(resultsPath, 'utf8');
    resultsData = JSON.parse(rawContent);
    console.log(`Successfully read ${resultsData.length} bank records from results.json.`);
  } catch (err) {
    console.error("Error reading or parsing results.json:", err.message);
    process.exit(1);
  }

  // 2. Attempt connection and insertion
  console.log("\nConnecting to PostgreSQL database...");
  console.log(`Target: Host=${pool.options.host}, Port=${pool.options.port}, User=${pool.options.user}, Database=${pool.options.database}`);
  
  try {
    // Perform simple query to test connection first
    await pool.query('SELECT NOW()');
    console.log("Connected to PostgreSQL successfully!");

    console.log("Inserting scraped data into table 'json_import'...");
    const newRowId = await insertScrapedData(resultsData);
    console.log(`Data successfully imported! Inserted Row ID: ${newRowId}`);

    // 3. Query the data back to verify correctness
    console.log("\nVerifying data by querying it back from 'json_import'...");
    const res = await pool.query(
      `SELECT id, jsonb_pretty(data) AS pretty_data FROM json_import WHERE id = $1`,
      [newRowId]
    );

    if (res.rows.length > 0) {
      const row = res.rows[0];
      console.log(`\nFound Record ID: ${row.id}`);
      // Display a snippet of the JSONB to confirm it works
      const prettyJson = row.pretty_data;
      const lines = prettyJson.split('\n');
      console.log("JSONB Preview (first 25 lines):");
      console.log(lines.slice(0, 25).join('\n'));
      if (lines.length > 25) {
        console.log("... [Truncated for preview] ...");
      }
      console.log("\n=== Success! The database import pipeline is working perfectly. ===");
    } else {
      throw new Error("Query returned 0 rows after insertion.");
    }

  } catch (err) {
    console.error("\n[Database Connection or Query Error]:", err.message);
    console.error("\n=== Troubleshooting Connection ===");
    console.error("If connection or login failed, please set the password environment variable.");
    console.error("For example, in Windows PowerShell:");
    console.error('  $env:PGPASSWORD="your_postgres_password"');
    console.error('  node scratch/test_postgres.js');
    console.error("\nOr in Command Prompt:");
    console.error('  set PGPASSWORD=your_postgres_password');
    console.error('  node scratch/test_postgres.js');
    console.error("=================================");
    process.exit(1);
  } finally {
    // Always close pool to exit script cleanly
    await pool.end();
  }
}

testPostgresPipeline();
