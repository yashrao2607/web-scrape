import { sequelize } from './postgres.js';

async function runMigration() {
  console.log("=== Database Migration: Switching IDs to UUID ===");
  console.log(`Connecting to database: host=${sequelize.options.host}, database=${sequelize.options.database}`);

  try {
    // 1. Drop existing tables if they exist to prevent INT/UUID mismatch conflicts
    console.log("\nDropping existing tables ('fd_rates', 'banks') to clear old INT relationships...");
    await sequelize.query('DROP TABLE IF EXISTS fd_rates CASCADE;');
    await sequelize.query('DROP TABLE IF EXISTS banks CASCADE;');
    console.log("Old tables dropped successfully.");

    // 2. Synchronize new models (which now define IDs as UUID)
    console.log("\nCreating tables with new UUID schema...");
    await sequelize.sync({ force: true });
    console.log("UUID tables synchronized successfully!");

    console.log("\n=== Migration Completed Successfully! ===");
    console.log("You can now run the scraper to re-populate the tables:");
    console.log("  node main.js");
  } catch (error) {
    console.error("\nMigration failed with error:", error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

runMigration();
