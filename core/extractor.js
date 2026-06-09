import { parseTenure, extractEffectiveDate } from './normalizer.js';
import fs from 'fs';
import pdf from 'pdf-parse';

export class LayeredExtractor {
  static TENURE_KEYWORDS = ["tenure", "duration", "period", "days", "months", "years", "maturity", "term", "tenor", "tenors", "maturity period"];
  static GENERAL_RATE_KEYWORDS = ["general", "public", "rate", "interest rate", "general public", "regular", "non-senior", "interest", "card rate", "%", "roi"];
  static SENIOR_RATE_KEYWORDS = ["senior", "sr. citizen", "sr", "seniors", "sr citizen", "senior citizen"];

  static async extractFromPage(page) {

    const tables = await page.evaluate(() => {
      const results = [];

      function getPrecedingHeading(el) {
        let current = el;
        while (current) {
          let sibling = current.previousElementSibling;
          while (sibling) {
            if (/^(H[1-6])$/i.test(sibling.tagName)) {
              return sibling.innerText.trim();
            }
            const heading = sibling.querySelector('h1, h2, h3, h4, h5, h6');
            if (heading) {
              return heading.innerText.trim();
            }
            sibling = sibling.previousElementSibling;
          }
          current = current.parentElement;
        }
        return "";
      }

      // 1. Standard HTML tables with colspan/rowspan expansion
      const standardTables = document.querySelectorAll('table');
      standardTables.forEach(table => {
        const rows = table.querySelectorAll('tr');
        const grid = [];
        for (let r = 0; r < rows.length; r++) {
          grid[r] = [];
        }

        rows.forEach((tr, rIndex) => {
          let colIndex = 0;
          tr.querySelectorAll('th, td').forEach(cell => {
            while (grid[rIndex][colIndex] !== undefined) {
              colIndex++;
            }
            const text = cell.innerText.trim();
            const colspan = cell.colSpan || 1;
            const rowspan = cell.rowSpan || 1;

            for (let r = 0; r < rowspan; r++) {
              const targetRow = rIndex + r;
              if (targetRow < rows.length) {
                for (let c = 0; c < colspan; c++) {
                  grid[targetRow][colIndex + c] = text;
                }
              }
            }
            colIndex += colspan;
          });
        });

        const matrix = grid.filter(row => row.length > 0);
        if (matrix.length > 0) {
          const sectionName = getPrecedingHeading(table);
          const caption = table.querySelector('caption')?.innerText.trim() || "";
          results.push({
            matrix: matrix,
            section_name: sectionName,
            table_name: caption || (matrix[0].length === 1 ? matrix[0][0] : "")
          });
        }
      });

      // 2. Custom grid/flex layouts acting as tables
      const gridTables = document.querySelectorAll('[role="table"], [role="grid"]');
      gridTables.forEach(grid => {
        const matrix = [];
        grid.querySelectorAll('[role="row"]').forEach(row => {
          const cols = [];
          row.querySelectorAll('[role="cell"], [role="columnheader"]').forEach(cell => {
            cols.push(cell.innerText.trim());
          });
          if (cols.length > 0) matrix.push(cols);
        });
        if (matrix.length > 0) {
          const sectionName = getPrecedingHeading(grid);
          results.push({
            matrix: matrix,
            section_name: sectionName,
            table_name: matrix[0].length === 1 ? matrix[0][0] : ""
          });
        }
      });

      return results;
    });

    return tables;
  }

