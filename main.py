import os
import asyncio
import pandas as pd
import structlog
import sys
from datetime import datetime
from typing import Dict, Any, List, Optional

# Configure structlog to output to stdout as JSON
log_accumulator = []

def accumulate_logs(logger, name, event_dict):
    event_dict["timestamp"] = datetime.utcnow().isoformat() + "Z"
    log_accumulator.append(event_dict.copy())
    return event_dict

structlog.configure(
    processors=[
        structlog.processors.add_log_level,
        accumulate_logs,
        structlog.processors.JSONRenderer()
    ]
)

logger = structlog.get_logger()

# Import core modules
from core.browser import PlaywrightBrowserManager
from core.validators import BankFDScheme
from core.change_detector import ChangeDetector
from core.json_writer import JsonWriter
from scrapers.registry import get_scraper_for_bank

# Settings
CONCURRENCY_LIMIT = 5
INPUT_EXCEL_PATH = "input/banks.xlsx"
OUTPUT_RESULTS_PATH = "output/results.json"
OUTPUT_CHANGES_PATH = "output/change_report.json"
OUTPUT_VALIDATION_PATH = "output/validation_report.json"
OUTPUT_LOG_PATH = "output/scrape_log.json"

async def scrape_bank_task(
    bank_name: str, 
    url: str, 
    browser_manager: PlaywrightBrowserManager, 
    sem: asyncio.Semaphore,
    validation_records: Dict[str, List[str]]
) -> Optional[Dict[str, Any]]:
    """
    Worker task that scrapes a single bank within concurrency limits.
    """
    async with sem:
        logger.info("scraping_bank_start", bank=bank_name, url=url)
        scraper_cls = get_scraper_for_bank(bank_name)
        
        if not scraper_cls:
            error_msg = f"No scraper registered for bank '{bank_name}'."
            validation_records[bank_name] = [error_msg]
            logger.error("scraper_not_found", bank=bank_name, error_reason=error_msg)
            return {
                "bank_name": bank_name,
                "source_url": url,
                "status": "FAILED",
                "error_reason": error_msg
            }
            
        page = None
        try:
            page = await browser_manager.get_page()
            # Navigate using page.goto
            try:
                await browser_manager.navigate_to(page, url)
            except Exception as nav_err:
                logger.warning("navigation_failed_attempting_scraper_fallback", bank=bank_name, error=str(nav_err))
            
            # Instantiate scraper and run
            scraper = scraper_cls(bank_name, url)
            raw_data = await scraper.scrape(page)
            
            # Process, parse, and validate
            errors: List[str] = []
            validated_scheme = scraper.process_and_validate(raw_data, errors)
            
            validation_records[bank_name] = errors
            
            scheme_dict = validated_scheme.model_dump()
            scheme_dict["status"] = "SUCCESS"
            return scheme_dict
            
        except Exception as e:
            error_msg = f"Scraping failed with exception: {str(e)}"
            validation_records[bank_name] = [error_msg]
            logger.error("scraping_bank_failed", bank=bank_name, error_reason=error_msg)
            return {
                "bank_name": bank_name,
                "source_url": url,
                "status": "FAILED",
                "error_reason": error_msg
            }
        finally:
            if page:
                try:
                    await page.close()
                except Exception:
                    pass

