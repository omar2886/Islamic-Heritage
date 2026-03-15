// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const ARTIFACT_DIR = path.join(__dirname, 'artifacts');
const AUDIT_PATH = path.join(ARTIFACT_DIR, 'audit.json');
const BASE_URL = process.env.HERITAGE_BASE_URL
  ? normalizeBase(process.env.HERITAGE_BASE_URL)
  : 'http://127.0.0.1:8016/Heritage/public/';
const SAMPLE_PAYLOAD = path.join(REPO_ROOT, 'samples', 'payload_wife_daughter.json');

fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

/** @type {{
 *  pages: Array<{name: string, url: string, screenshot: string, html: string, diagnostics: Array<{text: string, isError: boolean}>}>,
 *  consoleErrors: Array<{page: string, type: string, text: string}>,
 *  consoleWarnings: Array<{page: string, type: string, text: string}>,
 *  pageErrors: Array<{page: string, message: string}>,
 *  failedRequests: Array<{page: string, url: string, status: number | string}>
 * }}
 */
const auditLog = {
  pages: [],
  consoleErrors: [],
  consoleWarnings: [],
  pageErrors: [],
  failedRequests: [],
};

function normalizeBase(raw) {
  return raw.endsWith('/') ? raw : `${raw}/`;
}

/**
 * @param {string} rel
 */
function buildUrl(rel) {
  return new URL(rel, BASE_URL).toString();
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 */
function attachAuditHooks(page, label) {
  page.on('pageerror', (err) => {
    auditLog.pageErrors.push({ page: label, message: String(err?.message || err) });
  });

  page.on('console', (msg) => {
    const entry = { page: label, type: msg.type(), text: msg.text() };
    if (msg.type() === 'error') {
      auditLog.consoleErrors.push(entry);
    } else if (msg.type() === 'warning') {
      auditLog.consoleWarnings.push(entry);
    }
  });

  page.on('response', (response) => {
    const status = response.status();
    const url = response.url();
    if (status >= 400 && !url.includes('favicon')) {
      auditLog.failedRequests.push({ page: label, url, status });
    }
  });

  page.on('requestfailed', (request) => {
    const failure = request.failure();
    const status = failure?.errorText || 'requestfailed';
    const url = request.url();
    if (!url.includes('favicon')) {
      auditLog.failedRequests.push({ page: label, url, status });
    }
  });
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function collectDiagnostics(page) {
  const entries = await page.evaluate(() => {
    const banner = document.querySelector('#diagnostic-banner');
    if (!banner) return [];
    return Array.from(banner.querySelectorAll('li')).map((item) => ({
      text: (item.textContent || '').trim(),
      style: item.getAttribute('style') || '',
    }));
  });

  return entries.map((entry) => ({
    text: entry.text,
    isError:
      entry.style.toLowerCase().includes('#900') ||
      entry.style.toLowerCase().includes('font-weight') ||
      entry.text.toLowerCase().includes('error'),
  }));
}

function assertNoIssues(label) {
  const pageErrors = auditLog.pageErrors.filter((e) => e.page === label);
  expect(pageErrors, `pageerror events for ${label}`).toEqual([]);

  const consoleErrors = auditLog.consoleErrors.filter((e) => e.page === label);
  expect(consoleErrors, `console errors for ${label}`).toEqual([]);

  const requestFailures = auditLog.failedRequests.filter((e) => e.page === label);
  expect(requestFailures, `failed requests for ${label}`).toEqual([]);
}

function recordPageArtifact(name, url, screenshotPath, htmlPath, diagnostics) {
  auditLog.pages.push({
    name,
    url,
    screenshot: path.relative(REPO_ROOT, screenshotPath),
    html: path.relative(REPO_ROOT, htmlPath),
    diagnostics,
  });
}

test.describe('UI audit', () => {
  test('smoke secciones principales', async ({ browser }) => {
    const targets = [
      { name: 'home', path: './' },
      { name: 'builder', path: './index.php?page=builder' },
      { name: 'results', path: './index.php?page=results' },
      { name: 'genealogy', path: './index.php?page=genealogy' },
    ];

    for (const target of targets) {
      const page = await browser.newPage();
      attachAuditHooks(page, target.name);
      const url = buildUrl(target.path);
      const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
      expect(response?.status(), `status for ${target.name}`).toBeLessThan(400);

      await page.waitForLoadState('domcontentloaded');
      const diagnostics = await collectDiagnostics(page);
      const screenshotPath = path.join(ARTIFACT_DIR, `${target.name}.png`);
      const htmlPath = path.join(ARTIFACT_DIR, `${target.name}.html`);

      await page.screenshot({ path: screenshotPath, fullPage: true });
      fs.writeFileSync(htmlPath, await page.content(), 'utf8');

      recordPageArtifact(target.name, url, screenshotPath, htmlPath, diagnostics);
      expect(
        diagnostics.filter((entry) => entry.isError),
        `diagnostic banner errors for ${target.name}`,
      ).toEqual([]);
      assertNoIssues(target.name);
      await page.close();
    }
  });

  test('builder → results con payload precargado', async ({ page }) => {
    const label = 'builder-results-flow';
    attachAuditHooks(page, label);
    const payload = JSON.parse(fs.readFileSync(SAMPLE_PAYLOAD, 'utf8'));

    await page.goto(buildUrl('./index.php?page=builder'), { waitUntil: 'domcontentloaded' });
    await page.evaluate((data) => {
      sessionStorage.setItem('heritage_payload', JSON.stringify(data));
    }, payload);

    const resultsUrl = buildUrl('./index.php?page=results');
    await page.goto(resultsUrl, { waitUntil: 'domcontentloaded' });

    const statusLocator = page.locator('#results-status');
    await expect(statusLocator).toBeVisible();
    await expect(statusLocator).not.toContainText(/Sin payload/i);

    const summarySection = page.locator('section:has-text("Resumen")');
    await expect(summarySection.first()).toBeVisible();

    const diagnostics = await collectDiagnostics(page);
    const screenshotPath = path.join(ARTIFACT_DIR, `${label}.png`);
    const htmlPath = path.join(ARTIFACT_DIR, `${label}.html`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    fs.writeFileSync(htmlPath, await page.content(), 'utf8');

    recordPageArtifact(label, resultsUrl, screenshotPath, htmlPath, diagnostics);
    expect(diagnostics.filter((entry) => entry.isError), 'diagnostic banner errors for flow').toEqual([]);
    assertNoIssues(label);
  });

  test.afterAll(async () => {
    fs.writeFileSync(AUDIT_PATH, JSON.stringify(auditLog, null, 2), 'utf8');
  });
});
