import fs from 'fs';
import { logger } from './logger.js';

export class ChangeDetector {
  static loadHistoricalData(filepath) {
    if (!fs.existsSync(filepath)) {
      logger.info("historical_data_not_found", { path: filepath });
      return [];
    }
    try {
      const content = fs.readFileSync(filepath, "utf-8");
      const data = JSON.parse(content);
      if (Array.isArray(data)) {
        return data;
      } else if (data && typeof data === 'object' && Array.isArray(data.banks)) {
        return data.banks;
      }
      return [];
    } catch (e) {
      logger.error("failed_to_load_historical_data", { path: filepath, error: e.message });
      return [];
    }
  }

  static detectChanges(newData, oldData) {
    logger.info("running_change_detection");

    const oldBanks = {};
    oldData.forEach(b => {
      if (b && b.bank_name) {
        oldBanks[b.bank_name] = b;
      }
    });

    const report = [];

    newData.forEach(newBank => {
      const bankName = newBank.bank_name;

      if (!oldBanks[bankName]) {
        report.push({
          bank: bankName,
          changes_detected: true,
          event: "new_bank_added",
          rate_changes: [],
          metadata_changes: []
        });
        return;
      }

      const oldBank = oldBanks[bankName];
      let changesDetected = false;
      const rateChanges = [];
      const metadataChanges = [];

      // Compare rates
      const oldRatesMap = {};
      (oldBank.fd_rates || []).forEach(r => {
        if (r && r.tenure) {
          oldRatesMap[r.tenure] = r;
        }
      });

      const newRatesMap = {};
      (newBank.fd_rates || []).forEach(r => {
        if (r && r.tenure) {
          newRatesMap[r.tenure] = r;
        }
      });

      for (const [tenure, newVal] of Object.entries(newRatesMap)) {
        const newGen = newVal.general_rate;
        const newSr = newVal.senior_citizen_rate;

        if (!oldRatesMap[tenure]) {
          rateChanges.push({
            tenure: tenure,
            change_type: "added",
            old_general_rate: null,
            new_general_rate: newGen,
            old_senior_rate: null,
            new_senior_rate: newSr
          });
          changesDetected = true;
        } else {
          const oldVal = oldRatesMap[tenure];
          const oldGen = oldVal.general_rate;
          const oldSr = oldVal.senior_citizen_rate;

          if (oldGen !== newGen || oldSr !== newSr) {
            rateChanges.push({
              tenure: tenure,
              change_type: "rate_changed",
              old_general_rate: oldGen,
              new_general_rate: newGen,
              old_senior_rate: oldSr,
              new_senior_rate: newSr
            });
            changesDetected = true;
          }
        }
      }

      for (const tenure of Object.keys(oldRatesMap)) {
        if (!newRatesMap[tenure]) {
          const oldVal = oldRatesMap[tenure];
          rateChanges.push({
            tenure: tenure,
            change_type: "removed",
            old_general_rate: oldVal.general_rate,
            new_general_rate: null,
            old_senior_rate: oldVal.senior_citizen_rate,
            new_senior_rate: null
          });
          changesDetected = true;
        }
      }

      // Compare metadata
      const metadataFields = [
        "minimum_deposit",
        "maximum_deposit",
        "premature_withdrawal_available",
        "premature_withdrawal_penalty",
        "loan_against_fd_available",
        "tax_saver_fd_available",
        "tax_saver_tenure",
        "nomination_available",
        "compounding_frequency"
      ];

      metadataFields.forEach(field => {
        const oldVal = oldBank[field];
        const newVal = newBank[field];
        if (oldVal !== newVal) {
          metadataChanges.push({
            field: field,
            old_value: oldVal === undefined ? null : oldVal,
            new_value: newVal === undefined ? null : newVal
          });
          changesDetected = true;
        }
      });

      if (changesDetected) {
        report.push({
          bank: bankName,
          changes_detected: true,
          rate_changes: rateChanges,
          metadata_changes: metadataChanges
        });
      } else {
        report.push({
          bank: bankName,
          changes_detected: false,
          rate_changes: [],
          metadata_changes: []
        });
      }
    });

    return report;
  }
}
