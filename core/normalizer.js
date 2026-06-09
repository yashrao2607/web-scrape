const DAYS_PATTERNS = [/(\d+)\s*d(ay)?s?/i];
const MONTHS_PATTERNS = [/(\d+)\s*m(onth)?s?/i];
const YEARS_PATTERNS = [/(\d+)\s*y(ear)?s?/i];

export function parseTenure(tenureStr) {
  if (!tenureStr) return [null, null, null];

  let cleaned = tenureStr.trim();
  if (!cleaned) return [null, null, null];

  if (/^\d+$/.test(cleaned)) {
    if (parseInt(cleaned, 10) < 15) {
      return [null, null, null];
    }
  } else {
    if (!/\d/.test(cleaned)) {
      return [null, null, null];
    }
    if (cleaned.length < 3) {
      const hasDigit = /\d/.test(cleaned);
      const hasUnit = /[ymdw]/i.test(cleaned);
      if (!(hasDigit && hasUnit)) {
        return [null, null, null];
      }
    }
  }

  let cleanedTmp = cleaned.replace(/^(?:less\s+than|below|up\s+to|under)\s+/i, "");
  const parts = cleanedTmp.split(/\b(?:to|less\s+than|-)\b/i);
  let primaryPart = parts[0].trim();

  let totalDays = 0.0;
  let totalMonths = 0.0;
  let totalYears = 0.0;
  let foundAny = false;

  // Years
  for (const pattern of YEARS_PATTERNS) {
    const match = pattern.exec(primaryPart);
    if (match) {
      const years = parseFloat(match[1]);
      totalYears += years;
      totalMonths += years * 12.0;
      totalDays += years * 365.0;
      foundAny = true;
      primaryPart = primaryPart.replace(pattern, "");
    }
  }

  // Months
  for (const pattern of MONTHS_PATTERNS) {
    const match = pattern.exec(primaryPart);
    if (match) {
      const months = parseFloat(match[1]);
      totalMonths += months;
      totalDays += months * 30.417;
      totalYears += months / 12.0;
      foundAny = true;
      primaryPart = primaryPart.replace(pattern, "");
    }
  }

  // Days
  for (const pattern of DAYS_PATTERNS) {
    const match = pattern.exec(primaryPart);
    if (match) {
      const days = parseFloat(match[1]);
      totalDays += days;
      totalMonths += days / 30.417;
      totalYears += days / 365.0;
      foundAny = true;
      primaryPart = primaryPart.replace(pattern, "");
    }
  }

  if (!foundAny) {
    const digits = /^\d+$/.exec(primaryPart.trim());
    if (digits) {
      const days = parseFloat(digits[0]);
      totalDays = days;
      totalMonths = days / 30.417;
      totalYears = days / 365.0;
      foundAny = true;
    }
  }

  if (!foundAny) return [null, null, null];

  return [
    Math.round(totalDays * 10) / 10,
    Math.round(totalMonths * 10) / 10,
    Math.round(totalYears * 100) / 100
  ];
}

export function normalizeRate(rateStr) {
  if (!rateStr) return null;
  const cleaned = String(rateStr).replace(/%/g, "").replace(/,/g, "").trim();
  const match = /(\d+\.?\d*)/.exec(cleaned);
  if (match) {
    const val = parseFloat(match[1]);
    return isNaN(val) ? null : val;
  }
  return null;
}

export function parseTenureToDays(boundStr) {
  let cleaned = boundStr.trim();
  if (!cleaned) return null;

  let totalDays = 0.0;
  let foundAny = false;

  for (const pattern of YEARS_PATTERNS) {
    const match = pattern.exec(cleaned);
    if (match) {
      const years = parseFloat(match[1]);
      totalDays += years * 365.0;
      foundAny = true;
      cleaned = cleaned.replace(pattern, "");
    }
  }

  for (const pattern of MONTHS_PATTERNS) {
    const match = pattern.exec(cleaned);
    if (match) {
      const months = parseFloat(match[1]);
      totalDays += months * 30.417;
      foundAny = true;
      cleaned = cleaned.replace(pattern, "");
    }
  }

  for (const pattern of DAYS_PATTERNS) {
    const match = pattern.exec(cleaned);
    if (match) {
      const days = parseFloat(match[1]);
      totalDays += days;
      foundAny = true;
      cleaned = cleaned.replace(pattern, "");
    }
  }

  if (!foundAny) {
    const digits = /^\d+$/.exec(cleaned.trim());
    if (digits) {
      totalDays = parseFloat(digits[0]);
      foundAny = true;
    }
  }

  if (foundAny) return Math.round(totalDays);
  return null;
}

