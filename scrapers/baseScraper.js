import { logger } from '../core/logger.js';
import { parseTenure, parseTenureRange, classifyFDProduct, normalizeRate } from '../core/normalizer.js';
import { bankFdSchemeSchema } from '../core/validators.js';

export class BaseScraper {
  constructor(bankName, url) {
    this.bankName = bankName;
    this.url = url;
    this.logger = logger.child({ bank: bankName, url: url });
  }

  async scrape(page) {
    throw new Error("scrape() method must be implemented by subclass.");
  }

  processAndValidate(rawData, validationErrors) {
    this.logger.info("processing_and_validating_raw_data");

    const ratesRaw = rawData.fd_rates || [];
    const validatedRates = [];
    const seenKeys = new Set();

    let duplicateCount = 0;
    let anomalyCount = 0;

    // Collect first available effective date
    let effectiveDate = rawData.effective_from || rawData.rate_effective_date || null;

    ratesRaw.forEach((item, idx) => {
      const tenureStr = (item.tenure_raw || "").trim();
      const genRateStr = String(item.general_raw !== undefined && item.general_raw !== null ? item.general_raw : "").trim();
      const srRateStr = item.senior_raw !== undefined && item.senior_raw !== null ? String(item.senior_raw).trim() : "";

      const sectionName = item.section_name || "";
      const tableName = item.table_name || "";
      const rowEffectiveDate = item.rate_effective_date || null;

      if (rowEffectiveDate && !effectiveDate) {
        effectiveDate = rowEffectiveDate;
      }

      if (!tenureStr) {
        const msg = `Row ${idx}: Empty tenure string.`;
        validationErrors.push(msg);
        this.logger.warn("validation_warning", { detail: msg });
        return;
      }

      // Parse tenure
      const [days, months, years] = parseTenure(tenureStr);
      if (days === null) {
        const msg = `Row ${idx} (${tenureStr}): Rejected due to invalid/unparseable tenure.`;
        validationErrors.push(msg);
        this.logger.warn("row_rejected", { detail: msg });
        return;
      }

      // Normalize rates
      const genRate = normalizeRate(genRateStr);
      const srRate = srRateStr ? normalizeRate(srRateStr) : genRate;

      if (genRate === null) {
        const msg = `Row ${idx} (${tenureStr}): Could not parse general rate '${genRateStr}'.`;
        validationErrors.push(msg);
        this.logger.warn("validation_warning", { detail: msg });
        return;
      }

      // Classify context
      const classified = classifyFDProduct(sectionName, tableName, tenureStr);

      // Outlier / Anomaly Detection
      if (genRate < 2.0 || genRate > 12.0) {
        anomalyCount++;
        this.logger.warn("rate_anomaly_detected", { rate: genRate, tenure: tenureStr });
      }

      // Reject row: rate < 2.0% for retail FD datasets
      if (genRate < 2.0 && classified.product_type === "retail_fd") {
        const msg = `Row ${idx} (${tenureStr}): Rejected retail rate ${genRate}% below 2.0%.`;
        validationErrors.push(msg);
        this.logger.warn("row_rejected", { detail: msg });
        return;
      }

      // Parse range bounds
      const [minDays, maxDays] = parseTenureRange(tenureStr);

      if (minDays !== null && maxDays !== null && minDays > maxDays) {
        const msg = `Row ${idx} (${tenureStr}): Rejected due to range boundary inversion (min_days ${minDays} > max_days ${maxDays}).`;
        validationErrors.push(msg);
        this.logger.warn("row_rejected", { detail: msg });
        return;
      }

      // Check duplicate tenure compound key
      const normalizedTenureStr = minDays !== null ? `${minDays}-${maxDays}` : tenureStr;
      const compoundKey = `${this.bankName}|${normalizedTenureStr}|${classified.product_type}|${sectionName}`;
      if (seenKeys.has(compoundKey)) {
        duplicateCount++;
        const msg = `Row ${idx}: Duplicate tenure '${tenureStr}' for product ${classified.product_type} in section '${sectionName}'.`;
        validationErrors.push(msg);
        this.logger.warn("validation_warning", { detail: msg });
        return;
      }
      seenKeys.add(compoundKey);

      validatedRates.push({
        tenure: tenureStr,
        general_rate: genRate,
        senior_citizen_rate: srRate !== null ? srRate : genRate,
        effective_from: rowEffectiveDate || effectiveDate,
        effective_to: item.effective_to || rawData.effective_to || null,
        notes: item.notes || null,
        product_type: classified.product_type,
        deposit_category: classified.deposit_category,
        customer_segment: classified.customer_segment,
        callable: classified.callable,
        scheme_type: classified.scheme_type,
        scheme_name: classified.scheme_name,
        section_name: sectionName,
        table_name: tableName,
        min_days: minDays,
        max_days: maxDays
      });
    });

    // Group rates to detect overlaps
    const groups = {};
    validatedRates.forEach(r => {
      if (r.scheme_type === "regular_fd" && r.min_days !== null && r.max_days !== null) {
        const gKey = `${r.product_type}|${r.deposit_category}|${r.customer_segment}|${r.callable}`;
        if (!groups[gKey]) groups[gKey] = [];
        groups[gKey].push(r);
      }
    });

    for (const [gKey, gRates] of Object.entries(groups)) {
      gRates.sort((a, b) => a.min_days - b.min_days);
      for (let i = 0; i < gRates.length - 1; i++) {
        const curr = gRates[i];
        const nxt = gRates[i + 1];
        if (curr.max_days >= nxt.min_days) {
          anomalyCount++;
          const msg = `Interval overlap detected: '${curr.tenure}' (max_days ${curr.max_days}) overlaps with '${nxt.tenure}' (min_days ${nxt.min_days}) for group ${gKey}.`;
          validationErrors.push(msg);
          this.logger.warn("interval_overlap_warning", { detail: msg });
        }
      }
    }

    // Scrape confidence
    let scrapeConfidence = 0.0;
    if (validatedRates.length > 0) {
      let baseConfidence = 1.0;
      if (rawData.fallback_used || rawData.is_fallback) {
        baseConfidence = 0.5;
      } else if (rawData.unstructured_fallback_used) {
        baseConfidence = 0.4;
      } else if (this.url.toLowerCase().endsWith(".pdf")) {
        baseConfidence = 0.85;
      }
      scrapeConfidence = Math.max(0.1, Math.round((baseConfidence - (duplicateCount * 0.02) - (anomalyCount * 0.05)) * 100) / 100);
    }

    // Build full schema
    const rawScheme = {
      bank_name: this.bankName,
      source_url: this.url,
      rate_effective_date: effectiveDate || rawData.rate_effective_date || null,
      page_last_updated: rawData.last_updated_on_page || effectiveDate || null,
      last_updated_on_page: rawData.last_updated_on_page || null,
      fd_rates: validatedRates,
      minimum_deposit: rawData.minimum_deposit || null,
      maximum_deposit: rawData.maximum_deposit || null,
      premature_withdrawal_available: rawData.premature_withdrawal_available !== undefined ? rawData.premature_withdrawal_available : null,
      premature_withdrawal_penalty: rawData.premature_withdrawal_penalty || null,
      loan_against_fd_available: rawData.loan_against_fd_available !== undefined ? rawData.loan_against_fd_available : null,
      tax_saver_fd_available: rawData.tax_saver_fd_available !== undefined ? rawData.tax_saver_fd_available : null,
      tax_saver_tenure: rawData.tax_saver_tenure || null,
      nomination_available: rawData.nomination_available !== undefined ? rawData.nomination_available : null,
      compounding_frequency: rawData.compounding_frequency || null,
      scrape_confidence: scrapeConfidence,
      duplicate_count: duplicateCount,
      anomaly_count: anomalyCount,
      scraper_version: rawData.scraper_version || "1.0.0"
    };

    try {
      const parsedScheme = bankFdSchemeSchema.parse(rawScheme);
      return parsedScheme;
    } catch (e) {
      if (e.errors) {
        e.errors.forEach(err => {
          const msg = `Global model metadata validation: Field ${err.path.join(".")} - ${err.message}`;
          validationErrors.push(msg);
          this.logger.error("validation_error", { detail: msg });
        });
      } else {
        validationErrors.push(e.message);
        this.logger.error("validation_error", { detail: e.message });
      }
      return {
        bank_name: this.bankName,
        source_url: this.url,
        fd_rates: [],
        scrape_confidence: 0.0,
        validation_score: 0.0,
        duplicate_count: 0,
        anomaly_count: 0,
        status: "FAILED"
      };
    }
  }
}
