import pg from 'pg';

const { Pool } = pg;

// Configure connection pool with standard PostgreSQL env variables
const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '',
  database: process.env.PGDATABASE || 'postgres',
});

/**
 * Ensures the 'json_import' table exists.
 * We include an optional created_at column for production timestamping,
 * but retain the exact columns (id SERIAL PRIMARY KEY, data JSONB) specified.
 */
export async function ensureTableExists() {
  const queryText = `
    CREATE TABLE IF NOT EXISTS json_import (
      id SERIAL PRIMARY KEY,
      data JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;
  await pool.query(queryText);
}

/**
 * Inserts the JSON output data into the 'json_import' table.
 * @param {Array|Object} data - Scraped Fixed Deposit interest rates array.
 * @returns {Promise<number>} - The ID of the inserted row.
 */
export async function insertScrapedData(data) {
  await ensureTableExists();
  const queryText = `
    INSERT INTO json_import (data)
    VALUES ($1)
    RETURNING id;
  `;
  const res = await pool.query(queryText, [JSON.stringify(data)]);
  return res.rows[0].id;
}

export { pool };
