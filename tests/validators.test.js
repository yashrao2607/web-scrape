import test from 'node:test';
import assert from 'node:assert';
import { fdRateItemSchema, bankFdSchemeSchema } from '../core/validators.js';

test('fdRateItemSchema validates rate items successfully', () => {
  const rawItem = {
    tenure: "1 Year",
    general_rate: 7.25,
    senior_citizen_rate: 7.75
  };
  const parsed = fdRateItemSchema.parse(rawItem);
  assert.strictEqual(parsed.general_rate, 7.25);
  assert.strictEqual(parsed.senior_citizen_rate, 7.75);
  assert.strictEqual(parsed.product_type, "retail_fd");
  assert.strictEqual(parsed.callable, true);
});

test('fdRateItemSchema throws on invalid rates', () => {
  assert.throws(() => {
    fdRateItemSchema.parse({
      tenure: "1 Year",
      general_rate: 22.0, // Above 20% limit
      senior_citizen_rate: 7.75
    });
  });

  assert.throws(() => {
    fdRateItemSchema.parse({
      tenure: "1 Year",
      general_rate: -1.0, // Negative rate
      senior_citizen_rate: 7.75
    });
  });
});

test('bankFdSchemeSchema calculates dynamic quality scores correctly', () => {
  const fullScheme = {
    bank_name: "Test Bank",
    source_url: "http://test.com",
    last_updated_on_page: "2026-06-08",
    minimum_deposit: 1000.0,
    premature_withdrawal_available: true,
    loan_against_fd_available: true,
    tax_saver_fd_available: true,
    nomination_available: true,
    compounding_frequency: "Quarterly",
    fd_rates: [
      { tenure: "1 Year", general_rate: 7.0, senior_citizen_rate: 7.5 }
    ]
  };

  const parsed = bankFdSchemeSchema.parse(fullScheme);
  assert.strictEqual(parsed.validation_score, 1.0);

  const sparseScheme = {
    bank_name: "Sparse Bank",
    source_url: "http://test.com",
    fd_rates: []
  };
  
  const parsedSparse = bankFdSchemeSchema.parse(sparseScheme);
  // 0.5 reduction for no rates, and 0.05 * 7 = 0.35 reduction for missing metadata fields. Total score = 0.15
  assert.strictEqual(parsedSparse.validation_score, 0.15);
});
