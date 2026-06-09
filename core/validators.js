import { z } from 'zod';

const rateSchema = z.number()
  .refine(v => v >= 0.0 && v <= 20.0, {
    message: "Interest rate must be between 0.0 and 20.0"
  })
  .transform(v => Math.round(v * 10000) / 10000);

export const fdRateItemSchema = z.object({
  tenure: z.string().describe("The parsed tenure string (e.g. '3 Years 1 Day to 5 Years')."),
  general_rate: rateSchema,
  senior_citizen_rate: rateSchema,
  effective_from: z.string().nullable().optional(),
  effective_to: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),

  // Context Preservation & Classification Fields
  product_type: z.string().default("retail_fd"),
  deposit_category: z.string().default("regular"),
  customer_segment: z.string().default("resident"),
  callable: z.boolean().default(true),
  scheme_type: z.string().default("regular_fd"),
  scheme_name: z.string().nullable().optional(),
  section_name: z.string().nullable().optional(),
  table_name: z.string().nullable().optional(),
  min_days: z.number().int().nullable().optional(),
  max_days: z.number().int().nullable().optional(),
});

export const bankFdSchemeSchema = z.object({
  bank_name: z.string().describe("Name of the bank."),
  source_url: z.string().describe("URL from which the data was scraped."),
  scrape_date: z.string().default(() => new Date().toISOString()),
  rate_effective_date: z.string().nullable().optional(),
  page_last_updated: z.string().nullable().optional(),
  last_updated_on_page: z.string().nullable().optional(),

  fd_rates: z.array(fdRateItemSchema).default([]),

  minimum_deposit: z.number().nullable().optional(),
  maximum_deposit: z.number().nullable().optional(),

  premature_withdrawal_available: z.boolean().nullable().optional(),
  premature_withdrawal_penalty: z.string().nullable().optional(),

  loan_against_fd_available: z.boolean().nullable().optional(),

  tax_saver_fd_available: z.boolean().nullable().optional(),
  tax_saver_tenure: z.string().nullable().optional(),

  nomination_available: z.boolean().nullable().optional(),

  compounding_frequency: z.string().nullable().optional(),

  // Audit & Confidence tracking fields
  scrape_confidence: z.number().default(0.0),
  validation_score: z.number().default(0.0),
  duplicate_count: z.number().int().default(0),
  anomaly_count: z.number().int().default(0),
  scraper_version: z.string().default("1.0.0"),
}).transform((data) => {
  let score = 1.0;

  // Check rates
  if (!data.fd_rates || data.fd_rates.length === 0) {
    score -= 0.5;
  } else {
    // Check for empty tenures
    const unresolvedTenures = data.fd_rates.filter(r => !r.tenure || !r.tenure.trim()).length;
    if (unresolvedTenures > 0) {
      score -= 0.15 * (unresolvedTenures / data.fd_rates.length);
    }
  }

  // Check other key metadata
  const missingMetadataWeights = {
    minimum_deposit: 0.05,
    premature_withdrawal_available: 0.05,
    loan_against_fd_available: 0.05,
    tax_saver_fd_available: 0.05,
    nomination_available: 0.05,
    compounding_frequency: 0.05,
  };

  for (const [key, weight] of Object.entries(missingMetadataWeights)) {
    if (data[key] === undefined || data[key] === null) {
      score -= weight;
    }
  }

  // Deduct if none of the date attributes are provided
  if (!(data.rate_effective_date || data.page_last_updated || data.last_updated_on_page)) {
    score -= 0.05;
  }

  // Deduct for duplicates and anomalies (capped)
  if (data.duplicate_count > 0) {
    score -= Math.min(0.40, data.duplicate_count * 0.01);
  }
  if (data.anomaly_count > 0) {
    score -= Math.min(0.30, data.anomaly_count * 0.05);
  }

  data.validation_score = Math.max(0.0, Math.round(score * 100) / 100);
  data.data_quality_score = data.validation_score; // compatibility property
  return data;
});
