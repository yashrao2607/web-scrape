import XLSX from 'xlsx';
import fs from 'fs';

const inputPath = process.argv[2] || 'output/results.json';
const outputPath = process.argv[3] || 'output/FD_Rates.xlsx';

const banks = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));

const wb = XLSX.utils.book_new();

for (const bank of banks) {
  const rows = (bank.rates || []).map(r => ({
    "Tenure": r.tenure,
    "General Rate (%)": r.interest_rate,
    "Senior Citizen Rate (%)": r.senior_citizen_interest_rate
  }));

  if (rows.length === 0) continue;

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 40 },
    { wch: 16 },
    { wch: 22 }
  ];
  XLSX.utils.book_append_sheet(wb, ws, bank.bank_name.slice(0, 31));
}

const totalRows = banks.reduce((s, b) => s + (b.rates?.length || 0), 0);
XLSX.writeFile(wb, outputPath);
console.log(`Excel written to ${outputPath} — ${banks.length} sheets, ${totalRows} total rows`);
