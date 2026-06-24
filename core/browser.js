import { chromium } from 'playwright';
import { logger } from './logger.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import dns from 'dns';

export class PlaywrightBrowserManager {
  constructor(headless = true, timeoutMs = 30000) {
    this.headless = headless;
    this.timeoutMs = timeoutMs;
    this._browser = null;
  }

  async start(dnsRules = []) {
    if (!this._browser) {
      const args = [
        "--disable-dev-shm-usage",
        "--no-sandbox",
        "--disable-setuid-sandbox"
      ];
      if (dnsRules.length > 0) {
        args.push(`--host-resolver-rules=${dnsRules.join(", ")}`);
        logger.info("dns_rules_applied", { count: dnsRules.length });
      }
      logger.info("launching_browser", { headless: this.headless, dnsRules: dnsRules.length > 0 });
      this._browser = await chromium.launch({
        headless: this.headless,
        args
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
    const attempts = [ "networkidle", "load", "domcontentloaded" ];
    for (const waitUntil of attempts) {
      try {
        await page.goto(url, { waitUntil, timeout: this.timeoutMs });
        // Quick sanity: if we landed on a chrome error page, retry
        const isError = await page.evaluate(() => document.title && document.title.includes("chromewebdata")).catch(() => false);
        if (isError) {
          logger.warn("chrome_error_page_detected_retrying", { url, waitUntil });
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }
        return;
      } catch (e) {
        logger.warn("navigation_attempt_failed", { url, waitUntil, error: e.message });
        await new Promise(r => setTimeout(r, 3000));
      }
    }
    // Final attempt — let the scraper deal with whatever page state
    try {
      await page.goto(url, { waitUntil: "load", timeout: this.timeoutMs * 2 });
    } catch (e) {
      logger.warn("navigation_failed_attempting_scraper_fallback", { url, error: e.message });
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

/**
 * Pre-resolve all unique hostnames using Node.js system DNS and return
 * `--host-resolver-rules` entries (e.g. `MAP example.com:443 1.2.3.4`).
 * Unresolvable hostnames are silently skipped.  All resolutions run in
 * parallel, and each times out after 5 s to keep the pipeline flowing.
 */
export async function resolveHostnames(urls) {
  const hostnames = [...new Set(urls.map(u => {
    try { return new URL(u).hostname; } catch { return null; }
  }).filter(Boolean))];

  const results = await Promise.allSettled(
    hostnames.map(hostname =>
      Promise.race([
        dns.promises.resolve4(hostname),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000))
      ]).then(addrs => ({ hostname, addrs }))
    )
  );

  const rules = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.addrs.length > 0) {
      rules.push(`MAP ${r.value.hostname}:443 ${r.value.addrs[0]}`);
      rules.push(`MAP ${r.value.hostname}:80 ${r.value.addrs[0]}`);
    } else {
      logger.warn("dns_resolve_failed_skipping", { hostname: r.value?.hostname ?? "unknown" });
    }
  }
  return rules;
}

/**
 * Click a "VIEW RATES" / download-style anchor on the current page and capture the
 * resulting download as a temp file. Used for banks that publish rates as a PDF behind
 * a click (Axis Bank is the canonical example: entry page has multiple VIEW RATES
 * buttons, each pointing to a different PDF; we pick the right one by URL filter).
 *
 * Selector strategy: anchors are filtered by href containing `urlMustMatch` and NOT
 * containing any token in `urlMustNotMatch`. Example for Axis retail domestic FD:
 *   urlMustMatch: "domestic-fixed-deposits"
 *   urlMustNotMatch: ["plus", "nri", "fcnr", "floating"]
 *
 * Returns: { filePath, downloadUrl, suggestedName }
 */
export async function clickAndDownloadPdf(page, opts) {
  const {
    urlMustMatch,
    urlMustNotMatch = [],
    timeoutMs = 30000
  } = opts;

  logger.info("clicking_and_downloading_pdf", { urlMustMatch, urlMustNotMatch });

  // 1. Wait for any matching anchor to be in the DOM
  await page.waitForSelector(`a[href*="${urlMustMatch}"]`, { timeout: timeoutMs });

  // 2. Find the right anchor (filter by href, pick the first match)
  const chosen = await page.evaluate(({ mustMatch, mustNotMatch }) => {
    const anchors = [...document.querySelectorAll('a')];
    const lcNotMatch = mustNotMatch.map(s => s.toLowerCase());
    const matches = anchors.filter(a => {
      const href = a.getAttribute('href') || '';
      if (!href.includes(mustMatch)) return false;
      const lower = href.toLowerCase();
      return !lcNotMatch.some(tok => lower.includes(tok));
    });
    if (matches.length === 0) return null;
    const a = matches[0];
    return {
      text: (a.innerText || '').trim(),
      href: a.getAttribute('href'),
      fullUrl: new URL(a.getAttribute('href'), location.href).toString()
    };
  }, { mustMatch: urlMustMatch, mustNotMatch: urlMustNotMatch });

  if (!chosen) {
    throw new Error(
      `No matching anchor found (mustMatch="${urlMustMatch}", mustNotMatch=${JSON.stringify(urlMustNotMatch)})`
    );
  }

  logger.info("matching_anchor_found_initiating_click", { chosen });

  // 3. Register download listener BEFORE the click
  const downloadPromise = page.waitForEvent('download', { timeout: timeoutMs });

  // 4. Click the anchor
  await page.click(`a[href*="${urlMustMatch}"]`);

  // 5. Capture the download
  const download = await downloadPromise;
  const suggestedName = download.suggestedFilename();
  const downloadedUrl = download.url();

  // 6. Save to a unique temp file
  const tmpPath = path.join(os.tmpdir(), `axis_pdf_${Date.now()}.pdf`);
  await download.saveAs(tmpPath);
  const fileSize = fs.statSync(tmpPath).size;

  logger.info("pdf_download_completed", { path: tmpPath, url: downloadedUrl, size: fileSize });

  return { filePath: tmpPath, downloadUrl: downloadedUrl, suggestedName };
}
