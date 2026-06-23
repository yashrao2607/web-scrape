import fs from 'fs';
import path from 'path';

const resultsPath = path.resolve('output/results.json');

function verify() {
  if (!fs.existsSync(resultsPath)) {
    console.error("results.json does not exist!");
    process.exit(1);
  }

  const content = fs.readFileSync(resultsPath, 'utf8');
  let data;
  try {
    data = JSON.parse(content);
  } catch (err) {
    console.error("Invalid JSON syntax in results.json:", err.message);
    process.exit(1);
  }

  if (!Array.isArray(data)) {
    console.error("results.json is not an array!");
    process.exit(1);
  }

  console.log(`Verifying ${data.length} banks in results.json...`);

  const allowedOuterKeys = new Set(['bank_name', 'url', 'rates']);
  const allowedRateKeys = new Set(['tenure', 'interest_rate', 'senior_citizen_interest_rate']);
  let errorsCount = 0;

  data.forEach((bank, bankIdx) => {
    const bankName = bank.bank_name || `Bank at index ${bankIdx}`;
    
    // 1. Check outer keys
    const outerKeys = Object.keys(bank);
    const extraOuterKeys = outerKeys.filter(k => !allowedOuterKeys.has(k));
    if (extraOuterKeys.length > 0) {
      console.error(`[Error] Bank "${bankName}" has extra keys:`, extraOuterKeys);
      errorsCount++;
    }
    const missingOuterKeys = [...allowedOuterKeys].filter(k => !(k in bank));
    if (missingOuterKeys.length > 0) {
      console.error(`[Error] Bank "${bankName}" is missing keys:`, missingOuterKeys);
      errorsCount++;
    }

    // 2. Check url
    if (typeof bank.url !== 'string' || !bank.url.startsWith('http')) {
      console.error(`[Error] Bank "${bankName}" has invalid url:`, bank.url);
      errorsCount++;
    }

    // 3. Check rates
    if (!Array.isArray(bank.rates)) {
      console.error(`[Error] Bank "${bankName}" rates is not an array.`);
      errorsCount++;
      return;
    }

    if (bank.rates.length === 0) {
      console.error(`[Error] Bank "${bankName}" rates list is empty.`);
      errorsCount++;
    }

    bank.rates.forEach((rate, rateIdx) => {
      const rateKeys = Object.keys(rate);
      const extraRateKeys = rateKeys.filter(k => !allowedRateKeys.has(k));
      if (extraRateKeys.length > 0) {
        console.error(`[Error] Bank "${bankName}" rate at index ${rateIdx} has extra keys:`, extraRateKeys);
        errorsCount++;
      }
      const missingRateKeys = [...allowedRateKeys].filter(k => !(k in rate));
      if (missingRateKeys.length > 0) {
        console.error(`[Error] Bank "${bankName}" rate at index ${rateIdx} is missing keys:`, missingRateKeys);
        errorsCount++;
      }

      // 4. Validate values
      if (typeof rate.tenure !== 'string' || rate.tenure.trim() === '') {
        console.error(`[Error] Bank "${bankName}" rate at index ${rateIdx} has invalid/empty tenure:`, rate.tenure);
        errorsCount++;
      }

      if (typeof rate.interest_rate !== 'number' || isNaN(rate.interest_rate) || rate.interest_rate <= 0) {
        console.error(`[Error] Bank "${bankName}" rate at index ${rateIdx} has invalid interest_rate:`, rate.interest_rate);
        errorsCount++;
      }

      if (typeof rate.senior_citizen_interest_rate !== 'number' || isNaN(rate.senior_citizen_interest_rate) || rate.senior_citizen_interest_rate <= 0) {
        console.error(`[Error] Bank "${bankName}" rate at index ${rateIdx} has invalid senior_citizen_interest_rate:`, rate.senior_citizen_interest_rate);
        errorsCount++;
      }
    });
  });

  if (errorsCount === 0) {
    console.log("All banks verified successfully. The results.json strictly matches the required schema and constraints!");
  } else {
    console.error(`Verification completed with ${errorsCount} errors.`);
    process.exit(1);
  }
}

verify();
