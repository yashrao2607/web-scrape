import test from 'node:test';
import assert from 'node:assert';
import { parseTenure, normalizeRate, parseTenureToDays, parseTenureRange, classifyFDProduct, normalizeDateString, extractEffectiveDate } from '../core/normalizer.js';

test('parseTenure matches expected days/months/years', () => {
  const [d1, m1, y1] = parseTenure("7 Days");
  assert.strictEqual(d1, 7);
  assert.strictEqual(m1, 0.2);
  assert.strictEqual(y1, 0.02);

  const [d2, m2, y2] = parseTenure("18 Months");
  assert.strictEqual(m2, 18);
  assert.strictEqual(y2, 1.5);

  const [d3, m3, y3] = parseTenure("2 Years");
  assert.strictEqual(y3, 2);
  assert.strictEqual(m3, 24);
  assert.strictEqual(d3, 730);

  const [d4, m4, y4] = parseTenure("1 Year 6 Months");
  assert.strictEqual(y4, 1.5);
  assert.strictEqual(m4, 18);
  assert.strictEqual(d4, 547.5);
});

test('normalizeRate parses rates correctly', () => {
  assert.strictEqual(normalizeRate("7.10%"), 7.1);
  assert.strictEqual(normalizeRate("6.50 p.a."), 6.5);
  assert.strictEqual(normalizeRate("8"), 8.0);
  assert.strictEqual(normalizeRate(""), null);
  assert.strictEqual(normalizeRate("invalid"), null);
});

test('parseTenureRange evaluates ranges and bounds', () => {
  const [min1, max1] = parseTenureRange("185 to < 1 Year");
  assert.strictEqual(min1, 185);
  assert.strictEqual(max1, 365);

  const [min2, max2] = parseTenureRange("12 to 24 Months");
  assert.strictEqual(min2, 365);
  assert.strictEqual(max2, 730);

  const [min3, max3] = parseTenureRange("445 Days to 2 Years");
  assert.strictEqual(min3, 445);
  assert.strictEqual(max3, 730);
});

test('classifyFDProduct maps segments, categories, and types', () => {
  const res1 = classifyFDProduct("Domestic Fixed Deposits", "", "5Y (Tax Saver FD)");
  assert.strictEqual(res1.deposit_category, "tax_saver");
  assert.strictEqual(res1.scheme_type, "tax_saver_fd");

  const res2 = classifyFDProduct("DOMESTIC / NRO / NRE FIXED DEPOSITS", "", "1 Year");
  assert.strictEqual(res2.customer_segment, "mixed");

  const res3 = classifyFDProduct("NRE Fixed Deposits", "", "1 Year");
  assert.strictEqual(res3.customer_segment, "nre");
});

test('normalizeDateString normalizes different date formats', () => {
  assert.strictEqual(normalizeDateString("1st June"), "2026-06-01");
  assert.strictEqual(normalizeDateString("01.06.2026"), "2026-06-01");
  assert.strictEqual(normalizeDateString("June 09, 2026"), "2026-06-09");
  assert.strictEqual(normalizeDateString("invalid date"), null);
});
