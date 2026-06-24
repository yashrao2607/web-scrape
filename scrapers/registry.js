import { HDFCScraper } from './hdfcScraper.js';
import { SBIScraper } from './sbiScraper.js';
import { ICICIScraper } from './iciciScraper.js';
import { AxisScraper } from './axisScraper.js';
import { KotakScraper } from './kotakScraper.js';
import { PNBScraper } from './pnbScraper.js';
import { IndusIndScraper } from './indusindScraper.js';
import { YesBankScraper } from './yesBankScraper.js';
import { IDFCFirstScraper } from './idfcFirstScraper.js';
import { IOBScraper } from './iobScraper.js';
import { SouthIndianBankScraper } from './southIndianBankScraper.js';
import { FederalBankScraper } from './federalBankScraper.js';
import { CanaraBankScraper } from './canaraBankScraper.js';
import { BankOfBarodaScraper } from './bankOfBarodaScraper.js';
import { BankOfIndiaScraper } from './bankOfIndiaScraper.js';
import { BankOfMaharashtraScraper } from './bankOfMaharashtraScraper.js';
import { RBLBankScraper } from './rblBankScraper.js';
import { IDBIBankScraper } from './idbiBankScraper.js';
import { IndianBankScraper } from './indianBankScraper.js';
import { CentralBankOfIndiaScraper } from './centralBankOfIndiaScraper.js';
import { BandhanBankScraper } from './bandhanBankScraper.js';
import { PNBHousingFinanceScraper } from './pnbHousingFinanceScraper.js';
import { KTDFCScraper } from './ktdfcScraper.js';
import { LICHousingFinanceScraper } from './licHousingFinanceScraper.js';
import { ShriramFinanceScraper } from './shriramFinanceScraper.js';

const SCRAPER_REGISTRY = {
  "HDFC Bank": HDFCScraper,
  "SBI": SBIScraper,
  "ICICI Bank": ICICIScraper,
  "Axis Bank": AxisScraper,
  "Kotak Mahindra Bank": KotakScraper,
  "PNB": PNBScraper,
  "IndusInd Bank": IndusIndScraper,
  "Yes Bank": YesBankScraper,
  "IDFC First Bank": IDFCFirstScraper,
  "Indian Overseas Bank": IOBScraper,
  "South Indian Bank": SouthIndianBankScraper,
  "Federal Bank": FederalBankScraper,
  "Canara Bank": CanaraBankScraper,
  "Bank of Baroda": BankOfBarodaScraper,
  "Bank of India": BankOfIndiaScraper,
  "Bank of Maharashtra": BankOfMaharashtraScraper,
  "RBL Bank": RBLBankScraper,
  "IDBI Bank": IDBIBankScraper,
  "Indian Bank": IndianBankScraper,
  "Central Bank of India": CentralBankOfIndiaScraper,
  "Bandhan Bank": BandhanBankScraper,
  "PNB Housing Finance": PNBHousingFinanceScraper,
  "KTDFC": KTDFCScraper,
  "LIC Housing Finance": LICHousingFinanceScraper,
  "Shriram Finance": ShriramFinanceScraper
};

export function getScraperForBank(bankName) {
  if (SCRAPER_REGISTRY[bankName]) {
    return SCRAPER_REGISTRY[bankName];
  }

  const nameLower = bankName.toLowerCase();
  for (const [name, scraperCls] of Object.entries(SCRAPER_REGISTRY)) {
    const registryNameLower = name.toLowerCase();
    if (registryNameLower.includes(nameLower) || nameLower.includes(registryNameLower)) {
      return scraperCls;
    }
  }

  return null;
}
