import pdfplumber
import tempfile
import sys
from core.normalizer import parse_tenure
from core.extractor import LayeredExtractor

def run_test():
    sys.stdout.reconfigure(encoding='utf-8')
    temp_pdf = f"{tempfile.gettempdir()}/axis_rates_debug.pdf"
    
    with pdfplumber.open(temp_pdf) as pdf:
        page = pdf.pages[0]
        tables = page.extract_tables()
        t = tables[0]
        
        # Clean table cell strings
        cleaned_table = []
        for row in t:
            cleaned_table.append([cell.strip().replace("\xa0", " ") if cell else "" for cell in row])
            
        # Determine max columns
        num_cols = max(len(row) for row in cleaned_table) if cleaned_table else 0
        
        # Pad every row to num_cols
        padded_table = []
        for row in cleaned_table:
            padded_row = list(row)
            while len(padded_row) < num_cols:
                padded_row.append("")
            padded_table.append(padded_row)
            
        # 1. Identify first data row and column
        first_data_idx = -1
        detected_tenure_col = None
        for idx, row in enumerate(padded_table):
            if len(row) >= 2:
                for col_idx, cell in enumerate(row[:3]):
                    # Check cell length and exclude note/disclaimer text
                    if len(cell) < 50 and not any(cell.lower().startswith(x) for x in ["note", "disclaimer", "effective", "interest", "table", "rates", "*"]):
                        days, _, _ = parse_tenure(cell)
                        if days is not None:
                            first_data_idx = idx
                            detected_tenure_col = col_idx
                            break
            if first_data_idx != -1:
                break
                
        print("first_data_idx:", first_data_idx)
        print("detected_tenure_col:", detected_tenure_col)
        
        header_rows = padded_table[:first_data_idx]
        data_rows = padded_table[first_data_idx:]
        
        # Filter header rows
        filtered_header_rows = []
        for hr in header_rows:
            non_empty = [c for c in hr if c]
            if len(set(non_empty)) >= 2:
                filtered_header_rows.append(hr)
                
        print("Filtered header rows count:", len(filtered_header_rows))
        
        # Forward fill
        filled_header_rows = []
        for hr in filtered_header_rows:
            filled_row = []
            current_val = ""
            for cell in hr:
                if cell:
                    current_val = cell
                filled_row.append(current_val)
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
            
        print("Flattened Header:")
        for col_idx, h in enumerate(flattened_header):
            print(f"  Col {col_idx}: {h!r}")
            
        mapping = LayeredExtractor.match_headers(flattened_header)
        print("Mapping from match_headers:", mapping)
        
        tenure_idx = detected_tenure_col if detected_tenure_col is not None else mapping["tenure_idx"]
        general_idx = mapping["general_idx"]
        senior_idx = mapping["senior_idx"]
        
        print(f"Final Indices: tenure_idx={tenure_idx}, general_idx={general_idx}, senior_idx={senior_idx}")
        
        parsed_rows = []
        for r_idx, row in enumerate(data_rows):
            if len(row) <= max(tenure_idx or 0, general_idx or 0, senior_idx or 0):
                continue
            tenure_raw = row[tenure_idx].strip()
            general_raw = row[general_idx].strip()
            senior_raw = row[senior_idx].strip() if senior_idx is not None else ""
            if not tenure_raw or any(k == tenure_raw.lower() for k in LayeredExtractor.TENURE_KEYWORDS):
                continue
            if not general_raw or general_raw.lower() in ["-", "nil", "n.a.", "na"]:
                continue
            parsed_rows.append({
                "tenure_raw": tenure_raw,
                "general_raw": general_raw,
                "senior_raw": senior_raw or general_raw
            })
            
        print("Total parsed rows for Axis:", len(parsed_rows))
        for pr in parsed_rows[:5]:
            print("  Parsed row:", pr)

if __name__ == "__main__":
    run_test()