export function parseTenureRange(tenureStr) {
  if (!tenureStr) return [null, null];

  const cleaned = tenureStr.trim();
  const cleanedTmp = cleaned.replace(/^(?:less\s+than|below|up\s+to|under)\s+/i, "");

  if (/\band\s+above\b|\b&\s+above\b|\b\+\b/i.test(cleaned)) {
    const baseDays = parseTenureToDays(cleanedTmp);
    if (baseDays !== null) {
      return [baseDays, 36500]; // Cap at 100 years
    }
  }

  // Split range delimiters
  const parts = cleanedTmp.split(/\b(?:to|less\s+than|-)\b|(?:\bbut\s+<\b)|[<>-]/i)
                          .map(p => p.trim())
                          .filter(p => p);

  if (parts.length >= 2) {
    const part1 = parts[0];
    const part2 = parts[1];

    let days2 = parseTenureToDays(part2);
    let days1 = parseTenureToDays(part1);

    if (days1 !== null && days2 !== null) {
      const p1Lower = part1.toLowerCase();
      const p2Lower = part2.toLowerCase();

      const hasUnit1 = ["day", "month", "year", "week", "yr", "mth"].some(u => p1Lower.includes(u)) ||
                       [/\bd\b/, /\bm\b/, /\by\b/, /\bw\b/].some(rx => rx.test(p1Lower));

      if (!hasUnit1) {
        // Inherit unit of part2
        if (p2Lower.includes("year") || p2Lower.includes("yr") || /\by\b/.test(p2Lower)) {
          if (days1 < 12) {
            days1 = days1 * 365;
          }
        } else if (p2Lower.includes("month") || p2Lower.includes("mth") || /\bm\b/.test(p2Lower)) {
          if (days1 < 120) {
            days1 = Math.round(days1 * 30.417);
          }
        }
      }
      return [days1, days2];
    }
  } else if (parts.length === 1) {
    const days = parseTenureToDays(parts[0]);
    if (days !== null) {
      return [days, days];
    }
  }

  return [null, null];
}

