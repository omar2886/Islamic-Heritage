// @ts-check
const { test, expect } = require('@playwright/test');
const { startServer } = require('../../scripts/e2e_server');

const BUILDER_PATH = '/index.php?page=builder';
const RESULTS_PATH = '/index.php?page=results';

/**
 * Attach console error tracking to a page.
 * @param {import('@playwright/test').Page} page
 */
function trackConsoleErrors(page) {
  /** @type {string[]} */
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  return errors;
}

test.describe('builder → results E2E', () => {
  /** @type {{ baseURL: string, stop: () => void } | null} */
  let server = null;

  test.beforeAll(async () => {
    server = await startServer();
  });

  test.afterAll(async () => {
    if (server) {
      server.stop();
    }
  });

  test('T1: builder calcula y muestra resultados', async ({ page }) => {
    if (!server) throw new Error('Server not initialized');
    const consoleErrors = trackConsoleErrors(page);

    await page.goto(`${server.baseURL}${BUILDER_PATH}`);
    await expect(page.getByTestId('builder-root')).toBeVisible();
    await expect(page.locator('#btnCalc')).toBeVisible();

    await page.fill('#wife', '1');
    await page.fill('#daughter', '1');
    await page.fill('#estate', '1000');

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle' }),
      page.click('#btnCalc'),
    ]);

    await expect(page).toHaveURL(`${server.baseURL}${RESULTS_PATH}`);
    const status = page.locator('#results-status');
    await expect(status).toHaveText(/Cálculo listo/i);

    const shareTable = page.locator('section:has-text("Detalle de cuotas") table').first();
    await expect(shareTable).toBeVisible();
    expect(await shareTable.locator('tr').count()).toBeGreaterThan(0);

    expect(consoleErrors).toEqual([]);
  });

  test('T2: results sin payload muestra aviso', async ({ page }) => {
    if (!server) throw new Error('Server not initialized');
    const consoleErrors = trackConsoleErrors(page);

    await page.goto(`${server.baseURL}${RESULTS_PATH}`);

    await expect(page.getByText('Sin payload')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ir al Constructor' })).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });

  test('T3: refresh en results conserva payload', async ({ page }) => {
    if (!server) throw new Error('Server not initialized');
    const consoleErrors = trackConsoleErrors(page);

    await page.goto(`${server.baseURL}${BUILDER_PATH}`);
    await expect(page.getByTestId('builder-root')).toBeVisible();

    await page.fill('#wife', '1');
    await page.fill('#daughter', '1');
    await page.fill('#estate', '1000');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle' }),
      page.click('#btnCalc'),
    ]);

    await expect(page).toHaveURL(`${server.baseURL}${RESULTS_PATH}`);
    const status = page.locator('#results-status');
    await expect(status).toHaveText(/Cálculo listo/i);

    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('#results-status')).toHaveText(/Cálculo listo/i);
    await expect(page.getByText('Sin payload')).toHaveCount(0);

    expect(consoleErrors).toEqual([]);
  });
});
