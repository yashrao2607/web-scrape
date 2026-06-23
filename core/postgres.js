import { Sequelize, DataTypes } from 'sequelize';
import { logger } from './logger.js';
import fs from 'fs';

const isProduction = process.env.NODE_ENV === 'production' || !!process.env.PGHOST;

// Initialize Sequelize Connection Pool
const sequelize = new Sequelize(
  process.env.PGDATABASE || 'fd_rates',
  process.env.PGUSER || 'postgres',
  process.env.PGPASSWORD || '',
  {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    dialect: 'postgres',
    logging: false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
    dialectOptions: isProduction ? {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    } : {},
  }
);

// Define Bank Model
const Bank = sequelize.define('Bank', {
  bankId: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    field: 'bank_id',
  },
  bankName: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false,
    field: 'bank_name',
  },
  sourceUrl: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'source_url',
  },
}, {
  tableName: 'banks',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

// Define ScrapeRun Model
const ScrapeRun = sequelize.define('ScrapeRun', {
  scrapeRunId: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    field: 'scrape_run_id',
  },
  startedAt: {
    type: DataTypes.DATE,
    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    field: 'started_at',
  },
  finishedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'finished_at',
  },
  banksTotal: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'banks_total',
  },
  banksSuccessful: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'banks_successful',
  },
  banksFailed: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'banks_failed',
  },
  sourceJsonPath: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'source_json_path',
  },
  scraperVersion: {
    type: DataTypes.STRING,
    defaultValue: '1.0.0',
    field: 'scraper_version',
  },
  notes: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'notes',
  },
}, {
  tableName: 'scrape_runs',
  timestamps: false,
});

// Define FDRate Model (mapped to rates table)
const FDRate = sequelize.define('FDRate', {
  rateId: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
    field: 'rate_id',
  },
  scrapeRunId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: ScrapeRun,
      key: 'scrape_run_id',
    },
    field: 'scrape_run_id',
  },
  bankId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Bank,
      key: 'bank_id',
    },
    field: 'bank_id',
  },
  tenure: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'tenure',
  },
  tier: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'tier',
  },
  generalRate: {
    type: DataTypes.DOUBLE,
    allowNull: false,
    field: 'general_rate',
  },
  seniorCitizenRate: {
    type: DataTypes.DOUBLE,
    allowNull: false,
    field: 'senior_citizen_rate',
  },
  sourceUrl: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'source_url',
  },
  scrapedAt: {
    type: DataTypes.DATE,
    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    field: 'scraped_at',
  },
}, {
  tableName: 'rates',
  timestamps: false,
});

// Establish Associations
Bank.hasMany(FDRate, { foreignKey: 'bankId', as: 'rates', onDelete: 'RESTRICT' });
FDRate.belongsTo(Bank, { foreignKey: 'bankId', as: 'bank' });

ScrapeRun.hasMany(FDRate, { foreignKey: 'scrapeRunId', as: 'rates', onDelete: 'CASCADE' });
FDRate.belongsTo(ScrapeRun, { foreignKey: 'scrapeRunId', as: 'scrapeRun' });

export async function pingDb() {
  try {
    await sequelize.authenticate();
    return true;
  } catch (error) {
    return false;
  }
}

export async function ensureTablesExist() {
  await sequelize.sync({ alter: true });
}

export async function ensureLatestRatesViewExists() {
  const viewSql = `
    CREATE OR REPLACE VIEW v_latest_rates AS
    SELECT
        b.bank_name,
        r.tenure,
        r.tier,
        r.general_rate,
        r.senior_citizen_rate,
        r.source_url,
        r.scraped_at,
        sr.finished_at AS scrape_finished_at
    FROM rates r
    JOIN banks        b  ON b.bank_id       = r.bank_id
    JOIN scrape_runs  sr ON sr.scrape_run_id = r.scrape_run_id
    WHERE r.scrape_run_id = (
        SELECT MAX(r2.scrape_run_id)
        FROM rates r2
        WHERE r2.bank_id = r.bank_id
          AND r2.tenure  = r.tenure
          AND r2.tier IS NOT DISTINCT FROM r.tier
    );
  `;
  try {
    await sequelize.query(viewSql);
    logger.info("v_latest_rates_view_ensured");
  } catch (err) {
    logger.error("failed_to_ensure_v_latest_rates_view", { error: err.message });
  }
}

/**
 * Transaction-safe method to save scraped data with full history.
 * Creates a scrape run record and appends rates.
 * @param {Object} opts - Options
 * @param {string} opts.resultsPath - Absolute path to results.json
 * @param {string} [opts.scraperVersion] - Version of the scraper
 */
