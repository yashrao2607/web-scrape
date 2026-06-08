import re
from typing import Tuple, Optional

# Regex patterns for matching numbers and units
DAYS_PATTERNS = [re.compile(r"(\d+)\s*d(ay)?s?", re.IGNORECASE)]
MONTHS_PATTERNS = [re.compile(r"(\d+)\s*m(onth)?s?", re.IGNORECASE)]
YEARS_PATTERNS = [re.compile(r"(\d+)\s*y(ear)?s?", re.IGNORECASE)]

def parse_tenure(tenure_str: str) -> Tuple[Optional[float], Optional[float], Optional[float]]:
    """
    Parses a tenure string (e.g. '7 Days', '1 Year 6 Months', '12 to 24 Months')
    and returns a tuple of (days, months, years).
    
    If it is a range (e.g., '46 days to 179 days'), we parse the lower bound as the starting point.
    """
    if not tenure_str:
        return None, None, None

    # Clean the string
    cleaned = tenure_str.strip()

    # If it's a range like "12 to 24 Months", extract the first range component
    # Let's split on common range delimiters: "to", "-", "less than"
    # Example: "1 Year to 15 Months" -> Split to "1 Year" and "15 Months"
    parts = re.split(r'\b(?:to|less\s+than|-)\b', cleaned, flags=re.IGNORECASE)
    primary_part = parts[0].strip()

    total_days = 0.0
    total_months = 0.0
    total_years = 0.0

    found_any = False

    # Extract years
    for pattern in YEARS_PATTERNS:
        match = pattern.search(primary_part)
        if match:
            years = float(match.group(1))
            total_years += years
            total_months += years * 12.0
            total_days += years * 365.0
            found_any = True
            # Remove from string to prevent double matching
            primary_part = pattern.sub("", primary_part)

    # Extract months
    for pattern in MONTHS_PATTERNS:
        match = pattern.search(primary_part)
        if match:
            months = float(match.group(1))
            total_months += months
            total_days += months * 30.417  # Average days in month
            total_years += months / 12.0
            found_any = True
            primary_part = pattern.sub("", primary_part)

    # Extract days
    for pattern in DAYS_PATTERNS:
        match = pattern.search(primary_part)
        if match:
            days = float(match.group(1))
            total_days += days
            total_months += days / 30.417
            total_years += days / 365.0
            found_any = True
            primary_part = pattern.sub("", primary_part)

    # If no units were found but we have a raw number (e.g. "399"), assume it is days
    if not found_any:
        digits = re.search(r'^(\d+)$', primary_part)
        if digits:
            days = float(digits.group(1))
            total_days = days
            total_months = days / 30.417
            total_years = days / 365.0
            found_any = True

    if not found_any:
        return None, None, None

    return round(total_days, 1), round(total_months, 1), round(total_years, 2)


def normalize_rate(rate_str: str) -> Optional[float]:
    """
    Extracts a numeric float value from an interest rate string.
    Example: '7.10%' -> 7.10
    Example: '6.50 p.a.' -> 6.50
    """
    if not rate_str:
        return None

    # Replace commas, percentage symbols, and spaces
    cleaned = rate_str.replace("%", "").replace(",", "").strip()
    
    # Try finding the first decimal number
    match = re.search(r"(\d+\.?\d*)", cleaned)
    if match:
        try:
            return float(match.group(1))
        except ValueError:
            return None
    return None