async def main():
    logger.info("starting_scraping_pipeline")
    
    # 1. Create or refresh input file containing all 12 banks
    os.makedirs(os.path.dirname(INPUT_EXCEL_PATH), exist_ok=True)
    df = pd.DataFrame([
        {"Bank Name": "HDFC Bank", "FD URL": "https://www.hdfcbank.com/personal/save/deposits/fixed-deposit-interest-rates"},
        {"Bank Name": "SBI", "FD URL": "https://sbi.co.in/web/interest-rates/deposit-rates/retail-domestic-term-deposits"},
        {"Bank Name": "ICICI Bank", "FD URL": "https://www.icicibank.com/personal-banking/deposits/fixed-deposit/fd-interest-rates"},
        {"Bank Name": "Axis Bank", "FD URL": "https://www.axis.bank.in/docs/default-source/default-document-library/interest-rates/domestic-fixed-deposits-06-june-26.pdf?sfvrsn=5eb4a7d0_1"},
        {"Bank Name": "Kotak Mahindra Bank", "FD URL": "https://www.kotak.com/en/rates/interest-rates.html"},
        {"Bank Name": "PNB", "FD URL": "https://www.pnbindia.in/interest-rates-deposit.html"},
        {"Bank Name": "IndusInd Bank", "FD URL": "https://www.indusind.bank.in/in/en/personal/rates.html"},
        {"Bank Name": "Yes Bank", "FD URL": "https://www.yes.bank.in/personal-banking/yes-individual/deposits/fixed-deposit"},
        {"Bank Name": "IDFC First Bank", "FD URL": "https://www.idfcfirstbank.com/personal-banking/deposits/fixed-deposit/fd-interest-rates"},
        {"Bank Name": "Indian Overseas Bank", "FD URL": "https://www.iob.bank.in/en/domestic-nro-nre-retail-term-deposit-rates"},
        {"Bank Name": "South Indian Bank", "FD URL": "https://www.southindianbank.com/interestrates/interestrates.aspx"},
        {"Bank Name": "Federal Bank", "FD URL": "https://www.federalbank.co.in/interest-rates"}
    ])
    df.to_excel(INPUT_EXCEL_PATH, index=False)
    logger.info("initialized_input_excel_with_12_banks", path=INPUT_EXCEL_PATH)

    # 2. Read banks from Excel
    try:
        df_banks = pd.read_excel(INPUT_EXCEL_PATH)
        required_columns = ["Bank Name", "FD URL"]
        if not all(col in df_banks.columns for col in required_columns):
            logger.critical("invalid_excel_schema", expected=required_columns, found=list(df_banks.columns))
            sys.exit(1)
    except Exception as e:
        logger.critical("failed_to_read_input_excel", error=str(e))
        sys.exit(1)

    banks_list = df_banks.to_dict("records")
    logger.info("loaded_banks_from_excel", count=len(banks_list))

    # 3. Setup browser and concurrency
    browser_manager = PlaywrightBrowserManager(headless=True)
    sem = asyncio.Semaphore(CONCURRENCY_LIMIT)
    
    validation_records: Dict[str, List[str]] = {}
    
    # Start browser context
    await browser_manager.start()
    
    tasks = []
    for bank_info in banks_list:
        bank_name = bank_info.get("Bank Name")
        url = bank_info.get("FD URL")
        if not bank_name or not url:
            continue
        tasks.append(
            scrape_bank_task(bank_name, url, browser_manager, sem, validation_records)
        )
        
    # Run scrapers concurrently
    results = await asyncio.gather(*tasks)
    
    # Close browser
    await browser_manager.close()
    
    # 4. Filter and process output schemas
    successful_results = []
    for r in results:
        if r and r.get("status") == "SUCCESS":
            successful_results.append(r)
            
    # Save results.json
    JsonWriter.write_json(successful_results, OUTPUT_RESULTS_PATH)
    
    # 5. Run Change Detection
    old_data = ChangeDetector.load_historical_data(OUTPUT_RESULTS_PATH)
    changes = ChangeDetector.detect_changes(successful_results, old_data)
    JsonWriter.write_json(changes, OUTPUT_CHANGES_PATH)
    
    # 6. Save Validation Report
    JsonWriter.generate_validation_report(validation_records, OUTPUT_VALIDATION_PATH)
    
    logger.info("scraping_pipeline_complete", successful=len(successful_results), total=len(banks_list))
    
    # 7. Write accumulated structured logs to scrape_log.json
    JsonWriter.write_json(log_accumulator, OUTPUT_LOG_PATH)

if __name__ == "__main__":
    asyncio.run(main())
