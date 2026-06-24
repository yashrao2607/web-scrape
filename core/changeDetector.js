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

      // Compare rates using composite keys (tenure + tier) to handle multi-tier banks
      const makeKey = r => `${r.tenure}||${r.tier ?? ''}`;

      const oldRatesMap = {};
      (oldBank.rates || []).forEach(r => {
        if (r && r.tenure) {
          oldRatesMap[makeKey(r)] = r;
        }
      });

      const newRatesMap = {};
      (newBank.rates || []).forEach(r => {
        if (r && r.tenure) {
          newRatesMap[makeKey(r)] = r;
        }
      });

      for (const [key, newVal] of Object.entries(newRatesMap)) {
        const newGen = newVal.interest_rate;
        const newSr = newVal.senior_citizen_interest_rate;

        if (!oldRatesMap[key]) {
          rateChanges.push({
            tenure: newVal.tenure,
            tier: newVal.tier ?? null,
            change_type: "added",
            old_general_rate: null,
            new_general_rate: newGen,
            old_senior_rate: null,
            new_senior_rate: newSr
          });
          changesDetected = true;
        } else {
          const oldVal = oldRatesMap[key];
          const oldGen = oldVal.interest_rate;
          const oldSr = oldVal.senior_citizen_interest_rate;

          if (oldGen !== newGen || oldSr !== newSr) {
            rateChanges.push({
              tenure: newVal.tenure,
              tier: newVal.tier ?? null,
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

      for (const [key, oldVal] of Object.entries(oldRatesMap)) {
        if (!newRatesMap[key]) {
          rateChanges.push({
            tenure: oldVal.tenure,
            tier: oldVal.tier ?? null,
            change_type: "removed",
            old_general_rate: oldVal.interest_rate,
            new_general_rate: null,
            old_senior_rate: oldVal.senior_citizen_interest_rate,
            new_senior_rate: null
          });
          changesDetected = true;
        }
      }

      if (changesDetected) {
        report.push({
          bank: bankName,
          changes_detected: true,
          rate_changes: rateChanges,
          metadata_changes: []
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
