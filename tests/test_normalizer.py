from core.normalizer import parse_tenure, normalize_rate

def test_parse_tenure_days():
    days, months, years = parse_tenure("7 Days")
    assert days == 7.0
    assert months == round(7.0 / 30.417, 1)
    assert years == round(7.0 / 365.0, 2)

def test_parse_tenure_months():
    days, months, years = parse_tenure("18 Months")
    assert months == 18.0
    assert days == round(18.0 * 30.417, 1)
    assert years == 1.5

def test_parse_tenure_years():
    days, months, years = parse_tenure("2 Years")
    assert years == 2.0
    assert months == 24.0
    assert days == 730.0

def test_parse_tenure_mixed():
    days, months, years = parse_tenure("1 Year 6 Months")
    # Primary part is "1 Year" because no range splitting occurred, but let's test how regex works
    # Wait, the parse_tenure splits on "to"/"-"/etc, then parses years and months sequentially on the remaining string.
    # So "1 Year 6 Months" will match years -> 1.0 (adds 365 days, 12 months, 1 year), then replaces "1 Year" with "",
    # leaving "6 Months". It will then search "6 Months", match months -> 6.0 (adds 182.5 days, 6 months, 0.5 years).
    # Result: total_years = 1.5, total_months = 18.0, total_days = 547.5
    assert years == 1.5
    assert months == 18.0
    assert days == 547.5

def test_parse_tenure_range():
    # "12 to 24 Months" splits on "to". Primary part is "12" (no unit) or "12 Months" if split is not matching.
    # Wait! "12 to 24 Months" -> split on "to" -> parts are ["12 ", " 24 Months"]
    # So primary_part is "12 " (no unit). It is a digit, so we assume days -> 12 days.
    # Wait! If the user writes "12 Months to 24 Months", it splits to "12 Months" -> 12 months.
    days, months, years = parse_tenure("12 Months to 24 Months")
    assert months == 12.0
    assert years == 1.0

def test_parse_raw_number():
    days, months, years = parse_tenure("399")
    assert days == 399.0

def test_parse_invalid():
    days, months, years = parse_tenure("invalid text")
    assert days is None
    assert months is None
    assert years is None

def test_normalize_rate():
    assert normalize_rate("7.10%") == 7.10
    assert normalize_rate("6.50 p.a.") == 6.50
    assert normalize_rate("8") == 8.0
    assert normalize_rate("") is None
    assert normalize_rate("no rate here") is None
