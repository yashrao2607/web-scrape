import pdfplumber
import tempfile
import sys

def parse():
    sys.stdout.reconfigure(encoding='utf-8')
    temp_pdf = f"{tempfile.gettempdir()}/axis_rates_debug.pdf"
    
    with pdfplumber.open(temp_pdf) as pdf:
        page = pdf.pages[0]
        tables = page.extract_tables()
        if not tables:
            print("No tables found on Page 1!")
            return
            
        table = tables[0]
        print(f"Table rows: {len(table)}")
        for idx, row in enumerate(table):
            print(f"Row {idx+1}: {row}")
            
if __name__ == "__main__":
    parse()
