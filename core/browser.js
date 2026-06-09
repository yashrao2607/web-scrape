import { chromium } from 'playwright';
import { logger } from './logger.js';
import fs from 'fs';
import path from 'path';

export class PlaywrightBrowserManager {
  constructor(headless = true, timeoutMs = 30000) {
    this.headless = headless;
    this.timeoutMs = timeoutMs;
    this._browser = null;
  }

  async start() {
    if (!this._browser) {
      logger.info("launching_browser", { headless: this.headless });
      this._browser = await chromium.launch({
        headless: this.headless,
        args: [
          "--disable-dev-shm-usage",
          "--no-sandbox",
          "--disable-setuid-sandbox"
        ]
      });
    }
    return this._browser;
  }

  async close() {
    if (this._browser) {
      logger.info("closing_browser");
      await this._browser.close();
      this._browser = null;
    }
  }

  async getPage() {
    if (!this._browser) {
      await this.start();
    }
    const context = await this._browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 800 },
      acceptDownloads: true
    });
    const page = await context.newPage();
    page.setDefaultTimeout(this.timeoutMs);
    return page;
  }

  async navigateTo(page, url) {
    logger.info("navigating_to_url", { url });
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: this.timeoutMs });
    } catch (e) {
      logger.warn("networkidle_failed_falling_back_to_load", { url, error: e.message });
      await page.goto(url, { waitUntil: "load", timeout: this.timeoutMs });
    }
  }

  async downloadFile(page, downloadUrl, destDir) {
    logger.info("initiating_download", { url: downloadUrl });
    fs.mkdirSync(destDir, { recursive: true });

    const downloadPromise = page.waitForEvent('download', { timeout: this.timeoutMs });
    await page.goto(downloadUrl);
    const download = await downloadPromise;

    const suggestedFilename = download.suggestedFilename();
    const destPath = path.join(destDir, suggestedFilename);
    await download.saveAs(destPath);
    logger.info("download_complete", { path: destPath });
    return destPath;
  }
}
