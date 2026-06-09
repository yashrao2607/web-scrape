import re
from typing import Tuple, Optional, Dict, Any

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
    
    if not cleaned:
        return None, None, None
        
    if cleaned.isdigit():
        if int(cleaned) < 15:
            return None, None, None
    else:
        if not any(c.isdigit() for c in cleaned):
            return None, None, None
        if len(cleaned) < 3:
            has_digit = any(c.isdigit() for c in cleaned)
            has_unit = any(u in cleaned.lower() for u in ['y', 'm', 'd', 'w'])
            if not (has_digit and has_unit):
                return None, None, None

    # Exclude typical note indicator prefixes if they are at the very beginning of the string
    # e.g., "Less than 1 year" -> "1 year", "Up to 15 days" -> "15 days"
    cleaned_tmp = re.sub(r'^(?:less\s+than|below|up\s+to|under)\s+', '', cleaned, flags=re.IGNORECASE)

    # If it's a range like "12 to 24 Months", extract the first range component
    # Let's split on common range delimiters: "to", "-"
    # Example: "1 Year to 15 Months" -> Split to "1 Year" and "15 Months"
    parts = re.split(r'\b(?:to|less\s+than|-)\b', cleaned_tmp, flags=re.IGNORECASE)
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


def parse_tenure_to_days(bound_str: str) -> Optional[int]:
    """Helper to convert a single tenure block string to integer days."""
    cleaned = bound_str.strip()
    if not cleaned:
        return None
        
    total_days = 0.0
    found_any = False
    
    # Extract years
    for pattern in YEARS_PATTERNS:
        match = pattern.search(cleaned)
        if match:
            years = float(match.group(1))
            total_days += years * 365.0
            found_any = True
            cleaned = pattern.sub("", cleaned)
            
    # Extract months
    for pattern in MONTHS_PATTERNS:
        match = pattern.search(cleaned)
        if match:
            months = float(match.group(1))
            total_days += months * 30.417
            found_any = True
            cleaned = pattern.sub("", cleaned)
            
    # Extract days
    for pattern in DAYS_PATTERNS:
        match = pattern.search(cleaned)
        if match:
            days = float(match.group(1))
            total_days += days
            found_any = True
            cleaned = pattern.sub("", cleaned)
            
    if not found_any:
        digits = re.search(r'^(\d+)$', cleaned.strip())
        if digits:
            total_days = float(digits.group(1))
            found_any = True
            
    if found_any:
        return int(round(total_days))
    return None


def parse_tenure_range(tenure_str: str) -> Tuple[Optional[int], Optional[int]]:
    """Parses a tenure range to determine min_days and max_days bounds."""
    if not tenure_str:
        return None, None
        
    cleaned = tenure_str.strip()
    cleaned_tmp = re.sub(r'^(?:less\s+than|below|up\s+to|under)\s+', '', cleaned, flags=re.IGNORECASE)
    
    # Check for "and above" or "+"
    if re.search(r'\band\s+above\b|\b&\s+above\b|\b\+\b', cleaned, re.IGNORECASE):
        base_days = parse_tenure_to_days(cleaned_tmp)
        if base_days is not None:
            return base_days, 36500  # Cap at 100 years
            
    # Split range delimiters
    parts = re.split(r'\b(?:to|less\s+than|-)\b|(?:\bbut\s+<\b)|[<>-]', cleaned_tmp, flags=re.IGNORECASE)
    parts = [p.strip() for p in parts if p.strip()]
    
    if len(parts) >= 2:
        part1 = parts[0]
        part2 = parts[1]
        
        days2 = parse_tenure_to_days(part2)
        days1 = parse_tenure_to_days(part1)
        
        if days1 is not None and days2 is not None:
            p1_lower = part1.lower()
            p2_lower = part2.lower()
            has_unit1 = any(u in p1_lower for u in ["day", "month", "year", "week", "yr", "mth"]) or \
                        any(re.search(rf'\b{u}\b', p1_lower) for u in ["d", "m", "y", "w"])
            if not has_unit1:
                # Inherit unit of part2
                if "year" in p2_lower or "yr" in p2_lower or re.search(r'\by\b', p2_lower):
                    # Only inherit year if the raw number is small (e.g. < 12)
                    if days1 < 12:
                        days1 = days1 * 365
                elif "month" in p2_lower or "mth" in p2_lower or re.search(r'\bm\b', p2_lower):
                    # Only inherit month if the raw number is small (e.g. < 120)
                    if days1 < 120:
                        days1 = int(round(days1 * 30.417))
            return days1, days2
            
    elif len(parts) == 1:
        days = parse_tenure_to_days(parts[0])
        if days is not None:
            return days, days
            
    return None, None


