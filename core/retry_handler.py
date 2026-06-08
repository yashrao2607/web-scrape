import structlog
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log
)

logger = structlog.get_logger()

def get_retry_decorator(max_attempts: int = 3, min_backoff: int = 1, max_backoff: int = 4):
    """
    Returns a tenacity retry decorator configured with exponential backoff.
    """
    import logging
    return retry(
        stop=stop_after_attempt(max_attempts),
        wait=wait_exponential(multiplier=min_backoff, min=min_backoff, max=max_backoff),
        before_sleep=before_sleep_log(logger, logging.WARNING),
        reraise=True
    )

# Standard decorator for scraping tasks
standard_retry = get_retry_decorator()