  static matchHeaders(headerRow) {
    const headerLower = headerRow.map(h => h.toLowerCase());
    const mapping = {
      tenure_idx: null,
      general_idx: null,
      senior_idx: null
    };

    // 1. Find Tenure Column
    for (let idx = 0; idx < headerLower.length; idx++) {
      if (this.TENURE_KEYWORDS.some(k => headerLower[idx].includes(k))) {
        mapping.tenure_idx = idx;
        break;
      }
    }

    if (mapping.tenure_idx === null) {
      return mapping;
    }

    // 2. Find General Rate Column
    let bestGeneralScore = -1;
    for (let idx = 0; idx < headerLower.length; idx++) {
      if (idx === mapping.tenure_idx) {
        continue;
      }

      if (!this.GENERAL_RATE_KEYWORDS.some(k => headerLower[idx].includes(k))) {
        continue;
      }

      let score = 0;
      if (this.GENERAL_RATE_KEYWORDS.some(k => headerLower[idx].includes(k))) {
        score += 10;
      }
      if (!headerLower[idx].includes("senior") && !headerLower[idx].includes("sr")) {
        score += 2;
      }

      if (score > bestGeneralScore) {
        bestGeneralScore = score;
        mapping.general_idx = idx;
      }
    }

    // 3. Find Senior Citizen Column
    let bestSeniorScore = -1;
    for (let idx = 0; idx < headerLower.length; idx++) {
      if (idx === mapping.tenure_idx || idx === mapping.general_idx) {
        continue;
      }

      if (!this.SENIOR_RATE_KEYWORDS.some(k => headerLower[idx].includes(k))) {
        continue;
      }

      let score = 0;
      if (this.SENIOR_RATE_KEYWORDS.some(k => headerLower[idx].includes(k))) {
        score += 10;
      }

      if (score > bestSeniorScore) {
        bestSeniorScore = score;
        mapping.senior_idx = idx;
      }
    }

    return mapping;
  }

  static parseExtractedTable(tableData) {
    let matrix = [];
    let sectionName = "";
    let tableName = "";

    if (tableData && typeof tableData === 'object' && !Array.isArray(tableData)) {
      matrix = tableData.matrix || [];
      sectionName = tableData.section_name || "";
      tableName = tableData.table_name || "";
    } else {
      matrix = tableData || [];
    }

    if (matrix.length < 2) {
      return [];
    }

    // Clean cell strings
    const rawCleanedTable = matrix.map(row =>
      row.map(cell => cell ? String(cell).trim().replace(/\xa0/g, " ") : "")
    );

    // Pad all rows
    const numCols = Math.max(...rawCleanedTable.map(row => row.length));
    const cleanedTable = rawCleanedTable.map(row => {
      const padded = [...row];
      while (padded.length < numCols) {
        padded.push("");
      }
      return padded;
    });

    // Identify first data row
    let firstDataIdx = -1;
    let detectedTenureCol = null;
    for (let idx = 0; idx < cleanedTable.length; idx++) {
      const row = cleanedTable[idx];
      if (row.length >= 2) {
        for (let colIdx = 0; colIdx < Math.min(row.length, 3); colIdx++) {
          const cell = row[colIdx];
          if (cell.length < 50 && !["note", "disclaimer", "effective", "interest", "table", "rates", "*"].some(x => cell.toLowerCase().startsWith(x))) {
            const [days] = parseTenure(cell);
            if (days !== null) {
              firstDataIdx = idx;
              detectedTenureCol = colIdx;
              break;
            }
          }
        }
      }
      if (firstDataIdx !== -1) break;
    }

    if (firstDataIdx <= 0) {
      firstDataIdx = 1;
    }

    const headerRows = cleanedTable.slice(0, firstDataIdx);
    const dataRows = cleanedTable.slice(firstDataIdx);

    // Filter headers
    let filteredHeaderRows = headerRows.filter(hr => {
      const nonEmpty = hr.filter(c => c);
      return new Set(nonEmpty).size >= 2;
    });

    if (filteredHeaderRows.length === 0) {
      filteredHeaderRows = [cleanedTable[0]];
    }

    // Horizontal forward fill and vertical merge
    const filledHeaderRows = filteredHeaderRows.map(hr => {
      const filled = [];
      let currentVal = "";
      hr.forEach(cell => {
        if (cell) currentVal = cell;
        filled.push(currentVal);
      });
      while (filled.length < numCols) {
        filled.push("");
      }
      return filled;
    });

    const flattenedHeader = [];
    for (let colIdx = 0; colIdx < numCols; colIdx++) {
      const colCells = [];
      filledHeaderRows.forEach(hr => {
        const val = hr[colIdx];
        if (val && (colCells.length === 0 || colCells[colCells.length - 1] !== val)) {
          colCells.push(val);
        }
      });
      flattenedHeader.push(colCells.join(" "));
    }

    let effectiveDate = extractEffectiveDate(flattenedHeader.join(" "));
    if (!effectiveDate && sectionName) {
      effectiveDate = extractEffectiveDate(sectionName);
    }

    // Skip Recurring Deposit tables
    const secUpper = sectionName.toUpperCase();
    const tblUpper = tableName.toUpperCase();
    if (secUpper.includes("RECURRING DEPOSIT") || tblUpper.includes("RECURRING DEPOSIT")) {
      return [];
    }

    // Skip penalty tables
    const penaltyKeywords = ["penalty", "penal", "charges", "fee", "fore closure"];
    const headerStr = flattenedHeader.join(" ").toLowerCase();
    if (penaltyKeywords.some(pk => headerStr.includes(pk))) {
      return [];
    }

    // Match headers
    const mapping = this.matchHeaders(flattenedHeader);
    let tenureIdx = mapping.tenure_idx;
    let generalIdx = mapping.general_idx;
    let seniorIdx = mapping.senior_idx;

    if (detectedTenureCol !== null) {
      tenureIdx = detectedTenureCol;
    }

    if (tenureIdx === null || generalIdx === null) {
      return [];
    }

    const parsedRows = [];
    dataRows.forEach((row) => {
      if (row.length <= Math.max(tenureIdx, generalIdx, seniorIdx || 0)) {
        return;
      }

      const tenureRaw = row[tenureIdx].trim();
      const generalRaw = row[generalIdx].trim();
      const seniorRaw = seniorIdx !== null ? row[seniorIdx].trim() : "";

      if (!tenureRaw || this.TENURE_KEYWORDS.some(k => tenureRaw.toLowerCase() === k)) {
        return;
      }

      if (!generalRaw || ["-", "nil", "n.a.", "na"].includes(generalRaw.toLowerCase())) {
        return;
      }

      parsedRows.push({
        tenure_raw: tenureRaw,
        general_raw: generalRaw,
        senior_raw: seniorRaw || generalRaw,
        section_name: sectionName,
        table_name: tableName,
        rate_effective_date: effectiveDate
      });
    });

    return parsedRows;
  }

