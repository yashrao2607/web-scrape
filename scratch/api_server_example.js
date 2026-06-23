// api/server.js — deploy this as a SEPARATE project on Vercel
// This is the lightweight API that reads from DB (no Playwright needed)
import express from 'express';
import pkg from 'pg';

const { Pool } = pkg;

const pool = new Pool({
  host: process.env.PGHOST,
  port: parseInt(process.env.PGPORT || '5432'),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
});

const app = express();

// GET /api/banks — list all banks
app.get('/api/banks', async (req, res) => {
  const result = await pool.query('SELECT * FROM banks ORDER BY "bankName"');
  res.json(result.rows);
});

// GET /api/rates/:bankName — rates for a specific bank
app.get('/api/rates/:bankName', async (req, res) => {
  const { bankName } = req.params;
  const bank = await pool.query('SELECT id FROM banks WHERE "bankName" = $1', [bankName]);
  if (bank.rows.length === 0) return res.status(404).json({ error: 'Bank not found' });
  
  const rates = await pool.query(
    'SELECT tenure, "interestRate", "seniorCitizenInterestRate", "fetchedAt" FROM fd_rates WHERE "bankId" = $1 ORDER BY "fetchedAt" DESC',
    [bank.rows[0].id]
  );
  res.json({ bank: bankName, rates: rates.rows });
});

// GET /api/all-rates — simplified results.json format
app.get('/api/all-rates', async (req, res) => {
  const banks = await pool.query('SELECT id, "bankName", url FROM banks');
  const result = [];
  for (const b of banks.rows) {
    const rates = await pool.query(
      'SELECT tenure, "interestRate", "seniorCitizenInterestRate" FROM fd_rates WHERE "bankId" = $1',
      [b.id]
    );
    result.push({
      bank_name: b.bankName,
      url: b.url,
      rates: rates.rows.map(r => ({
        tenure: r.tenure,
        interest_rate: parseFloat(r.interestRate),
        senior_citizen_interest_rate: parseFloat(r.seniorCitizenInterestRate),
      }))
    });
  }
  res.json(result);
});

// GET /api/latest — the full output/results.json format from latest scrape
app.get('/api/latest', async (req, res) => {
  const banks = await pool.query('SELECT id, "bankName", url FROM banks');
  const result = [];
  for (const b of banks.rows) {
    const rates = await pool.query(
      `SELECT DISTINCT ON (tenure) tenure, "interestRate", "seniorCitizenInterestRate"
       FROM fd_rates WHERE "bankId" = $1 ORDER BY tenure, "fetchedAt" DESC`,
      [b.id]
    );
    result.push({
      bank_name: b.bankName,
      url: b.url,
      rates: rates.rows.map(r => ({
        tenure: r.tenure,
        interest_rate: parseFloat(r.interestRate),
        senior_citizen_interest_rate: parseFloat(r.seniorCitizenInterestRate),
      }))
    });
  }
  res.json({ scraped_at: new Date().toISOString(), banks: result });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`FD API running on port ${PORT}`));
