import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

const INPUT_EXCEL_PATH = "input/banks.xlsx";
const UNDERSTAND_PATH = "UNDERSTAND.md";

// Map URLs to Bank Names
const URL_TO_BANK_NAME = {
  "https://www.canarabank.bank.in/pages/deposit-interest-rates": "Canara Bank",
  "https://www.bankbazaar.com/fixed-deposit/bank-of-baroda-fixed-deposit-rate.html": "Bank of Baroda",
  "https://www.bankbazaar.com/fixed-deposit/bank-of-india-fixed-deposit-rate.html": "Bank of India",
  "https://www.bankbazaar.com/fixed-deposit/bank-of-maharashtra-fixed-deposit-rate.html": "Bank of Maharashtra",
  "https://www.bankbazaar.com/fixed-deposit/rbl-bank-fixed-deposit-rate.html": "RBL Bank",
  "https://www.bankbazaar.com/fixed-deposit/idbi-fixed-deposit-rate.html": "IDBI Bank",
  "https://www.bankbazaar.com/fixed-deposit/indian-bank-fixed-deposit-rate.html": "Indian Bank",
  "https://www.bankbazaar.com/fixed-deposit/central-bank-of-india-fixed-deposit-rate.html": "Central Bank of India",
  "https://www.bankbazaar.com/fixed-deposit/bandhan-bank-fixed-deposit-rate.html": "Bandhan Bank",
  "https://www.bankbazaar.com/fixed-deposit/pnbhfl-fixed-deposit-rate.html": "PNB Housing Finance",
  "https://www.bankbazaar.com/fixed-deposit/ktdfc-fixed-deposit-rate.html": "KTDFC",
  "https://www.bankbazaar.com/fixed-deposit/lic-housing-fixed-deposit-rate.html": "LIC Housing Finance",
  "https://www.bankbazaar.com/fixed-deposit/shriram-finance-fixed-deposit-rate.html": "Shriram Finance"
};

function extractUrlsFromMarkdown(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  // Regular expression to match URLs
  const urlRegex = /https?:\/\/[^\s\)]+/g;
  const urls = [];
  let match;
  while ((match = urlRegex.exec(content)) !== null) {
    // Clean up any trailing periods or punctuation that might be captured
    let url = match[0];
    if (url.endsWith('.') || url.endsWith(',')) {
      url = url.slice(0, -1);
    }
    urls.push(url);
  }
  return urls;
}

function updateExcel() {
  console.log("Extracting URLs from UNDERSTAND.md...");
  const urls = extractUrlsFromMarkdown(UNDERSTAND_PATH);
  console.log(`Found ${urls.length} URLs in ${UNDERSTAND_PATH}:`, urls);

  // Read existing banks from Excel
  let existingBanks = [];
  if (fs.existsSync(INPUT_EXCEL_PATH)) {
    console.log(`Reading existing entries from ${INPUT_EXCEL_PATH}...`);
    const workbook = XLSX.readFile(INPUT_EXCEL_PATH);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    existingBanks = XLSX.utils.sheet_to_json(worksheet);
    console.log(`Found ${existingBanks.length} existing banks in Excel.`);
  } else {
    console.log(`${INPUT_EXCEL_PATH} does not exist yet. It will be initialized.`);
  }

  // Create a map/set of existing URLs to avoid duplicates
  const existingUrls = new Set(existingBanks.map(b => b["FD URL"]));

  const newEntries = [];
  for (const url of urls) {
    if (existingUrls.has(url)) {
      console.log(`URL already exists in Excel: ${url}`);
      continue;
    }

    const bankName = URL_TO_BANK_NAME[url] || "Unknown Bank";
    newEntries.push({
      "Bank Name": bankName,
      "FD URL": url
    });
    console.log(`Prepared new entry: ${bankName} -> ${url}`);
  }

  if (newEntries.length === 0) {
    console.log("No new URLs to add.");
    return;
  }

  const updatedBanks = [...existingBanks, ...newEntries];
  console.log(`Saving ${updatedBanks.length} total entries to ${INPUT_EXCEL_PATH}...`);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(updatedBanks, { header: ["Bank Name", "FD URL"] });
  XLSX.utils.book_append_sheet(wb, ws, "Banks");
  XLSX.writeFile(wb, INPUT_EXCEL_PATH);
  console.log("Excel file successfully updated!");
}

updateExcel();