export async function ingestResults({ resultsPath, scraperVersion = '1.0.0' }) {
  if (!fs.existsSync(resultsPath)) {
    throw new Error(`results.json not found at ${resultsPath}`);
  }
  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
  if (!Array.isArray(results)) {
    throw new Error(`Expected results.json to be an array, got ${typeof results}`);
  }

  await ensureTablesExist();
  await ensureLatestRatesViewExists();

  const startedAt = new Date();
  const transaction = await sequelize.transaction();

  let scrapeRun;
  try {
    // 1. Create scrape run record
    scrapeRun = await ScrapeRun.create({
      startedAt,
      banksTotal: results.length,
      sourceJsonPath: resultsPath,
      scraperVersion
    }, { transaction });

    let ratesInserted = 0;

    // 2. Process each bank
    for (const bankInfo of results) {
      // Find or create bank record
      const [bank] = await Bank.findOrCreate({
        where: { bankName: bankInfo.bank_name },
        defaults: { sourceUrl: bankInfo.url },
        transaction,
      });

      // Update URL if changed
      if (bank.sourceUrl !== bankInfo.url) {
        bank.sourceUrl = bankInfo.url;
        await bank.save({ transaction });
      }

      // 3. Prepare rates records for bulk insert
      if (bankInfo.rates && bankInfo.rates.length > 0) {
        const rateRecords = bankInfo.rates.map(rate => ({
          scrapeRunId: scrapeRun.scrapeRunId,
          bankId: bank.bankId,
          tenure: rate.tenure,
          tier: rate.tier ?? null,
          generalRate: rate.interest_rate,
          seniorCitizenRate: rate.senior_citizen_interest_rate,
          sourceUrl: bankInfo.url
        }));

        await FDRate.bulkCreate(rateRecords, { 
          transaction,
          ignoreDuplicates: true // avoids collision for same run/bank/tenure/tier
        });

        ratesInserted += rateRecords.length;
      }
    }

    // 4. Update scrape run as finished
    scrapeRun.finishedAt = new Date();
    scrapeRun.banksSuccessful = results.length;
    scrapeRun.banksFailed = 0;
    await scrapeRun.save({ transaction });

    await transaction.commit();

    logger.info("db_ingestion_complete", {
      scrape_run_id: scrapeRun.scrapeRunId,
      banks_inserted: results.length,
      rates_inserted: ratesInserted
    });

    return {
      scrape_run_id: scrapeRun.scrapeRunId,
      banks_inserted: results.length,
      rates_inserted: ratesInserted
    };
  } catch (error) {
    await transaction.rollback();
    logger.error("db_ingestion_failed", { error: error.message });
    
    // Attempt to log failure in the database outside the failed transaction
    if (scrapeRun && scrapeRun.scrapeRunId) {
      try {
        await ScrapeRun.update({
          finishedAt: new Date(),
          notes: `ingest failure: ${error.message}`
        }, {
          where: { scrapeRunId: scrapeRun.scrapeRunId }
        });
      } catch (logErr) {
        // ignore log error
      }
    }
    throw error;
  }
}

/**
 * Saves simplified scraped data (called directly by main.js).
 * Creates a scrape run, finds/creates banks, bulk-inserts rates.
 * @param {Array} simplifiedResults - Array of { bank_name, url, rates }
 */
export async function saveScrapedDataToDb(simplifiedResults) {
  await ensureTablesExist();

  const startedAt = new Date();
  const transaction = await sequelize.transaction();

  try {
    const scrapeRun = await ScrapeRun.create({
      startedAt,
      banksTotal: simplifiedResults.length,
    }, { transaction });

    for (const bankInfo of simplifiedResults) {
      const [bank] = await Bank.findOrCreate({
        where: { bankName: bankInfo.bank_name },
        defaults: { sourceUrl: bankInfo.url },
        transaction,
      });

      if (bank.sourceUrl !== bankInfo.url) {
        bank.sourceUrl = bankInfo.url;
        await bank.save({ transaction });
      }

      if (bankInfo.rates && bankInfo.rates.length > 0) {
        const rateRecords = bankInfo.rates.map(rate => ({
          scrapeRunId: scrapeRun.scrapeRunId,
          bankId: bank.bankId,
          tenure: rate.tenure,
          generalRate: rate.interest_rate,
          seniorCitizenRate: rate.senior_citizen_interest_rate,
          sourceUrl: bankInfo.url,
        }));

        await FDRate.bulkCreate(rateRecords, { transaction, ignoreDuplicates: true });
      }
    }

    scrapeRun.finishedAt = new Date();
    scrapeRun.banksSuccessful = simplifiedResults.length;
    await scrapeRun.save({ transaction });

    await transaction.commit();
    logger.info("db_save_complete", { banks: simplifiedResults.length });
  } catch (error) {
    await transaction.rollback();
    logger.error("db_save_failed", { error: error.message });
    throw error;
  }
}

export async function closeDb() {
  await sequelize.close();
  logger.info("postgres_sequelize_pool_closed_successfully");
}

export { sequelize, Bank, ScrapeRun, FDRate };
