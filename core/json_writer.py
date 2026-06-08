import os
import json
import structlog
from typing import Any, Dict, List

logger = structlog.get_logger()

class JsonWriter:
    """
    Handles file writing operations for output results, change reports,
    and validation reports, ensuring proper directories exist.
    """
    
    @staticmethod
    def write_json(data: Any, filepath: str) -> None:
        """
        Writes data to a target JSON file, creating parent directories
        if they do not exist.
        """
        dir_name = os.path.dirname(filepath)
        if dir_name:
            os.makedirs(dir_name, exist_ok=True)
            
        try:
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            logger.info("file_write_success", path=filepath)
        except Exception as e:
            logger.error("file_write_failed", path=filepath, error=str(e))
            raise

    @classmethod
    def generate_validation_report(cls, validation_records: Dict[str, List[str]], filepath: str) -> None:
        """
        Formats and writes a validation report listing warnings, errors,
        or data quality issues for each bank scraper.
        """
        report = {
            "validation_summary": {
                "total_banks_checked": len(validation_records),
                "banks_with_issues": sum(1 for errors in validation_records.values() if errors)
            },
            "failures_and_warnings": validation_records
        }
        cls.write_json(report, filepath)
