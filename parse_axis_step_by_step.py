import pdfplumber
import tempfile
import sys
from core.extractor import LayeredExtractor

def test():
    sys.stdout.reconfigure(encoding='utf-8')
    temp_pdf = f"{tempfile.gettempdir()}/axis_rates_debug.pdf"
    
    with pdfplumber.open(temp_pdf) as pdf:
        page = pdf.pages[0]
        tables = page.extract_tables()
        table = tables[0]
        
        # We need to clean cell values just like LayeredExtractor.parse_extracted_table does
        cleaned_table = []
        for row in table:
            cleaned_row = [cell.strip().replace("\n", " ") if cell else "" for cell in row]
            if any(cleaned_row):
                cleaned_table.append(cleaned_row)
                
        print("Cleaned table length:", len(cleaned_table))
        
        # Let's run LayeredExtractor.parse_extracted_table logic step-by-step
        from core.normalizer import parse_tenure
        first_data_idx = -1
        for idx, row in enumerate(cleaned_table):
            if len(row) >= 2:
                # Check first 3 cells to see if one is parsed as tenure
                for cell in row[:3]:
                    days, _, _ = parse_tenure(cell)
                    if days is not None:
                        first_data_idx = idx
                        break
            if first_data_idx != -1:
                break
        print("first_data_idx:", first_data_idx)
        
        header_rows = cleaned_table[:first_data_idx]
        data_rows = cleaned_table[first_data_idx:]
        print("Header rows count:", len(header_rows))
        
        filtered_header_rows = []
        for hr in header_rows:
            non_empty = [c for c in hr if c]
            if len(set(non_empty)) >= 2:
                filtered_header_rows.append(hr)
        print("Filtered header rows count:", len(filtered_header_rows))
        for hr in filtered_header_rows:
            print("  Filtered HR:", hr)
            
        num_cols = len(cleaned_table[0])
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
        print("Mapping:", mapping)
        
        # Let's print out the match results of LayeredExtractor.parse_extracted_table
        res = LayeredExtractor.parse_extracted_table(table)
        print("Parsed rows count:", len(res))
        if res:
            print("First 3 parsed rows:", res[:3])

if __name__ == "__main__":
    test()
