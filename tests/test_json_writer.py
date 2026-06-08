import os
import tempfile
import json
from core.json_writer import JsonWriter

def test_write_json():
    with tempfile.TemporaryDirectory() as tmpdir:
        filepath = os.path.join(tmpdir, "subdir", "test.json")
        data = {"key": "value"}
        
        # Write
        JsonWriter.write_json(data, filepath)
        
        # Verify
        assert os.path.exists(filepath)
        with open(filepath, "r", encoding="utf-8") as f:
            loaded = json.load(f)
        assert loaded == data

def test_generate_validation_report():
    with tempfile.TemporaryDirectory() as tmpdir:
        filepath = os.path.join(tmpdir, "report.json")
        validation_records = {
            "HDFC Bank": ["Row 1: Missing rate"],
            "SBI": []
        }
        
        JsonWriter.generate_validation_report(validation_records, filepath)
        
        assert os.path.exists(filepath)
        with open(filepath, "r", encoding="utf-8") as f:
            loaded = json.load(f)
            
        assert loaded["validation_summary"]["total_banks_checked"] == 2
        assert loaded["validation_summary"]["banks_with_issues"] == 1
        assert loaded["failures_and_warnings"]["HDFC Bank"] == ["Row 1: Missing rate"]
        assert loaded["failures_and_warnings"]["SBI"] == []

def test_write_json_error():
    from unittest.mock import patch
    import pytest
    with patch("builtins.open", side_effect=IOError("Permission denied")):
        with pytest.raises(IOError):
            JsonWriter.write_json({"key": "val"}, "dummy.json")

