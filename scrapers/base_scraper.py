from abc import ABC, abstractmethod
from typing import Dict, Any, List
from datetime import datetime
import structlog
from pydantic import ValidationError
from core.validators import BankFDScheme, FDRateItem
from core.normalizer import parse_tenure, normalize_rate

logger = structlog.get_logger()

class BaseScraper(ABC):
    """
    Abstract base class for all bank-specific scrapers.
    Encapsulates raw extraction, post-processing validation, and normalization.
    """
    def __init__(self, bank_name: str, url: str):
        self.bank_name = bank_name
        self.url = url
        self.logger = logger.bind(bank=bank_name, url=url)

    @abstractmethod
    async def scrape(self, page: Any) -> Dict[str, Any]:
        """
        Executes the scraping process.
        Should return a raw dictionary with rate lines and metadata.
        This must be overridden by individual bank scrapers.
        """
        pass

    def process_and_validate(self, raw_data: Dict[str, Any], validation_errors: List[str]) -> BankFDScheme:
        """
        Normalizes extracted rate fields and runs validation schemas.
        Appends any structural failures to validation_errors list.
        """
        self.logger.info("processing_and_validating_raw_data")
        
        rates_raw = raw_data.get("fd_rates", [])
        validated_rates: List[FDRateItem] = []
        seen_tenures = set()

        for idx, item in enumerate(rates_raw):
            tenure_str = item.get("tenure_raw", "").strip()
            gen_rate_str = str(item.get("general_raw", "")).strip()
            sr_rate_str = str(item.get("senior_raw", "")).strip()

            if not tenure_str:
                msg = f"Row {idx}: Empty tenure string."
                validation_errors.append(msg)
                self.logger.warning("validation_warning", detail=msg)
                continue

            # Check for duplicate tenures in the same scrape
            if tenure_str in seen_tenures:
                msg = f"Row {idx}: Duplicate tenure raw string '{tenure_str}' detected."
                validation_errors.append(msg)
                self.logger.warning("validation_warning", detail=msg)
                continue
            seen_tenures.add(tenure_str)

            # Normalize rate values and assign consolidated tenure
            gen_rate = normalize_rate(gen_rate_str)
            sr_rate = normalize_rate(sr_rate_str) if sr_rate_str else gen_rate

            if gen_rate is None:
                msg = f"Row {idx} ({tenure_str}): Could not parse general rate '{gen_rate_str}'."
                validation_errors.append(msg)
                self.logger.warning("validation_warning", detail=msg)
                continue

            try:
                rate_item = FDRateItem(
                    tenure=tenure_str,
                    general_rate=gen_rate,
                    senior_citizen_rate=sr_rate if sr_rate is not None else gen_rate,
                    effective_from=raw_data.get("effective_from"),
                    effective_to=raw_data.get("effective_to"),
                    notes=item.get("notes")
                )
                validated_rates.append(rate_item)
            except ValidationError as e:
                for err in e.errors():
                    msg = f"Row {idx} ({tenure_str}): Field {err['loc'][0]} - {err['msg']}"
                    validation_errors.append(msg)
                    self.logger.warning("validation_warning", detail=msg)

        # Build full bank schema
        try:
            scheme = BankFDScheme(
                bank_name=self.bank_name,
                source_url=self.url,
                last_updated_on_page=raw_data.get("last_updated_on_page"),
                fd_rates=validated_rates,
                minimum_deposit=raw_data.get("minimum_deposit"),
                maximum_deposit=raw_data.get("maximum_deposit"),
                premature_withdrawal_available=raw_data.get("premature_withdrawal_available"),
                premature_withdrawal_penalty=raw_data.get("premature_withdrawal_penalty"),
                loan_against_fd_available=raw_data.get("loan_against_fd_available"),
                tax_saver_fd_available=raw_data.get("tax_saver_fd_available"),
                tax_saver_tenure=raw_data.get("tax_saver_tenure"),
                nomination_available=raw_data.get("nomination_available"),
                compounding_frequency=raw_data.get("compounding_frequency"),
                scraper_version=raw_data.get("scraper_version", "1.0.0")
            )
            return scheme
        except ValidationError as e:
            for err in e.errors():
                msg = f"Global model metadata validation: Field {err['loc'][0]} - {err['msg']}"
                validation_errors.append(msg)
                self.logger.error("validation_error", detail=msg)
            
            # Return a blank model with basic data
            return BankFDScheme(
                bank_name=self.bank_name,
                source_url=self.url,
                fd_rates=[]
            )
