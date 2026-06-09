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

const SCRAPER_REGISTRY = {
  "HDFC Bank": HDFCScraper,
  "SBI": SBIScraper,
  "ICICI Bank": ICICIScraper,
  "Axis Bank": AxisScraper,
  "Kotak Mahindra Bank": KotakScraper,
  "PNB": PNBScraper,
  "IndusInd Bank": IndusIndScraper,
  "Yes Bank": YesBankScraper,
  "IDFC": IDFCFirstScraper,
  "Indian Overseas Bank": IOBScraper,
  "South Indian bank": SouthIndianBankScraper,
  "Federal bank": FederalBankScraper
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
