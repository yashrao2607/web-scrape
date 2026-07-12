import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseTenureRange } from '../core/normalizer.js';
import { sequelize } from '../core/postgres.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── 1. Config: bank name → (key, display name) ──────────────────────────────
//   This maps each DB bank_name to the short identifier used by mig.js's compareRates()
const BANK_MAPPING = {
  'HDFC Bank':            { key: 'HDFC',          name: 'HDFC' },
  'SBI':                  { key: 'SBI',           name: 'SBI' },
  'ICICI Bank':           { key: 'ICICI',         name: 'ICICI' },
  'Axis Bank':            { key: 'Axis',          name: 'Axis' },
  'Kotak Mahindra Bank':  { key: 'Kotak',         name: 'Kotak' },
  'PNB':                  { key: 'PNB',           name: 'PNB' },
  'IndusInd Bank':        { key: 'IndusInd',      name: 'IndusInd' },
  'Yes Bank':             { key: 'Yes',           name: 'Yes' },
  'IDFC First Bank':      { key: 'IDFC',          name: 'IDFC' },
  'Indian Overseas Bank': { key: 'IOB',           name: 'IOB' },
  'South Indian Bank':    { key: 'SIB',           name: 'SIB' },
  'Federal Bank':         { key: 'Federal',       name: 'Federal' },
  'Canara Bank':          { key: 'Canara',        name: 'Canara' },
  'Bank of Baroda':       { key: 'BOB',           name: 'Bank of Baroda' },
  'Bank of India':        { key: 'BOI',           name: 'Bank of India' },
  'Bank of Maharashtra':  { key: 'BOM',           name: 'Bank of Maharashtra' },
  'RBL Bank':             { key: 'RBL',           name: 'RBL' },
  'IDBI Bank':            { key: 'IDBI',          name: 'IDBI' },
  'Indian Bank':          { key: 'IndianBank',    name: 'Indian Bank' },
  'Central Bank of India':{ key: 'CBI',           name: 'Central Bank of India' },
  'Bandhan Bank':         { key: 'Bandhan',       name: 'Bandhan' },
  'PNB Housing Finance':  { key: 'PNBHousing',    name: 'PNB Housing' },
  'KTDFC':                { key: 'KTDFC',         name: 'KTDFC' },
  'LIC Housing Finance':  { key: 'LICHousing',    name: 'LIC Housing' },
  'Shriram City Union Finance': { key: 'Shriram', name: 'Shriram Finance' }
};

// ── 2. The 5 day-range buckets (labels must match TENURE_BUCKETS in mig.js) ─
const BUCKETS = [
  { label: '7 Days - 90 Days',      min: 7,    max: 90   },
  { label: '91 Days - 365 Days',    min: 91,   max: 365  },
  { label: '366 Days - 730 Days',   min: 366,  max: 730  },
  { label: '731 Days - 1095 Days',  min: 731,  max: 1095 },
  { label: '1096 Days - 1825 Days', min: 1096, max: 1825 },
];

// ── 3. Number formatter (matches mig.js hardcoded style: 7.0 not 7, 2.75 not 2.750) ─
function fmt(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '0.0';
  const num = Number(n);
  return num % 1 === 0 ? num.toFixed(1) : num.toString();
}

// ── 4. Assign a tenure string to one of the 5 buckets ────────────────────────
function assignBucket(tenureStr) {
  const [minDays, maxDays] = parseTenureRange(tenureStr);
  if (minDays === null) return null;

  // Case 1: tenure extends BEYOND 5 years (maxDays > 1825) — use minDays as
  // the representative day. Handles "Above X years", "X to 10 years", and
  // "5 years and above" type ranges.
  if (maxDays !== null && maxDays > 1825) {
    for (const b of BUCKETS) {
      if (minDays >= b.min && minDays <= b.max) return b.label;
    }
    if (minDays > 1825) return BUCKETS[BUCKETS.length - 1].label;
    return null;
  }

  // Case 2: normal range — use the midpoint of [min, max], rounded up
  const rep = Math.ceil((minDays + (maxDays !== null ? maxDays : minDays)) / 2);
  for (const b of BUCKETS) {
    if (rep >= b.min && rep <= b.max) return b.label;
  }
  return null;
}

// ── 5. Query Postgres for all 25 banks' latest rates ────────────────────────
async function fetchLatestRates() {
  const [rows] = await sequelize.query(`
    SELECT b.bank_name, r.tenure, r.general_rate, r.senior_citizen_rate, r.tier
    FROM v_latest_rates r
    JOIN banks b ON b.bank_name = r.bank_name
    ORDER BY b.bank_name, r.tier NULLS FIRST, r.tenure
  `);
  return rows;
}

// ── 6. Aggregate raw rows into (bank → bucket → max rate) ──────────────────
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

  // Compute peakRate = max of the 5 bucket rates
  for (const key of Object.keys(result)) {
    const rateValues = Object.values(result[key].rates);
    result[key].peakRate = rateValues.length > 0 ? Math.max(...rateValues) : 0.0;
  }

  return result;
}

// ── 7. Format as JavaScript code in the exact mig.js hardcoded style ─────────
function formatAsJs(aggregated) {
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

// ── 8. Public entry point ────────────────────────────────────────────────────
export async function generateReferenceBanks({ outputPath } = {}) {
  const out = outputPath || path.join(__dirname, '..', 'reference-banks.cjs');
  try {
    const rows = await fetchLatestRates();
    if (rows.length === 0) {
      throw new Error('No rates returned from v_latest_rates — is the DB empty?');
    }
    const aggregated = aggregateRates(rows);
    const js = formatAsJs(aggregated);

    // Atomic write
    const tmpPath = out + '.tmp';
    fs.writeFileSync(tmpPath, js, 'utf-8');
    fs.renameSync(tmpPath, out);

    return {
      outputPath: out,
      banksEmitted: Object.keys(aggregated).length,
      ratesRead: rows.length
    };
  } catch (err) {
    throw err;
  }
}

// ── 9. CLI entry ─────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  generateReferenceBanks()
    .then(() => {
      process.exit(0);
    })
    .catch(e => {
      console.error("Reference bank generation failed:", e.message);
      process.exit(1);
    });
}
