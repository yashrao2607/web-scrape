import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from core.browser import PlaywrightBrowserManager

@pytest.mark.asyncio
async def test_browser_manager_lifecycle():
    mock_playwright = MagicMock()
    mock_playwright.stop = AsyncMock()
    mock_browser = AsyncMock()
    
    mock_playwright_start = AsyncMock(return_value=mock_playwright)
    mock_playwright.chromium.launch = AsyncMock(return_value=mock_browser)
    
    # We patch async_playwright
    with patch("core.browser.async_playwright") as mock_ap:
        mock_ap.return_value.start = mock_playwright_start
        
        manager = PlaywrightBrowserManager(headless=True)
        browser = await manager.start()
        
        assert browser is mock_browser
        mock_playwright.chromium.launch.assert_called_once()
        
        # Test get_page
        mock_context = AsyncMock()
        mock_page = AsyncMock()
        mock_page.set_default_timeout = MagicMock()
        mock_browser.new_context = AsyncMock(return_value=mock_context)
        mock_context.new_page = AsyncMock(return_value=mock_page)
        
        page = await manager.get_page()
        assert page is mock_page
        mock_browser.new_context.assert_called_once()
        mock_context.new_page.assert_called_once()
        
        # Test navigate_to success
        await manager.navigate_to(page, "http://test.com")
        page.goto.assert_called_once_with("http://test.com", wait_until="networkidle", timeout=30000)
        
        # Close
        await manager.close()
        mock_browser.close.assert_called_once()

@pytest.mark.asyncio
async def test_browser_manager_navigation_fallback():
    mock_playwright = MagicMock()
    mock_browser = AsyncMock()
    mock_page = AsyncMock()
    
    call_count = 0
    async def side_effect(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise Exception("Timeout")
        return None
    mock_page.goto = AsyncMock(side_effect=side_effect)
    mock_page.set_default_timeout = MagicMock()
    
    mock_playwright_start = AsyncMock(return_value=mock_playwright)
    mock_playwright.chromium.launch = AsyncMock(return_value=mock_browser)
    
    with patch("core.browser.async_playwright") as mock_ap:
        mock_ap.return_value.start = mock_playwright_start
        manager = PlaywrightBrowserManager()
        await manager.start()
        
        await manager.navigate_to(mock_page, "http://failfirst.com")
        assert mock_page.goto.call_count == 2

@pytest.mark.asyncio
async def test_browser_manager_download(tmp_path):
    import os
    mock_playwright = MagicMock()
    mock_browser = AsyncMock()
    mock_page = AsyncMock()
    
    mock_download = AsyncMock()
    mock_download.suggested_filename = "rates.pdf"
    mock_download.save_as = AsyncMock()
    
    class MockDownloadContext:
        async def __aenter__(self):
            import asyncio
            class ValHolder:
                pass
            holder = ValHolder()
            fut = asyncio.Future()
            fut.set_result(mock_download)
            holder.value = fut
            return holder
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass
            
    mock_page.expect_download = MagicMock(return_value=MockDownloadContext())
    mock_page.set_default_timeout = MagicMock()
    
    mock_playwright_start = AsyncMock(return_value=mock_playwright)
    mock_playwright.chromium.launch = AsyncMock(return_value=mock_browser)
    
    with patch("core.browser.async_playwright") as mock_ap:
        mock_ap.return_value.start = mock_playwright_start
        manager = PlaywrightBrowserManager()
        await manager.start()
        
        path = await manager.download_file(mock_page, "http://test.com/rates.pdf", str(tmp_path))
        assert path == os.path.join(str(tmp_path), "rates.pdf")
        mock_download.save_as.assert_called_once_with(path)