  static async extractFromUnstructuredText(page) {
    let textContent = "";
    try {
      textContent = await page.innerText("body");
    } catch (e) {
      return [];
    }

    const lines = textContent.split("\n").map(l => l.trim()).filter(l => l);
    const results = [];
    const pattern = /([\d\s]+(?:days?|months?|years?|d|m|y)(?:\s*(?:to|-)\s*[\d\s]+(?:days?|months?|years?|d|m|y))?)\s*[:\-–—]\s*(\d+(?:\.\d+)?)\s*%/i;

    lines.forEach(line => {
      const match = pattern.exec(line);
      if (match) {
        const tenure = match[1].trim();
        const rate = match[2].trim();

        const seniorMatch = /(?:senior|sr\.?)\s*(?:citizen)?\s*[:\-–—]?\s*(\d+(?:\.\d+)?)\s*%/i.exec(line);
        const seniorRate = seniorMatch ? seniorMatch[1].trim() : rate;

        results.push({
          tenure_raw: tenure,
          general_raw: rate,
          senior_raw: seniorRate
        });
      }
    });

    return results;
  }

  static async extractFromPdf(pdfPath) {
    const aggregatedRows = [];

    try {
      const dataBuffer = fs.readFileSync(pdfPath);
      const data = await pdf(dataBuffer);
      const textContent = data.text;

      const lines = textContent.split("\n").map(l => l.trim()).filter(l => l);

      // Two PDF layouts are supported:
      //
      //   (A) Single-line: "7 days to 14 days 2.75 3.25"
      //                       tenure + 1-4 rate numbers on the SAME line
      //
      //   (B) Two-line:    "7 – 14 days"           ← tenure
      //                    "3.00 3.50 3.50 4.00"   ← 1-4 rate numbers on the NEXT line
      //       (Axis Bank's live PDF uses this layout with 4 rate columns)
      //
      const singleLinePattern = /([\d\s]+(?:days?|months?|years?|d|m|y)(?:\s*(?:to|-|less\s+than|<)\s*[\d\s]+(?:days?|months?|years?|d|m|y))?)\s+(\d+\.\d+)(?:\s+(\d+\.\d+))?(?:\s+(\d+\.\d+))?(?:\s+(\d+\.\d+))?/i;
      const tenureOnlyPattern  = /^([\d\s]+(?:days?|months?|years?|d|m|y)(?:\s*(?:to|-|less\s+than|<)\s*[\d\s]+(?:days?|months?|years?|d|m|y))?)\s*$/i;
      const rateOnlyPattern    = /^(\d+\.\d+)(?:\s+(\d+\.\d+))?(?:\s+(\d+\.\d+))?(?:\s+(\d+\.\d+))?\s*$/i;

      const emitRow = (tenure, rateCols, sectionName) => {
        if (rateCols.length >= 4) {
          // 4-col PDF (Axis-style): 2 deposit brackets × 2 customer types.
          // Emit 2 rows — one per deposit bracket. The tier-mapper in main.js
          // assigns tier=1 to the first row, tier=2 to the second.
          //   col 1: general <3Cr,  col 3: senior <3Cr   → row 1
          //   col 2: general 3-5Cr, col 4: senior 3-5Cr  → row 2
          aggregatedRows.push({
            tenure_raw: tenure,
            general_raw: rateCols[0],
            senior_raw: rateCols[2],
            section_name: sectionName + " <₹3 Cr",
            table_name: ""
          });
          aggregatedRows.push({
            tenure_raw: tenure,
            general_raw: rateCols[1],
            senior_raw: rateCols[3],
            section_name: sectionName + " ₹3 Cr to <₹5 Cr",
            table_name: ""
          });
        } else if (rateCols.length >= 2) {
          aggregatedRows.push({
            tenure_raw: tenure,
            general_raw: rateCols[0],
            senior_raw: rateCols[1],
            section_name: sectionName,
            table_name: ""
          });
        } else if (rateCols.length === 1) {
          aggregatedRows.push({
            tenure_raw: tenure,
            general_raw: rateCols[0],
            senior_raw: rateCols[0],
            section_name: sectionName,
            table_name: ""
          });
        }
      };

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Skip obvious header / metadata lines
        if (["note", "disclaimer", "effective", "table", "rates"].some(x => line.toLowerCase().startsWith(x))) {
          continue;
        }

        // Layout A: tenure + rates on the same line
        const singleMatch = singleLinePattern.exec(line);
        if (singleMatch) {
          const tenure = singleMatch[1].trim();
          const rateCols = [singleMatch[2], singleMatch[3], singleMatch[4], singleMatch[5]].filter(r => r !== undefined);
          emitRow(tenure, rateCols, "PDF Interest Rates");
          continue;
        }

        // Layout B: tenure on this line, rates on the next line
        const tenureMatch = tenureOnlyPattern.exec(line);
        if (tenureMatch) {
          const tenure = tenureMatch[1].trim();
          const nextLine = lines[i + 1];
          if (nextLine) {
            const rateMatch = rateOnlyPattern.exec(nextLine);
            if (rateMatch) {
              const rateCols = [rateMatch[1], rateMatch[2], rateMatch[3], rateMatch[4]].filter(r => r !== undefined);
              emitRow(tenure, rateCols, "PDF Interest Rates");
              i++;  // skip the rate line we just consumed
            }
          }
        }
      }
    } catch (e) {
    }

    return aggregatedRows;
  }
}