def classify_fd_product(section_name: str, table_name: str, tenure_raw: str) -> Dict[str, Any]:
    """Classifies an FD product mapping its properties from table headings and tenure patterns."""
    sec_lower = section_name.lower() if section_name else ""
    tbl_lower = table_name.lower() if table_name else ""
    ten_lower = tenure_raw.lower() if tenure_raw else ""
    
    # 1. product_type
    bulk_keywords = [
        "bulk", "above 2 crore", "above 2cr", "above rs. 2 crore", "above rs 2 crore",
        "above rs. 1 crore", "above 1 crore", "3 cr. to 10 cr.", "above rs 5 crore",
        "above rs. 5 crore", "5 cr", "10 cr", "25 cr", "50 cr", "100 cr", "200 cr", "500 cr", "1000 cr",
        "above 2.00 crore", "above 1.00 crore", "above 5.00 crore"
    ]
    is_bulk = False
    for bk in bulk_keywords:
        if bk in sec_lower or bk in tbl_lower:
            is_bulk = True
            break
            
    product_type = "bulk_fd" if is_bulk else "retail_fd"
    
    # 2. deposit_category
    deposit_category = "regular"
    if "tax saver" in sec_lower or "tax saver" in tbl_lower or "tax-saver" in sec_lower or "tax-saver" in tbl_lower or "80c" in sec_lower or "80c" in tbl_lower:
        deposit_category = "tax_saver"
    elif "green" in sec_lower or "green" in tbl_lower or "eco" in sec_lower or "eco" in tbl_lower:
        deposit_category = "green_deposit"
        
    # 3. customer_segment
    has_resident = any(k in sec_lower or k in tbl_lower for k in ["domestic", "resident"])
    has_nre = "nre" in sec_lower or "nre" in tbl_lower
    has_nro = "nro" in sec_lower or "nro" in tbl_lower
    has_fcnr = "fcnr" in sec_lower or "fcnr" in tbl_lower
    
    matched_segments = []
    if has_resident:
        matched_segments.append("resident")
    if has_nre:
        matched_segments.append("nre")
    if has_nro:
        matched_segments.append("nro")
    if has_fcnr:
        matched_segments.append("fcnr")
        
    if len(matched_segments) > 1:
        customer_segment = "mixed"
    elif len(matched_segments) == 1:
        customer_segment = matched_segments[0]
    else:
        if "senior citizen special" in sec_lower or "senior citizen special" in tbl_lower or "senior special" in sec_lower or "senior special" in tbl_lower:
            customer_segment = "senior_citizen"
        else:
            customer_segment = "resident"
        
    # 4. callable
    callable_val = True
    non_callable_keywords = ["non-callable", "non callable", "without premature", "no premature", "uttam"]
    if any(k in sec_lower or k in tbl_lower for k in non_callable_keywords):
        callable_val = False
        
    # 5. scheme_type & scheme_name
    scheme_type = "regular_fd"
    scheme_name = None
    
    is_range = "to" in ten_lower or "-" in ten_lower or "less" in ten_lower or "below" in ten_lower or "above" in ten_lower or "or more" in ten_lower or "<" in ten_lower or ">" in ten_lower
    
    is_special = False
    if "green" in sec_lower or "green" in tbl_lower:
        is_special = True
        scheme_name = "Green Deposit"
    elif deposit_category == "tax_saver" or "tax saver" in ten_lower or "tax-saver" in ten_lower:
        is_special = True
        scheme_type = "tax_saver_fd"
        scheme_name = "Tax Saver FD"
    elif not is_range and any(k in ten_lower for k in ["day", "month", "year"]):
        cleaned_ten = re.sub(r'[*#$\s]+$', '', ten_lower).strip()
        if cleaned_ten not in ["1 year", "2 years", "3 years", "4 years", "5 years", "6 years", "7 years", "8 years", "9 years", "10 years", "7 days", "15 days", "30 days", "45 days", "90 days", "180 days"]:
            is_special = True
            scheme_name = tenure_raw.strip() + " FD"
            
    if is_special and scheme_type == "regular_fd":
        scheme_type = "special_fd"
        
    return {
        "product_type": product_type,
        "deposit_category": deposit_category,
        "customer_segment": customer_segment,
        "callable": callable_val,
        "scheme_type": scheme_type,
        "scheme_name": scheme_name
    }


