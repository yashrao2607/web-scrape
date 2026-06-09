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
        
        from core.normalizer import parse_tenure_range, classify_fd_product
        
        rates_raw = raw_data.get("fd_rates", [])
        validated_rates: List[FDRateItem] = []
        seen_keys = set()
        
        duplicate_count = 0
        anomaly_count = 0
        
        # Collect first available rate effective date from rows
        effective_date = raw_data.get("effective_from") or raw_data.get("rate_effective_date")

        for idx, item in enumerate(rates_raw):
            tenure_str = item.get("tenure_raw", "").strip()
            gen_rate_str = str(item.get("general_raw", "")).strip()
            sr_rate_str = str(item.get("senior_raw", "")).strip()
            
            section_name = item.get("section_name", "")
            table_name = item.get("table_name", "")
            row_effective_date = item.get("rate_effective_date")
            
            if row_effective_date and not effective_date:
                effective_date = row_effective_date

            if not tenure_str:
                msg = f"Row {idx}: Empty tenure string."
                validation_errors.append(msg)
                self.logger.warning("validation_warning", detail=msg)
                continue

            # Parse tenure to validate
            days, months, years = parse_tenure(tenure_str)
            if days is None:
                msg = f"Row {idx} ({tenure_str}): Rejected due to invalid/unparseable tenure."
                validation_errors.append(msg)
                self.logger.warning("row_rejected", detail=msg)
                continue

            # Normalize rate values
            gen_rate = normalize_rate(gen_rate_str)
            sr_rate = normalize_rate(sr_rate_str) if sr_rate_str else gen_rate

            if gen_rate is None:
                msg = f"Row {idx} ({tenure_str}): Could not parse general rate '{gen_rate_str}'."
                validation_errors.append(msg)
                self.logger.warning("validation_warning", detail=msg)
                continue

            # Classify context
            classified = classify_fd_product(section_name, table_name, tenure_str)
            
            # Outlier / Anomaly Detection
            if gen_rate < 2.0 or gen_rate > 12.0:
                anomaly_count += 1
                self.logger.warning("rate_anomaly_detected", rate=gen_rate, tenure=tenure_str)
                
            # Reject row rule: rate < 2.0 for retail FD datasets
            if gen_rate < 2.0 and classified["product_type"] == "retail_fd":
                msg = f"Row {idx} ({tenure_str}): Rejected retail rate {gen_rate}% below 2.0%."
                validation_errors.append(msg)
                self.logger.warning("row_rejected", detail=msg)
                continue
                
            # Parse tenure bounds
            min_days, max_days = parse_tenure_range(tenure_str)
            
            if min_days is not None and max_days is not None and min_days > max_days:
                msg = f"Row {idx} ({tenure_str}): Rejected due to range boundary inversion (min_days {min_days} > max_days {max_days})."
                validation_errors.append(msg)
                self.logger.warning("row_rejected", detail=msg)
                continue
                
            # Check for duplicate tenures based on compound key
            normalized_tenure_str = f"{min_days}-{max_days}" if min_days is not None else tenure_str
            compound_key = (self.bank_name, normalized_tenure_str, classified["product_type"], section_name)
            if compound_key in seen_keys:
                duplicate_count += 1
                msg = f"Row {idx}: Duplicate tenure '{tenure_str}' for product {classified['product_type']} in section '{section_name}'."
                validation_errors.append(msg)
                self.logger.warning("validation_warning", detail=msg)
                continue
            seen_keys.add(compound_key)

            try:
                rate_item = FDRateItem(
                    tenure=tenure_str,
                    general_rate=gen_rate,
                    senior_citizen_rate=sr_rate if sr_rate is not None else gen_rate,
                    effective_from=row_effective_date or effective_date,
                    effective_to=item.get("effective_to") or raw_data.get("effective_to"),
                    notes=item.get("notes"),
                    product_type=classified["product_type"],
                    deposit_category=classified["deposit_category"],
                    customer_segment=classified["customer_segment"],
                    callable=classified["callable"],
                    scheme_type=classified["scheme_type"],
                    scheme_name=classified["scheme_name"],
                    section_name=section_name,
                    table_name=table_name,
                    min_days=min_days,
                    max_days=max_days
                )
                validated_rates.append(rate_item)
            except ValidationError as e:
                for err in e.errors():
                    msg = f"Row {idx} ({tenure_str}): Field {err['loc'][0]} - {err['msg']}"
                    validation_errors.append(msg)
                    self.logger.warning("validation_warning", detail=msg)

        # Group rates to detect interval overlaps (e.g., current.max_days >= next.min_days)
        from collections import defaultdict
        groups = defaultdict(list)
        for r in validated_rates:
            if r.scheme_type == "regular_fd" and r.min_days is not None and r.max_days is not None:
                g_key = (r.product_type, r.deposit_category, r.customer_segment, r.callable)
                groups[g_key].append(r)
                
        for g_key, g_rates in groups.items():
            g_rates.sort(key=lambda x: x.min_days)
            for i in range(len(g_rates) - 1):
                curr = g_rates[i]
                nxt = g_rates[i+1]
                if curr.max_days >= nxt.min_days:
                    anomaly_count += 1
                    msg = f"Interval overlap detected: '{curr.tenure}' (max_days {curr.max_days}) overlaps with '{nxt.tenure}' (min_days {nxt.min_days}) for group {g_key}."
                    validation_errors.append(msg)
                    self.logger.warning("interval_overlap_warning", detail=msg)

        # Scrape source confidence calculation
        if not validated_rates:
            scrape_confidence = 0.0
        else:
            base_confidence = 1.0
            if raw_data.get("fallback_used") or raw_data.get("is_fallback"):
                base_confidence = 0.5
            elif raw_data.get("unstructured_fallback_used"):
                base_confidence = 0.4
            elif self.url.lower().endswith(".pdf"):
                base_confidence = 0.85

            scrape_confidence = max(0.1, round(base_confidence - (duplicate_count * 0.02) - (anomaly_count * 0.05), 2))

        # Build full bank schema
        try:
            scheme = BankFDScheme(
                bank_name=self.bank_name,
                source_url=self.url,
                rate_effective_date=effective_date or raw_data.get("rate_effective_date"),
                page_last_updated=raw_data.get("last_updated_on_page") or effective_date,
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
                scrape_confidence=scrape_confidence,
                duplicate_count=duplicate_count,
                anomaly_count=anomaly_count,
                scraper_version=raw_data.get("scraper_version", "1.0.0")
            )
            return scheme
        except ValidationError as e:
            for err in e.errors():
                msg = f"Global model metadata validation: Field {err['loc'][0]} - {err['msg']}"
                validation_errors.append(msg)
                self.logger.error("validation_error", detail=msg)
            
            return BankFDScheme(
                bank_name=self.bank_name,
                source_url=self.url,
                fd_rates=[]
            )
