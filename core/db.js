// core/db.js
// Postgres ingestion for FD scraper results.
// Connection: local Unix socket or TCP via env vars.
// Schema: 3 tables (banks, scrape_runs, rates) + v_latest_rates view.
// See sql/schema.sql for DDL.

import pg from 'pg';
import fs from 'fs';
import { logger } from './logger.js';

const { Pool } = pg;

function buildPoolConfig() {
  // Env-var override path, otherwise fall back to the local cluster
  // that main.js will document in its README.
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL };
  }
  return {
    host:        process.env.PGHOST     || '/home/suman/pgdata',
    port:        parseInt(process.env.PGPORT || '5432', 10),
    user:        process.env.PGUSER     || 'suman',
    password:    process.env.PGPASSWORD || undefined,
    database:    process.env.PGDATABASE || 'fd_rates',
    // keep the pool tiny — this only runs once per day
    max:         2,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000
  };
}

let _pool = null;
function pool() {
  if (!_pool) _pool = new Pool(buildPoolConfig());
  return _pool;
}

export async function pingDb() {
  const r = await pool().query('SELECT 1 AS ok');
  return r.rows[0].ok === 1;
}

/**
 * Upsert the banks master table from the simplified results array.
 * Returns Map<bankName, bankId>.
 */
async function upsertBanks(client, banks) {
  const ids = new Map();
  for (const b of banks) {
    const sql = `
      INSERT INTO banks (bank_name, source_url)
      VALUES ($1, $2)
      ON CONFLICT (bank_name) DO UPDATE
        SET source_url = EXCLUDED.source_url,
            updated_at = now()
      RETURNING bank_id
    `;
    const r = await client.query(sql, [b.bank_name, b.url]);
    ids.set(b.bank_name, r.rows[0].bank_id);
  }
  return ids;
}

/**
 * Flatten the simplified {bank_name, url, rates[]} array into
 * the row shape that goes into the `rates` table.
 */
function flattenRates(banks) {
  const rows = [];
  for (const b of banks) {
    for (const r of b.rates || []) {
      rows.push({
        bank_name:    b.bank_name,
        source_url:   b.url,
        tenure:       r.tenure,
        tier:         r.tier ?? null,
        general_rate: r.interest_rate,
        senior_rate:  r.senior_citizen_interest_rate
      });
    }
  }
  return rows;
}

/**
 * Main entry: ingest a successful results.json into Postgres.
 * Steps:
 *   1. Open a single transaction.
 *   2. Insert a scrape_runs row, capture scrape_run_id.
 *   3. Upsert banks, capture bank_id map.
 *   4. Bulk-insert all rate rows tagged with scrape_run_id.
 *   5. Mark the scrape_runs row as finished.
 * Returns { scrape_run_id, banks_inserted, rates_inserted }.
 */
export async function ingestResults({ resultsPath, scraperVersion = '1.0.0' }) {
  if (!fs.existsSync(resultsPath)) {
    throw new Error(`results.json not found at ${resultsPath}`);
  }
  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
  if (!Array.isArray(results)) {
    throw new Error(`Expected results.json to be an array, got ${typeof results}`);
  }

  const startedAt = new Date();
  const client = await pool().connect();
  let scrapeRunId = null;
  let totalRates  = 0;

  try {
    await client.query('BEGIN');

    // 1. Open scrape_runs row
    const runInsert = await client.query(
      `INSERT INTO scrape_runs (started_at, banks_total, source_json_path, scraper_version)
       VALUES ($1, $2, $3, $4)
       RETURNING scrape_run_id`,
      [startedAt, results.length, resultsPath, scraperVersion]
    );
    scrapeRunId = runInsert.rows[0].scrape_run_id;

    // 2. Upsert banks master
    const bankIds = await upsertBanks(client, results);

    // 3. Bulk insert rates
    const flat = flattenRates(results);
    const insertRateSql = `
      INSERT INTO rates
        (scrape_run_id, bank_id, tenure, tier, general_rate, senior_citizen_rate, source_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (scrape_run_id, bank_id, tenure, tier) DO NOTHING
    `;
    for (const row of flat) {
      const bankId = bankIds.get(row.bank_name);
      if (!bankId) continue;
      await client.query(insertRateSql, [
        scrapeRunId,
        bankId,
        row.tenure,
        row.tier,
        row.general_rate,
        row.senior_rate,
        row.source_url
      ]);
    }
    totalRates = flat.length;

    // 4. Close out the scrape_runs row
    await client.query(
      `UPDATE scrape_runs
         SET finished_at      = now(),
             banks_successful = $2,
             banks_failed     = $3
       WHERE scrape_run_id = $1`,
      [scrapeRunId, results.length, 0]
    );

    await client.query('COMMIT');
    logger.info('db_ingest_success', {
      scrape_run_id: scrapeRunId,
      banks: results.length,
      rates: totalRates
    });
    return { scrape_run_id: scrapeRunId, banks_inserted: results.length, rates_inserted: totalRates };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    if (scrapeRunId) {
      // record the failure on the runs row in a fresh connection
      const c2 = await pool().connect();
      try {
        await c2.query(
          `UPDATE scrape_runs SET finished_at = now(), notes = $2 WHERE scrape_run_id = $1`,
          [scrapeRunId, `ingest failure: ${e.message}`]
        );
      } finally {
        c2.release();
      }
    }
    logger.error('db_ingest_failed', { error: e.message, scrape_run_id: scrapeRunId });
    throw e;
  } finally {
    client.release();
  }
}

export async function closeDb() {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
