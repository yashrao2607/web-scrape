from core.change_detector import ChangeDetector

def test_detect_changes_new_bank():
    new_data = [
        {"bank_name": "New Bank", "source_url": "http://new.com", "fd_rates": []}
    ]
    old_data = []
    
    report = ChangeDetector.detect_changes(new_data, old_data)
    assert len(report) == 1
    assert report[0]["bank"] == "New Bank"
    assert report[0]["changes_detected"] is True
    assert report[0]["event"] == "new_bank_added"

def test_detect_changes_no_changes():
    new_data = [
        {
            "bank_name": "Bank A",
            "source_url": "http://a.com",
            "minimum_deposit": 1000.0,
            "fd_rates": [
                {"tenure_raw": "1 Year", "general_rate": 7.0, "senior_citizen_rate": 7.5}
            ]
        }
    ]
    old_data = [
        {
            "bank_name": "Bank A",
            "source_url": "http://a.com",
            "minimum_deposit": 1000.0,
            "fd_rates": [
                {"tenure_raw": "1 Year", "general_rate": 7.0, "senior_citizen_rate": 7.5}
            ]
        }
    ]
    
    report = ChangeDetector.detect_changes(new_data, old_data)
    assert len(report) == 1
    assert report[0]["bank"] == "Bank A"
    assert report[0]["changes_detected"] is False
    assert len(report[0]["rate_changes"]) == 0

def test_detect_changes_rate_updated():
    new_data = [
        {
            "bank_name": "Bank A",
            "source_url": "http://a.com",
            "fd_rates": [
                {"tenure_raw": "1 Year", "general_rate": 7.25, "senior_citizen_rate": 7.75}
            ]
        }
    ]
    old_data = [
        {
            "bank_name": "Bank A",
            "source_url": "http://a.com",
            "fd_rates": [
                {"tenure_raw": "1 Year", "general_rate": 7.0, "senior_citizen_rate": 7.5}
            ]
        }
    ]
    
    report = ChangeDetector.detect_changes(new_data, old_data)
    assert len(report) == 1
    assert report[0]["changes_detected"] is True
    assert len(report[0]["rate_changes"]) == 1
    change = report[0]["rate_changes"][0]
    assert change["tenure"] == "1 Year"
    assert change["change_type"] == "rate_changed"
    assert change["old_general_rate"] == 7.0
    assert change["new_general_rate"] == 7.25

def test_detect_changes_tenure_added_and_removed():
    new_data = [
        {
            "bank_name": "Bank A",
            "source_url": "http://a.com",
            "fd_rates": [
                {"tenure_raw": "2 Years", "general_rate": 7.5, "senior_citizen_rate": 8.0}
            ]
        }
    ]
    old_data = [
        {
            "bank_name": "Bank A",
            "source_url": "http://a.com",
            "fd_rates": [
                {"tenure_raw": "1 Year", "general_rate": 7.0, "senior_citizen_rate": 7.5}
            ]
        }
    ]
    
    report = ChangeDetector.detect_changes(new_data, old_data)
    assert len(report) == 1
    assert report[0]["changes_detected"] is True
    
    # We should have one removal and one addition
    rate_changes = report[0]["rate_changes"]
    assert len(rate_changes) == 2
    types = [rc["change_type"] for rc in rate_changes]
    assert "added" in types
    assert "removed" in types

def test_detect_metadata_changes():
    new_data = [
        {
            "bank_name": "Bank A",
            "source_url": "http://a.com",
            "minimum_deposit": 5000.0,
            "fd_rates": []
        }
    ]
    old_data = [
        {
            "bank_name": "Bank A",
            "source_url": "http://a.com",
            "minimum_deposit": 1000.0,
            "fd_rates": []
        }
    ]
    report = ChangeDetector.detect_changes(new_data, old_data)
    assert len(report) == 1
    assert report[0]["changes_detected"] is True
    assert len(report[0]["metadata_changes"]) == 1
    assert report[0]["metadata_changes"][0]["field"] == "minimum_deposit"
    assert report[0]["metadata_changes"][0]["old_value"] == 1000.0
    assert report[0]["metadata_changes"][0]["new_value"] == 5000.0

def test_load_historical_data_missing():
    assert ChangeDetector.load_historical_data("non_existent_file.json") == []

def test_load_historical_data_invalid(tmp_path):
    invalid_file = tmp_path / "invalid.json"
    invalid_file.write_text("invalid json content")
    assert ChangeDetector.load_historical_data(str(invalid_file)) == []

def test_load_historical_data_dict_format(tmp_path):
    dict_file = tmp_path / "dict.json"
    import json
    with open(dict_file, "w") as f:
        json.dump({"banks": [{"bank_name": "Bank A"}]}, f)
    loaded = ChangeDetector.load_historical_data(str(dict_file))
    assert len(loaded) == 1
    assert loaded[0]["bank_name"] == "Bank A"

