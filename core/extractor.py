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
    TENURE_KEYWORDS = ["tenure", "duration", "period", "days", "months", "years", "maturity", "term", "tenor", "tenors"]
    GENERAL_RATE_KEYWORDS = ["general", "public", "rate", "interest rate", "general public", "regular", "non-senior", "interest"]
    SENIOR_RATE_KEYWORDS = ["senior", "citizen", "sr. citizen", "sr", "seniors"]
    
    @classmethod
    async def extract_from_page(cls, page: Page) -> List[List[List[str]]]:
        """
        Level 1: Semantic table detection directly in the browser DOM.
        Detects <table> elements, flex/grid rows, and ARIA table roles.
        Returns a list of 2D string matrices (tables).
        """
        logger.info("level_1_semantic_table_detection")
        
        # In-browser semantic script to extract all text-based tables, including custom div grids
        tables = await page.evaluate("""
            () => {
                const results = [];
                
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
                    if (matrix.length > 0) results.push(matrix);
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
                    if (matrix.length > 0) results.push(matrix);
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
                
        # Step 2: Find General Rate Column
        # Prefer headers containing "general" or "public" or "regular" or "non-senior"
        best_general_score = -1
        for idx, h in enumerate(header_lower):
            if idx == mapping["tenure_idx"]:
                continue
            score = 0
            if any(k in h for k in cls.GENERAL_RATE_KEYWORDS):
                score += 1
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
            score = 0
            if any(k in h for k in cls.SENIOR_RATE_KEYWORDS):
                score += 3
            if score > best_senior_score:
                best_senior_score = score
                mapping["senior_idx"] = idx

        return mapping

    @classmethod
    def parse_extracted_table(cls, table: List[List[str]]) -> List[Dict[str, Any]]:
        """
        Applies Level 2 column matching to parse a 2D matrix into a structured list of records.
        """
        if len(table) < 2:
            return []
            
        header = table[0]
        mapping = cls.match_headers(header)
        
        tenure_idx = mapping["tenure_idx"]
        general_idx = mapping["general_idx"]
        senior_idx = mapping["senior_idx"]
        
        # If we failed to find tenure or general rate, this table might not be the FD rate table
        if tenure_idx is None or general_idx is None:
            logger.warning("failed_to_match_table_headers", header=header)
            return []
            
        parsed_rows = []
        for r_idx in range(1, len(table)):
            row = table[r_idx]
            # Ensure index safety
            if len(row) <= max(tenure_idx, general_idx, senior_idx or 0):
                continue
                
            tenure_raw = row[tenure_idx].strip()
            general_raw = row[general_idx].strip()
            senior_raw = row[senior_idx].strip() if senior_idx is not None else ""
            
            if not tenure_raw or not general_raw:
                continue
                
            parsed_rows.append({
                "tenure_raw": tenure_raw,
                "general_raw": general_raw,
                "senior_raw": senior_raw or general_raw # Fallback senior citizen rate to general rate if omitted
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
