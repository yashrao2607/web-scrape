// scripts/generate-reference-banks.js
//
// Reads the latest FD rates for all 12 banks from the Postgres database
// (v_latest_rates view), buckets them into the 5 standard day-range buckets
// that mig.js uses, and writes the result as a JavaScript file at
// reference-banks.js (in the project root) that mig.js can require().
//
// Output format (multi-line, matches mig.js's original hardcoded block exactly):
//
//   const REFERENCE_BANKS = {
//     Axis: {
//       name: 'Axis',
//       peakRate: 6.6,
//       rates: {
//         '7 Days - 90 Days': 3.0,
//         '91 Days - 365 Days': 6.25,
//         ...
//       },
//     },
//     ...
//   };
//
//   module.exports = { REFERENCE_BANKS };
//
// Usage:
//   node scripts/generate-reference-banks.js   # writes to ./reference-banks.cjs
//
// The output is named .cjs (not .js) so Node treats it as CommonJS regardless
// of the package.json "type": "module" setting. mig.js consumes it with
// `require('./reference-banks.cjs')`.
//
// Auto-runs as Stage 5 of the main pipeline (main.js calls generateReferenceBanks()
// after db_ingest_complete).

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseTenureRange } from '../core/normalizer.js';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── 1. Config: bank name → (key, display name) ──────────────────────────────
//   This is the single source of truth for how each DB bank_name maps to
//   the short identifier that mig.js's compareRates() uses.
const BANK_MAPPING = {
  'HDFC Bank':            { key: 'HDFC',     name: 'HDFC' },
  'SBI':                  { key: 'SBI',      name: 'SBI' },
  'ICICI Bank':           { key: 'ICICI',    name: 'ICICI' },
  'Axis Bank':            { key: 'Axis',     name: 'Axis' },
  'Kotak Mahindra Bank':  { key: 'Kotak',    name: 'Kotak' },
  'PNB':                  { key: 'PNB',      name: 'PNB' },
  'IndusInd Bank':        { key: 'IndusInd', name: 'IndusInd' },
  'Yes Bank':             { key: 'Yes',      name: 'Yes' },
  'IDFC First Bank':      { key: 'IDFC',     name: 'IDFC' },
  'Indian Overseas Bank': { key: 'IOB',      name: 'IOB' },
  'South Indian Bank':    { key: 'SIB',      name: 'SIB' },
  'Federal Bank':         { key: 'Federal',  name: 'Federal' },
};

// ── 2. The 5 day-range buckets (labels must match TENURE_BUCKETS in mig.js) ─
const BUCKETS = [
  { label: '7 Days - 90 Days',      min: 7,    max: 90   },
  { label: '91 Days - 365 Days',    min: 91,   max: 365  },
  { label: '366 Days - 730 Days',   min: 366,  max: 730  },
  { label: '731 Days - 1095 Days',  min: 731,  max: 1095 },
  { label: '1096 Days - 1825 Days', min: 1096, max: 1825 },
];

// ── 3. Postgres connection (local dev cluster; same as core/db.js) ──────────
function buildPoolConfig() {
  return {
    host:     process.env.PGHOST     || '/home/suman/pgdata',
    port:     parseInt(process.env.PGPORT || '5432', 10),
    user:     process.env.PGUSER     || 'suman',
    password: process.env.PGPASSWORD || undefined,
    database: process.env.PGDATABASE || 'fd_rates',
    max: 2,
  };
}

// ── 4. Number formatter (matches mig.js hardcoded style: 7.0 not 7, 2.75 not 2.750) ─
function fmt(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '0.0';
  const num = Number(n);
  return num % 1 === 0 ? num.toFixed(1) : num.toString();
}

// ── 5. Assign a tenure string to one of the 5 buckets ────────────────────────
function assignBucket(tenureStr) {
  const [minDays, maxDays] = parseTenureRange(tenureStr);
  if (minDays === null) return null;

  // Case 1: tenure extends BEYOND 5 years (maxDays > 1825) — use minDays as
  // the representative day. Handles "Above X years", "X to 10 years", and
  // "5 years and above" type ranges.
  //   e.g. "5 years to 10 years"        -> min=1825, max=3650  -> 1096-1825
  //        "Above 36 months to 10 years" -> min=1095, max=3650  -> 731-1095
  //        "3 Years and above"           -> min=1095, max=36500 -> 731-1095
  if (maxDays !== null && maxDays > 1825) {
    for (const b of BUCKETS) {
      if (minDays >= b.min && minDays <= b.max) return b.label;
    }
    // minDays itself is beyond 5 years ("5 Years 1 day to 10 Years", etc.)
    if (minDays > 1825) return BUCKETS[BUCKETS.length - 1].label;
    return null;
  }

  // Case 2: normal range — use the midpoint of [min, max], rounded up so that
  // ranges like "18-30 months" (midpoint = 730.5) fall in the 731-1095 bucket
  // rather than slipping through the gap between the 366-730 and 731-1095
  // boundaries.
  const rep = Math.ceil((minDays + (maxDays !== null ? maxDays : minDays)) / 2);
  for (const b of BUCKETS) {
    if (rep >= b.min && rep <= b.max) return b.label;
  }
  return null;  // doesn't fit any bucket (rare)
}

