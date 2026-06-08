import os
import json
import structlog
from typing import List, Dict, Any

logger = structlog.get_logger()

class ChangeDetector:
    """
    Compares newly scraped data with the previously saved data
    and generates a detailed report identifying changes in interest rates,
    tenures, or policies.
    """
    
    @staticmethod
    def load_historical_data(filepath: str) -> List[Dict[str, Any]]:
        """Loads historical scrape results from results.json."""
        if not os.path.exists(filepath):
            logger.info("historical_data_not_found", path=filepath)
            return []
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
                elif isinstance(data, dict) and "banks" in data:
                    return data["banks"]
                return []
        except Exception as e:
            logger.error("failed_to_load_historical_data", path=filepath, error=str(e))
            return []

    @classmethod
    def detect_changes(cls, new_data: List[Dict[str, Any]], old_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Compares new scrape results with old ones and produces a change report.
        """
        logger.info("running_change_detection")
        old_banks = {b["bank_name"]: b for b in old_data}
        report = []

        for new_bank in new_data:
            bank_name = new_bank["bank_name"]
            
            # If the bank is brand new to the system
            if bank_name not in old_banks:
                report.append({
                    "bank": bank_name,
                    "changes_detected": True,
                    "event": "new_bank_added",
                    "rate_changes": [],
                    "metadata_changes": []
                })
                continue
                
            old_bank = old_banks[bank_name]
            changes_detected = False
            rate_changes = []
            metadata_changes = []

            # 1. Compare interest rates
            old_rates_map = {r["tenure"]: r for r in old_bank.get("fd_rates", [])}
            new_rates_map = {r["tenure"]: r for r in new_bank.get("fd_rates", [])}

            # Check for rate updates and added tenures
            for tenure, new_item in new_rates_map.items():
                new_gen_rate = new_item.get("general_rate")
                new_sr_rate = new_item.get("senior_citizen_rate")

                if tenure not in old_rates_map:
                    # New tenure range added
                    rate_changes.append({
                        "tenure": tenure,
                        "change_type": "added",
                        "old_general_rate": None,
                        "new_general_rate": new_gen_rate,
                        "old_senior_rate": None,
                        "new_senior_rate": new_sr_rate
                    })
                    changes_detected = True
                else:
                    old_item = old_rates_map[tenure]
                    old_gen_rate = old_item.get("general_rate")
                    old_sr_rate = old_item.get("senior_citizen_rate")

                    if old_gen_rate != new_gen_rate or old_sr_rate != new_sr_rate:
                        rate_changes.append({
                            "tenure": tenure,
                            "change_type": "rate_changed",
                            "old_general_rate": old_gen_rate,
                            "new_general_rate": new_gen_rate,
                            "old_senior_rate": old_sr_rate,
                            "new_senior_rate": new_sr_rate
                        })
                        changes_detected = True

            # Check for removed tenures
            for tenure in old_rates_map:
                if tenure not in new_rates_map:
                    old_item = old_rates_map[tenure]
                    rate_changes.append({
                        "tenure": tenure,
                        "change_type": "removed",
                        "old_general_rate": old_item.get("general_rate"),
                        "new_general_rate": None,
                        "old_senior_rate": old_item.get("senior_citizen_rate"),
                        "new_senior_rate": None
                    })
                    changes_detected = True

            # 2. Compare metadata policies
            metadata_fields = [
                "minimum_deposit",
                "maximum_deposit",
                "premature_withdrawal_available",
                "premature_withdrawal_penalty",
                "loan_against_fd_available",
                "tax_saver_fd_available",
                "tax_saver_tenure",
                "nomination_available",
                "compounding_frequency"
            ]

            for field in metadata_fields:
                old_val = old_bank.get(field)
                new_val = new_bank.get(field)
                if old_val != new_val:
                    metadata_changes.append({
                        "field": field,
                        "old_value": old_val,
                        "new_value": new_val
                    })
                    changes_detected = True

            if changes_detected:
                report.append({
                    "bank": bank_name,
                    "changes_detected": True,
                    "rate_changes": rate_changes,
                    "metadata_changes": metadata_changes
                })
            else:
                report.append({
                    "bank": bank_name,
                    "changes_detected": False,
                    "rate_changes": [],
                    "metadata_changes": []
                })

        return report
