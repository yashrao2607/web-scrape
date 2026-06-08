import os
import structlog
from typing import AsyncGenerator
from playwright.async_api import async_playwright, Playwright, Browser, Page

logger = structlog.get_logger()

class PlaywrightBrowserManager:
    """
    Manages Playwright browser instance lifecycle, viewport settings, 
    user-agent configurations, timeouts, and safe file download capabilities.
    """
    def __init__(self, headless: bool = True, timeout_ms: int = 30000):
        self.headless = headless
        self.timeout_ms = timeout_ms
        self._playwright: Optional[Playwright] = None
        self._browser: Optional[Browser] = None

    async def start(self) -> Browser:
        """Launches the Playwright browser manager."""
        if not self._browser:
            logger.info("launching_browser", headless=self.headless)
            self._playwright = await async_playwright().start()
            self._browser = await self._playwright.chromium.launch(
                headless=self.headless,
                args=[
                    "--disable-dev-shm-usage",
                    "--no-sandbox",
                    "--disable-setuid-sandbox"
                ]
            )
        return self._browser

    async def close(self) -> None:
        """Closes the browser instance and releases Playwright resources."""
        if self._browser:
            logger.info("closing_browser")
            await self._browser.close()
            self._browser = None
        if self._playwright:
            await self._playwright.stop()
            self._playwright = None

    async def get_page(self) -> Page:
        """
        Creates and returns a new page with predefined user-agent and settings.
        """
        if not self._browser:
            await self.start()
            
        context = await self._browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 800},
            accept_downloads=True
        )
        page = await context.new_page()
        page.set_default_timeout(self.timeout_ms)
        return page

    async def navigate_to(self, page: Page, url: str) -> None:
        """
        Navigates a page to a URL with fallback waiting policies.
        """
        logger.info("navigating_to_url", url=url)
        try:
            # First try networkidle
            await page.goto(url, wait_until="networkidle", timeout=self.timeout_ms)
        except Exception as e:
            logger.warning("networkidle_failed_falling_back_to_load", url=url, error=str(e))
            # Fallback to load state
            await page.goto(url, wait_until="load", timeout=self.timeout_ms)

    async def download_file(self, page: Page, download_url: str, dest_dir: str) -> str:
        """
        Triggers and handles a file download from a given page, saving it to dest_dir.
        Returns the absolute local path to the downloaded file.
        """
        logger.info("initiating_download", url=download_url)
        os.makedirs(dest_dir, exist_ok=True)
        
        async with page.expect_download(timeout=self.timeout_ms) as download_info:
            await page.goto(download_url)
            
        download = await download_info.value
        dest_path = os.path.join(dest_dir, download.suggested_filename)
        await download.save_as(dest_path)
        logger.info("download_complete", path=dest_path)
        return dest_path