// ── 6. Query Postgres for all 12 banks' latest rates ────────────────────────
async function fetchLatestRates(pool) {
  const result = await pool.query(`
    SELECT b.bank_name, r.tenure, r.general_rate, r.senior_citizen_rate, r.tier
    FROM v_latest_rates r
    JOIN banks b ON b.bank_name = r.bank_name
    ORDER BY b.bank_name, r.tier NULLS FIRST, r.tenure
  `);
  return result.rows;
}

// ── 7. Aggregate raw rows into (bank → bucket → max rate) ──────────────────
function aggregateRates(rows) {
  const result = {};

  for (const row of rows) {
    const mapping = BANK_MAPPING[row.bank_name];
    if (!mapping) {
      continue;
    }
    const key = mapping.key;

    if (!result[key]) {
      result[key] = { name: mapping.name, rates: {} };
      for (const b of BUCKETS) result[key].rates[b.label] = 0.0;
    }

    const bucket = assignBucket(row.tenure);
    if (!bucket) {
      continue;
    }
    const rate = parseFloat(row.general_rate);
    if (Number.isNaN(rate)) continue;

    // Multi-tier aware: take max across all tiers
    if (rate > result[key].rates[bucket]) {
      result[key].rates[bucket] = rate;
    }
  }

  // Compute peakRate = max of the 5 bucket rates (which is also the max of all rates)
  for (const key of Object.keys(result)) {
    const rateValues = Object.values(result[key].rates);
    result[key].peakRate = rateValues.length > 0 ? Math.max(...rateValues) : 0.0;
  }

  return result;
}

// ── 8. Format as JavaScript code in the exact mig.js hardcoded style ─────────
function formatAsJs(aggregated) {
  // Sort banks alphabetically by key for stable diffs
  const sortedKeys = Object.keys(aggregated).sort();
  const lines = [];
  lines.push('// AUTO-GENERATED by scripts/generate-reference-banks.js');
  lines.push('// Source: fd_rates database, v_latest_rates view');
  lines.push('// Regenerate: node scripts/generate-reference-banks.js');
  lines.push('// Do not edit by hand.');
  lines.push('');
  lines.push('const REFERENCE_BANKS = {');

  for (let i = 0; i < sortedKeys.length; i++) {
    const key = sortedKeys[i];
    const bank = aggregated[key];
    const trailing = i < sortedKeys.length - 1 ? ',' : '';
    lines.push(`  ${key}: {`);
    lines.push(`    name: '${bank.name}',`);
    lines.push(`    peakRate: ${fmt(bank.peakRate)},`);
    lines.push(`    rates: {`);
    for (const b of BUCKETS) {
      lines.push(`      '${b.label}': ${fmt(bank.rates[b.label])},`);
    }
    lines.push(`    },`);
    lines.push(`  }${trailing}`);
  }

  lines.push('};');
  lines.push('');
  lines.push('module.exports = { REFERENCE_BANKS };');
  lines.push('');
  return lines.join('\n');
}

// ── 9. Public entry point ────────────────────────────────────────────────────
export async function generateReferenceBanks({ outputPath } = {}) {
  const out = outputPath || path.join(__dirname, '..', 'reference-banks.cjs');
  const pool = new Pool(buildPoolConfig());
  try {
    const rows = await fetchLatestRates(pool);
    if (rows.length === 0) {
      throw new Error('No rates returned from v_latest_rates — is the DB empty?');
    }
    const aggregated = aggregateRates(rows);
    const js = formatAsJs(aggregated);

    // Validate: every mapped bank must have an entry
    const missingBanks = Object.keys(BANK_MAPPING).filter(
      dbName => !aggregated[Object.entries(BANK_MAPPING).find(([k]) => k === dbName)?.[1]?.key]
    );
    if (missingBanks.length > 0) {
    }

    // Atomic write: write to .tmp then rename
    const tmpPath = out + '.tmp';
    fs.writeFileSync(tmpPath, js, 'utf-8');
    fs.renameSync(tmpPath, out);

    return {
      outputPath: out,
      banksEmitted: Object.keys(aggregated).length,
      ratesRead: rows.length
    };
  } finally {
    await pool.end();
  }
}

// ── 10. CLI entry: run directly with `node scripts/generate-reference-banks.js` ─
if (import.meta.url === `file://${process.argv[1]}`) {
  generateReferenceBanks()
    .then(r => {
      process.exit(0);
    })
    .catch(e => {
      process.exit(1);
    });
}
