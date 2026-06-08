import pytest
from pydantic import ValidationError
from core.validators import FDRateItem, BankFDScheme

def test_rate_item_validation_success():
    item = FDRateItem(
        tenure="1 Year",
        general_rate=7.25,
        senior_citizen_rate=7.75
    )
    assert item.general_rate == 7.25
    assert item.senior_citizen_rate == 7.75

def test_rate_item_validation_failure():
    with pytest.raises(ValidationError):
        # general rate above 20%
        FDRateItem(
            tenure="1 Year",
            general_rate=22.0,
            senior_citizen_rate=7.75
        )

    with pytest.raises(ValidationError):
        # negative rate
        FDRateItem(
            tenure="1 Year",
            general_rate=-1.0,
            senior_citizen_rate=7.75
        )

def test_bank_fd_scheme_quality_score():
    # Full dataset should have score close to 1.0
    scheme = BankFDScheme(
        bank_name="Test Bank",
        source_url="http://test.com",
        last_updated_on_page="2026-06-08",
        minimum_deposit=1000.0,
        premature_withdrawal_available=True,
        loan_against_fd_available=True,
        tax_saver_fd_available=True,
        nomination_available=True,
        compounding_frequency="Quarterly",
        fd_rates=[
            FDRateItem(tenure="1 Year", general_rate=7.0, senior_citizen_rate=7.5)
        ]
    )
    assert scheme.data_quality_score == 1.0

    # Missing metadata fields should reduce the quality score
    sparse_scheme = BankFDScheme(
        bank_name="Sparse Bank",
        source_url="http://test.com",
        fd_rates=[]
    )
    # 0.5 reduction for no rates, and 0.05 * 7 = 0.35 reduction for missing metadata fields. Total score = 0.15
    assert sparse_scheme.data_quality_score == 0.15
