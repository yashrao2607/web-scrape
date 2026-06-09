import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

export class JsonWriter {
  static writeJson(data, filepath) {
    const dirName = path.dirname(filepath);
    if (dirName) {
      fs.mkdirSync(dirName, { recursive: true });
    }

    try {
      fs.writeFileSync(filepath, JSON.stringify(data, null, 2), "utf-8");
      logger.info("file_write_success", { path: filepath });
    } catch (e) {
      logger.error("file_write_failed", { path: filepath, error: e.message });
      throw e;
    }
  }

  static generateValidationReport(validationRecords, filepath) {
    let issueBanksCount = 0;
    for (const errors of Object.values(validationRecords)) {
      if (errors && errors.length > 0) {
        issueBanksCount++;
      }
    }

    const report = {
      validation_summary: {
        total_banks_checked: Object.keys(validationRecords).length,
        banks_with_issues: issueBanksCount
      },
      failures_and_warnings: validationRecords
    };
    this.writeJson(report, filepath);
  }
}
