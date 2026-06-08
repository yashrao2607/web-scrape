from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field, field_validator, model_validator

class FDRateItem(BaseModel):
    """
    Pydantic model representing a single fixed deposit rate row.
    """
    tenure: str = Field(..., description="The parsed tenure string (e.g. '3 Years 1 Day to 5 Years').")
    general_rate: float = Field(..., description="Interest rate for general public in percentage.")
    senior_citizen_rate: float = Field(..., description="Interest rate for senior citizens in percentage.")
    effective_from: Optional[str] = Field(None, description="The date from which the rate is effective.")
    effective_to: Optional[str] = Field(None, description="The date until which the rate is effective.")
    notes: Optional[str] = Field(None, description="Any footnotes or tenure-specific terms.")

    @field_validator("general_rate", "senior_citizen_rate")
    @classmethod
    def validate_rate(cls, v: float, info) -> float:
        """Ensure interest rate is between 0% and 20%."""
        if not (0.0 <= v <= 20.0):
            raise ValueError(f"{info.field_name} must be between 0.0 and 20.0 (got {v})")
        return round(v, 4)


class BankFDScheme(BaseModel):
    """
    Pydantic model representing the full fixed deposit data schema for a bank.
    """
    bank_name: str = Field(..., description="Name of the bank.")
    source_url: str = Field(..., description="URL from which the data was scraped.")
    scraped_at: str = Field(
        default_factory=lambda: datetime.utcnow().isoformat() + "Z",
        description="ISO timestamp of when the scraping occurred."
    )
    last_updated_on_page: Optional[str] = Field(None, description="Date the rates page was last updated.")

    fd_rates: List[FDRateItem] = Field(default_factory=list, description="List of extracted tenure-rate mappings.")

    minimum_deposit: Optional[float] = Field(None, description="Minimum deposit required to get these rates.")
    maximum_deposit: Optional[float] = Field(None, description="Maximum deposit limit for these rates.")

    premature_withdrawal_available: Optional[bool] = Field(None, description="Whether premature withdrawal is allowed.")
    premature_withdrawal_penalty: Optional[str] = Field(None, description="Penalty details for premature withdrawal.")

    loan_against_fd_available: Optional[bool] = Field(None, description="Whether loans can be availed against the FD.")

    tax_saver_fd_available: Optional[bool] = Field(None, description="Whether tax-saving FDs are offered.")
    tax_saver_tenure: Optional[str] = Field(None, description="Standard tenure for tax saver FDs (usually 5 years).")

    nomination_available: Optional[bool] = Field(None, description="Whether nomination facility is available.")

    compounding_frequency: Optional[str] = Field(None, description="Compounding frequency (e.g., quarterly, monthly, at maturity).")

    data_quality_score: float = Field(0.0, description="Confidence metric of the scraped data quality.")
    scraper_version: str = Field("1.0.0", description="Version of the scraper implementation.")

    @model_validator(mode="after")
    def calculate_quality_score(self) -> 'BankFDScheme':
        """
        Dynamically calculates a data quality score between 0.0 and 1.0.
        Score decreases based on missing fields, empty rates, or lack of senior citizen rates.
        """
        score = 1.0
        
        # Check rates
        if not self.fd_rates:
            score -= 0.5
        else:
            # Check for anomalies or empty tenures
            unresolved_tenures = sum(
                1 for r in self.fd_rates 
                if not r.tenure.strip()
            )
            if unresolved_tenures > 0:
                score -= 0.15 * (unresolved_tenures / len(self.fd_rates))

        # Check other key metadata
        missing_metadata_weights = {
            "last_updated_on_page": 0.05,
            "minimum_deposit": 0.05,
            "premature_withdrawal_available": 0.05,
            "loan_against_fd_available": 0.05,
            "tax_saver_fd_available": 0.05,
            "nomination_available": 0.05,
            "compounding_frequency": 0.05,
        }

        for attr, weight in missing_metadata_weights.items():
            if getattr(self, attr) is None:
                score -= weight

        self.data_quality_score = max(0.0, round(score, 2))
        return self
