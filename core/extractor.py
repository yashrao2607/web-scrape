import re
import structlog
import pdfplumber
from typing import List, Dict, Any, Tuple, Optional
from bs4 import BeautifulSoup
from playwright.async_api import Page

logger = structlog.get_logger()

class LayeredExtractor:
    """
    Implements a multi-layered extraction architecture to extract FD rates
    and terms from HTML pages and local PDF documents.
    """
    
    # Keyword classification definitions
    TENURE_KEYWORDS = ["tenure", "duration", "period", "days", "months", "years", "maturity", "term", "tenor", "tenors", "maturity period"]
    GENERAL_RATE_KEYWORDS = ["general", "public", "rate", "interest rate", "general public", "regular", "non-senior", "interest", "card rate", "%", "roi"]
    SENIOR_RATE_KEYWORDS = ["senior", "sr. citizen", "sr", "seniors", "sr citizen", "senior citizen"]
    
    @classmethod
    async def extract_from_page(cls, page: Page) -> List[Dict[str, Any]]:
        """
        Level 1: Semantic table detection directly in the browser DOM.
        Detects <table> elements, flex/grid rows, and ARIA table roles.
        Returns a list of dictionaries containing table matrices and context (section_name, table_name).
        """
        logger.info("level_1_semantic_table_detection")
        
        # In-browser semantic script to extract all text-based tables, including custom div grids
        tables = await page.evaluate("""
            () => {
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
                
                // 2. Custom grid/flex layouts acting as tables (detect by ARIA or structural similarity)
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
            }
        """)
        return tables

    @classmethod
    def match_headers(cls, header_row: List[str]) -> Dict[str, Optional[int]]:
        """
        Level 2: Header-based column matching.
        Maps table headers to tenure, general public rates, and senior citizen rates.
        """
        header_lower = [h.lower() for h in header_row]
        mapping: Dict[str, Optional[int]] = {
            "tenure_idx": None,
            "general_idx": None,
            "senior_idx": None
        }

        # Step 1: Find Tenure Column
        for idx, h in enumerate(header_lower):
            if any(k in h for k in cls.TENURE_KEYWORDS):
                mapping["tenure_idx"] = idx
                break
                
        if mapping["tenure_idx"] is None:
            return mapping

        # Step 2: Find General Rate Column
        best_general_score = -1
        for idx, h in enumerate(header_lower):
            if idx == mapping["tenure_idx"]:
                continue
            
            # Must contain at least one general or interest rate keyword to be considered
            if not any(k in h for k in cls.GENERAL_RATE_KEYWORDS):
                continue
                
            score = 0
            if any(k in h for k in cls.GENERAL_RATE_KEYWORDS):
                score += 10
            if "senior" not in h and "sr" not in h:
                score += 2  # Boost if it does not belong to senior citizen
                
            if score > best_general_score:
                best_general_score = score
                mapping["general_idx"] = idx

        # Step 3: Find Senior Citizen Column
        best_senior_score = -1
        for idx, h in enumerate(header_lower):
            if idx == mapping["tenure_idx"] or idx == mapping["general_idx"]:
                continue
                
            # Must contain at least one senior keyword to be considered
            if not any(k in h for k in cls.SENIOR_RATE_KEYWORDS):
                continue
                
            score = 0
            if any(k in h for k in cls.SENIOR_RATE_KEYWORDS):
                score += 10
                
            if score > best_senior_score:
                best_senior_score = score
                mapping["senior_idx"] = idx

        return mapping

    @classmethod
    def parse_extracted_table(cls, table_data: Any) -> List[Dict[str, Any]]:
        """
        Applies Level 2 column matching to parse a 2D matrix (or table data dictionary)
        into a structured list of records, preserving table context.
        """
        if isinstance(table_data, dict):
            matrix = table_data.get("matrix", [])
            section_name = table_data.get("section_name", "")
            table_name = table_data.get("table_name", "")
        else:
            matrix = table_data
            section_name = ""
            table_name = ""

        if len(matrix) < 2:
            return []

        from core.normalizer import parse_tenure, extract_effective_date

        # Clean table cell strings
        raw_cleaned_table = []
        for row in matrix:
            raw_cleaned_table.append([cell.strip().replace("\xa0", " ") if cell else "" for cell in row])

        # Pad all rows to the maximum row length to avoid truncation of columns
        num_cols = max(len(row) for row in raw_cleaned_table) if raw_cleaned_table else 0
        cleaned_table = []
        for row in raw_cleaned_table:
            padded_row = list(row)
            while len(padded_row) < num_cols:
                padded_row.append("")
            cleaned_table.append(padded_row)

        # 1. Identify the first data row and record which column matched
        first_data_idx = -1
        detected_tenure_col = None
        for idx, row in enumerate(cleaned_table):
            if len(row) >= 2:
                # Check the first few cells to see if one is successfully parsed as tenure
                for col_idx, cell in enumerate(row[:3]):
                    # Exclude note rows containing durations
                    if len(cell) < 50 and not any(cell.lower().startswith(x) for x in ["note", "disclaimer", "effective", "interest", "table", "rates", "*"]):
                        days, _, _ = parse_tenure(cell)
                        if days is not None:
                            first_data_idx = idx
                            detected_tenure_col = col_idx
                            break
            if first_data_idx != -1:
                break

        # Fallback if no data row found or if it starts at 0
        if first_data_idx <= 0:
            first_data_idx = 1

        # 2. Extract and flatten header rows
        header_rows = cleaned_table[:first_data_idx]
        data_rows = cleaned_table[first_data_idx:]

        # Filter out rows with low column diversity (title/note rows)
        filtered_header_rows = []
        for hr in header_rows:
            non_empty = [c for c in hr if c]
            if len(set(non_empty)) >= 2:
                filtered_header_rows.append(hr)

        if not filtered_header_rows:
            # Fallback to the first row as header
            filtered_header_rows = [cleaned_table[0]]

        # Horizontal forward fill for colspans and vertical merge
        filled_header_rows = []
        for hr in filtered_header_rows:
            filled_row = []
            current_val = ""
            for cell in hr:
                if cell:
                    current_val = cell
                filled_row.append(current_val)
            # Pad filled_row to match num_cols just in case
            while len(filled_row) < num_cols:
                filled_row.append("")
            filled_header_rows.append(filled_row)

        flattened_header = []
        for col_idx in range(num_cols):
            col_cells = []
            for hr in filled_header_rows:
                val = hr[col_idx]
                if val and (not col_cells or col_cells[-1] != val):
                    col_cells.append(val)
            flattened_header.append(" ".join(col_cells))

        # Try to extract effective date from flattened header or section name
        effective_date = extract_effective_date(" ".join(flattened_header))
        if not effective_date and section_name:
            effective_date = extract_effective_date(section_name)

        # 3. Check if recurring deposit keywords are present
        sec_upper = section_name.upper() if section_name else ""
        tbl_upper = table_name.upper() if table_name else ""
        if "RECURRING DEPOSIT" in sec_upper or "RECURRING DEPOSIT" in tbl_upper:
            logger.info("skipping_recurring_deposit_table", section=section_name, table=table_name)
            return []

        # 4. Check for penalty/charges keywords in the flattened header
        penalty_keywords = ["penalty", "penal", "charges", "fee", "fore closure"]
        header_str = " ".join(flattened_header).lower()
        if any(pk in header_str for pk in penalty_keywords):
            logger.info("skipping_penalty_or_charges_table", header=flattened_header)
            return []

        # 4. Match headers
        mapping = cls.match_headers(flattened_header)
        tenure_idx = mapping["tenure_idx"]
        general_idx = mapping["general_idx"]
        senior_idx = mapping["senior_idx"]

        # Use the detected tenure column from the first data row as a refinement
        if detected_tenure_col is not None:
            tenure_idx = detected_tenure_col

        if tenure_idx is None or general_idx is None:
            logger.warning("failed_to_match_table_headers", header=flattened_header)
            return []

        parsed_rows = []
        for r_idx, row in enumerate(data_rows):
            # Ensure index safety
            if len(row) <= max(tenure_idx, general_idx, senior_idx or 0):
                continue

            tenure_raw = row[tenure_idx].strip()
            general_raw = row[general_idx].strip()
            senior_raw = row[senior_idx].strip() if senior_idx is not None else ""

            # Skip if tenure is empty or matches a header keyword
            if not tenure_raw or any(k == tenure_raw.lower() for k in cls.TENURE_KEYWORDS):
                continue

            if not general_raw or general_raw.lower() in ["-", "nil", "n.a.", "na"]:
                continue

            parsed_rows.append({
                "tenure_raw": tenure_raw,
                "general_raw": general_raw,
                "senior_raw": senior_raw or general_raw,
                "section_name": section_name,
                "table_name": table_name,
                "rate_effective_date": effective_date
            })
            
        return parsed_rows

    @classmethod
    async def extract_from_unstructured_text(cls, page: Page) -> List[Dict[str, Any]]:
        """
        Level 3 & 4: Keyword-based and pattern recognition parsing for unstructured pages.
        """
        logger.info("level_3_4_unstructured_text_extraction")
        text_content = await page.inner_text("body")
        lines = [line.strip() for line in text_content.split("\n") if line.strip()]
        
        results = []
        # Pattern like: 1 Year - 7.10% (Senior Citizen: 7.60%)
        # or "7 days to 14 days: 3.00%"
        pattern = re.compile(
            r"([\d\s]+(?:days?|months?|years?|d|m|y)(?:\s*(?:to|-)\s*[\d\s]+(?:days?|months?|years?|d|m|y))?)\s*[:\-–—]\s*(\d+(?:\.\d+)?)\s*%",
            re.IGNORECASE
        )
        
        for line in lines:
            match = pattern.search(line)
            if match:
                tenure = match.group(1).strip()
                rate = match.group(2).strip()
                
                # Check if senior rate is in the same line
                senior_match = re.search(r"(?:senior|sr\.?)\s*(?:citizen)?\s*[:\-–—]?\s*(\d+(?:\.\d+)?)\s*%", line, re.IGNORECASE)
                senior_rate = senior_match.group(1).strip() if senior_match else rate
                
                results.append({
                    "tenure_raw": tenure,
                    "general_raw": rate,
                    "senior_raw": senior_rate
                })
                
        return results

    @classmethod
    def extract_from_pdf(cls, pdf_path: str) -> List[Dict[str, Any]]:
        """
        Level 5: Fallback PDF document table extraction.
        Loads the PDF, extracts tables from all pages, and aggregates parsed rows.
        """
        logger.info("level_5_pdf_table_extraction", path=pdf_path)
        aggregated_rows = []
        
        try:
            with pdfplumber.open(pdf_path) as pdf:
                for page_num, page in enumerate(pdf.pages):
                    tables = page.extract_tables()
                    logger.debug("extracted_pdf_tables_on_page", page=page_num, count=len(tables))
                    for table in tables:
                        # Clean cells
                        cleaned_table = []
                        for row in table:
                            cleaned_row = [cell.strip().replace("\n", " ") if cell else "" for cell in row]
                            if any(cleaned_row):
                                cleaned_table.append(cleaned_row)
                                
                        if cleaned_table:
                            parsed = cls.parse_extracted_table(cleaned_table)
                            if parsed:
                                aggregated_rows.extend(parsed)
        except Exception as e:
            logger.error("pdf_extraction_failed", path=pdf_path, error=str(e))
            
        return aggregated_rows
