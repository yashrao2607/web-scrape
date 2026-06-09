import { Sequelize, DataTypes } from 'sequelize';

// Initialize Sequelize Connection Pool
const sequelize = new Sequelize(
  process.env.PGDATABASE || 'postgres',
  process.env.PGUSER || 'postgres',
  process.env.PGPASSWORD || '',
  {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    dialect: 'postgres',
    logging: false, // Set to console.log to debug query logs in development
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  }
);

// Define Bank Model
const Bank = sequelize.define('Bank', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  bankName: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false,
  },
  url: {
    type: DataTypes.STRING,
    allowNull: false,
  },
}, {
  tableName: 'banks',
  timestamps: false,
});

// Define FDRate Model
const FDRate = sequelize.define('FDRate', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  bankId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Bank,
      key: 'id',
    },
  },
  tenure: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  interestRate: {
    type: DataTypes.DOUBLE,
    allowNull: false,
  },
  seniorCitizenInterestRate: {
    type: DataTypes.DOUBLE,
    allowNull: false,
  },
  fetchedAt: {
    type: DataTypes.DATE,
    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
  },
}, {
  tableName: 'fd_rates',
  timestamps: false,
});

// Establish Associations
Bank.hasMany(FDRate, { foreignKey: 'bankId', as: 'rates', onDelete: 'CASCADE' });
FDRate.belongsTo(Bank, { foreignKey: 'bankId', as: 'bank' });

/**
 * Synchronizes models with the database.
 */
export async function ensureTablesExist() {
  await sequelize.sync({ alter: true });
}

/**
 * Transaction-safe method to save scraped data.
 * For each bank, inserts/updates the Bank row, deletes old rates, and inserts new ones.
 * @param {Array} scrapedData - Array of bank records.
 */
export async function saveScrapedDataToDb(scrapedData) {
  await ensureTablesExist();

  const transaction = await sequelize.transaction();
  try {
    for (const bankInfo of scrapedData) {
      // 1. Find or create the Bank row
      const [bank] = await Bank.findOrCreate({
        where: { bankName: bankInfo.bank_name },
        defaults: { url: bankInfo.url },
        transaction,
      });

      // Update URL if it changed
      if (bank.url !== bankInfo.url) {
        bank.url = bankInfo.url;
        await bank.save({ transaction });
      }

      // 2. Delete existing rates for this bank (zero-redundancy)
      await FDRate.destroy({
        where: { bankId: bank.id },
        transaction,
      });

      // 3. Bulk insert new rates
      if (bankInfo.rates && bankInfo.rates.length > 0) {
        const rateRecords = bankInfo.rates.map(rate => ({
          bankId: bank.id,
          tenure: rate.tenure,
          interestRate: rate.interest_rate,
          seniorCitizenInterestRate: rate.senior_citizen_interest_rate,
        }));
        await FDRate.bulkCreate(rateRecords, { transaction });
      }
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export { sequelize, Bank, FDRate };