def normalize_date_string(date_str: str) -> Optional[str]:
    """Normalizes a raw date string to YYYY-MM-DD format."""
    if not date_str:
        return None
    import datetime
    
    # Clean the string
    cleaned = date_str.strip()
    # Remove ordinal suffixes like 1st, 2nd, 3rd, 4th
    cleaned = re.sub(r'\b(\d+)(st|nd|rd|th)\b', r'\1', cleaned, flags=re.IGNORECASE)
    # Remove trailing/leading special characters
    cleaned = re.sub(r'[*#$\s]+$', '', cleaned)
    cleaned = re.sub(r'^\s*[:\-\/\.\s]+', '', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned)
    
    # 1. Try DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY
    match = re.search(r'\b(\d{1,2})[\.\-\/](\d{1,2})[\.\-\/](\d{4})\b', cleaned)
    if match:
        d, m, y = match.groups()
        try:
            dt = datetime.date(int(y), int(m), int(d))
            return dt.isoformat()
        except ValueError:
            pass
            
    # 2. Text month formats: e.g. "June 9, 2026", "1 June 2026", "June 2026"
    months_map = {
        "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
        "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
        "january": 1, "february": 2, "march": 3, "april": 4, "june": 6,
        "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12
    }
    
    month_num = None
    for m_name, m_val in months_map.items():
        if re.search(r'\b' + m_name + r'\b', cleaned.lower()):
            month_num = m_val
            break
            
    if month_num is not None:
        # Try to find year
        year_match = re.search(r'\b(20\d{2})\b', cleaned)
        year = int(year_match.group(1)) if year_match else 2026  # Default to current year 2026
        
        # Try to find day
        numbers = re.findall(r'\b(\d{1,2})\b', cleaned)
        day = 1
        for num in numbers:
            val = int(num)
            if val != year and 1 <= val <= 31:
                day = val
                break
        try:
            dt = datetime.date(year, month_num, day)
            return dt.isoformat()
        except ValueError:
            pass
            
    return None


def extract_effective_date(text: str) -> Optional[str]:
    """Attempts to match an effective date pattern from page headings or footnotes."""
    if not text:
        return None
    match = re.search(r'\bw\.e\.f\.?\s*(?:from|date)?\s*([A-Za-z0-9\.\-\/\,\s]{6,25})', text, re.IGNORECASE)
    if match:
        date_str = match.group(1).strip()
        return normalize_date_string(date_str)
    
    # Try direct date formats in the text as a backup
    direct_normalized = normalize_date_string(text)
    if direct_normalized:
        return direct_normalized
        
    return None