export function classifyFDProduct(sectionName, tableName, tenureRaw) {
  const secLower = sectionName ? sectionName.toLowerCase() : "";
  const tblLower = tableName ? tableName.toLowerCase() : "";
  const tenLower = tenureRaw ? tenureRaw.toLowerCase() : "";

  // 1. product_type
  const bulkKeywords = [
    "bulk", "above 2 crore", "above 2cr", "above rs. 2 crore", "above rs' 2 crore",
    "above rs. 1 crore", "above 1 crore", "3 cr. to 10 cr.", "above rs 5 crore",
    "above rs. 5 crore", "5 cr", "10 cr", "25 cr", "50 cr", "100 cr", "200 cr", "500 cr", "1000 cr",
    "above 2.00 crore", "above 1.00 crore", "above 5.00 crore"
  ];
  const isBulk = bulkKeywords.some(bk => secLower.includes(bk) || tblLower.includes(bk));
  const productType = isBulk ? "bulk_fd" : "retail_fd";

  // 2. deposit_category
  let depositCategory = "regular";
  if (
    secLower.includes("tax saver") || tblLower.includes("tax saver") ||
    secLower.includes("tax-saver") || tblLower.includes("tax-saver") ||
    secLower.includes("80c") || tblLower.includes("80c") ||
    tenLower.includes("tax saver") || tenLower.includes("tax-saver")
  ) {
    depositCategory = "tax_saver";
  } else if (
    secLower.includes("green") || tblLower.includes("green") ||
    secLower.includes("eco") || tblLower.includes("eco")
  ) {
    depositCategory = "green_deposit";
  }

  // 3. customer_segment
  const hasResident = ["domestic", "resident"].some(k => secLower.includes(k) || tblLower.includes(k));
  const hasNre = secLower.includes("nre") || tblLower.includes("nre");
  const hasNro = secLower.includes("nro") || tblLower.includes("nro");
  const hasFcnr = secLower.includes("fcnr") || tblLower.includes("fcnr");

  const matchedSegments = [];
  if (hasResident) matchedSegments.push("resident");
  if (hasNre) matchedSegments.push("nre");
  if (hasNro) matchedSegments.push("nro");
  if (hasFcnr) matchedSegments.push("fcnr");

  let customerSegment = "resident";
  if (matchedSegments.length > 1) {
    customerSegment = "mixed";
  } else if (matchedSegments.length === 1) {
    customerSegment = matchedSegments[0];
  } else {
    if (
      secLower.includes("senior citizen special") || tblLower.includes("senior citizen special") ||
      secLower.includes("senior special") || tblLower.includes("senior special")
    ) {
      customerSegment = "senior_citizen";
    } else {
      customerSegment = "resident";
    }
  }

  // 4. callable
  let callableVal = true;
  const nonCallableKeywords = ["non-callable", "non callable", "without premature", "no premature", "uttam"];
  if (nonCallableKeywords.some(k => secLower.includes(k) || tblLower.includes(k))) {
    callableVal = false;
  }

  // 5. scheme_type & scheme_name
  let schemeType = "regular_fd";
  let schemeName = null;

  const isRange = ["to", "-", "less", "below", "above", "or more", "<", ">"].some(k => tenLower.includes(k));
  let isSpecial = false;

  if (secLower.includes("green") || tblLower.includes("green")) {
    isSpecial = true;
    schemeName = "Green Deposit";
  } else if (depositCategory === "tax_saver" || tenLower.includes("tax saver") || tenLower.includes("tax-saver")) {
    isSpecial = true;
    schemeType = "tax_saver_fd";
    schemeName = "Tax Saver FD";
  } else if (!isRange && ["day", "month", "year"].some(k => tenLower.includes(k))) {
    const cleanedTen = tenureRaw.replace(/[*#$\s]+$/, "").trim().toLowerCase();
    const standardTenures = [
      "1 year", "2 years", "3 years", "4 years", "5 years", "6 years", "7 years", "8 years", "9 years", "10 years",
      "7 days", "15 days", "30 days", "45 days", "90 days", "180 days"
    ];
    if (!standardTenures.includes(cleanedTen)) {
      isSpecial = true;
      schemeName = tenureRaw.trim() + " FD";
    }
  }

  if (isSpecial && schemeType === "regular_fd") {
    schemeType = "special_fd";
  }

  return {
    product_type: productType,
    deposit_category: depositCategory,
    customer_segment: customerSegment,
    callable: callableVal,
    scheme_type: schemeType,
    scheme_name: schemeName
  };
}

export function normalizeDateString(dateStr) {
  if (!dateStr) return null;

  let cleaned = dateStr.trim();
  cleaned = cleaned.replace(/\b(\d+)(st|nd|rd|th)\b/gi, "$1");
  cleaned = cleaned.replace(/[*#$\s]+$/, "");
  cleaned = cleaned.replace(/^\s*[:\-/\.\s]+/, "");
  cleaned = cleaned.replace(/\s+/g, " ");

  // 1. Try DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY
  const match = /\b(\d{1,2})[\.\-\/](\d{1,2})[\.\-\/](\d{4})\b/.exec(cleaned);
  if (match) {
    const d = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const y = parseInt(match[3], 10);
    try {
      const date = new Date(Date.UTC(y, m - 1, d));
      if (date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d) {
        return date.toISOString().split("T")[0];
      }
    } catch (e) {}
  }

  // 2. Text month formats: e.g. "June 9, 2026", "1 June 2026", "June 2026"
  const monthsMap = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    january: 1, february: 2, march: 3, april: 4, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
  };

  let monthNum = null;
  const cleanedLower = cleaned.toLowerCase();
  for (const [mName, mVal] of Object.entries(monthsMap)) {
    const rx = new RegExp(`\\b${mName}\\b`);
    if (rx.test(cleanedLower)) {
      monthNum = mVal;
      break;
    }
  }

  if (monthNum !== null) {
    const yearMatch = /\b(20\d{2})\b/.exec(cleaned);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : 2026;

    const numbers = [];
    const numRegex = /\b(\d{1,2})\b/g;
    let numMatch;
    while ((numMatch = numRegex.exec(cleaned)) !== null) {
      numbers.push(parseInt(numMatch[1], 10));
    }

    let day = 1;
    for (const num of numbers) {
      if (num !== year && num >= 1 && num <= 31) {
        day = num;
        break;
      }
    }

    try {
      const date = new Date(Date.UTC(year, monthNum - 1, day));
      if (date.getUTCFullYear() === year && date.getUTCMonth() === monthNum - 1 && date.getUTCDate() === day) {
        return date.toISOString().split("T")[0];
      }
    } catch (e) {}
  }

  return null;
}

export function extractEffectiveDate(text) {
  if (!text) return null;
  const match = /\bw\.e\.f\.?\s*(?:from|date)?\s*([A-Za-z0-9\.\-\/\,\s]{6,25})/i.exec(text);
  if (match) {
    const dateStr = match[1].replace(/[*#$\s]+$/, "").trim();
    return normalizeDateString(dateStr);
  }

  const directNormalized = normalizeDateString(text);
  if (directNormalized) {
    return directNormalized;
  }

  return null;
}
