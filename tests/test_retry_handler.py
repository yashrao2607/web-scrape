import pytest
from core.retry_handler import get_retry_decorator

def test_retry_success_after_failures():
    attempts = 0
    
    @get_retry_decorator(max_attempts=3, min_backoff=0, max_backoff=0)
    def flaky_function():
        nonlocal attempts
        attempts += 1
        if attempts < 2:
            raise ValueError("Flaky error")
        return "success"
        
    res = flaky_function()
    assert res == "success"
    assert attempts == 2

def test_retry_raises_after_max_attempts():
    attempts = 0
    
    @get_retry_decorator(max_attempts=2, min_backoff=0, max_backoff=0)
    def failing_function():
        nonlocal attempts
        attempts += 1
        raise ValueError("Constant error")
        
    with pytest.raises(ValueError):
        failing_function()
    assert attempts == 2
