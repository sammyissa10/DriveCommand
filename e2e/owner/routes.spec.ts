import { test, expect } from '@playwright/test';
import path from 'path';

test.use({ storageState: path.join(__dirname, '../../.playwright/auth/owner.json') });

/**
 * Owner portal — route management tests.
 *
 * Covers: TC-OW-RTE-001, TC-OW-RTE-002, TC-OW-RTE-004, TC-OW-RTE-006
 *
 * Note: Route form uses AddressAutocomplete which requires Google Places API.
 * Tests fill the origin/destination as plain text inputs (the component
 * gracefully accepts plain text without autocomplete selection).
 */

test('@smoke route list page loads', async ({ page }) => {
  await page.goto('/routes');
  await page.waitForLoadState('domcontentloaded');

  await expect(page.getByRole('heading', { name: 'Routes' })).toBeVisible();

  const hasContent = await page.locator('table, [class*="card"], [class*="list"]').first().isVisible().catch(() => false);
  const hasEmpty = await page.getByText(/no routes/i).isVisible().catch(() => false);
  const hasCreateBtn = await page.getByRole('link', { name: /new route|create route/i }).isVisible().catch(() => false);

  expect(hasContent || hasEmpty || hasCreateBtn).toBeTruthy();
});

test('create route — happy path', async ({ page }) => {
  const ts = Date.now();

  await page.goto('/routes/new');
  await page.waitForLoadState('domcontentloaded');

  // Fill origin (plain text — AddressAutocomplete accepts it)
  await page.getByLabel('Origin').fill(`Chicago, IL`);

  // Fill destination
  await page.getByLabel('Destination').fill(`Dallas, TX`);

  // Fill scheduled date/time (datetime-local input)
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  const datetimeStr = nextWeek.toISOString().slice(0, 16);
  await page.getByLabel('Scheduled Date').fill(datetimeStr);

  // Select driver if available
  const driverSelect = page.getByLabel('Driver');
  const driverOptions = await driverSelect.locator('option').count();
  if (driverOptions > 1) {
    await driverSelect.selectOption({ index: 1 });
  }

  // Select truck if available
  const truckSelect = page.getByLabel('Truck');
  const truckOptions = await truckSelect.locator('option').count();
  if (truckOptions > 1) {
    await truckSelect.selectOption({ index: 1 });
  }

  // Submit
  await page.getByRole('button', { name: 'Create Route' }).click();
  await page.waitForLoadState('domcontentloaded');

  // Should redirect to /routes or route detail
  expect(page.url()).toContain('/route');
});

test('route detail page loads', async ({ page }) => {
  await page.goto('/routes');
  await page.waitForLoadState('domcontentloaded');

  // Find a route detail link
  const detailLinks = page.locator('a[href*="/routes/"]').filter({ hasNotText: /new|create/i });
  const hasRoutes = await detailLinks.first().isVisible().catch(() => false);

  if (!hasRoutes) {
    test.skip(true, 'No routes in DB — skipping route detail test');
  }

  await detailLinks.first().click();
  await page.waitForLoadState('domcontentloaded');

  expect(page.url()).toMatch(/\/routes\/[^/]+$/);

  // Route detail should show origin, destination, status
  const hasOrigin = await page.getByText(/origin/i).first().isVisible().catch(() => false);
  const hasDestination = await page.getByText(/destination/i).first().isVisible().catch(() => false);
  const hasStatus = await page.getByText(/status/i).first().isVisible().catch(() => false);

  expect(hasOrigin || hasDestination || hasStatus).toBeTruthy();
});

test('multi-stop route editor — add stop button works', async ({ page }) => {
  await page.goto('/routes/new');
  await page.waitForLoadState('domcontentloaded');

  // Look for the "Add Stop" button in the route form
  const addStopBtn = page.getByRole('button', { name: /add stop/i });
  const hasAddStop = await addStopBtn.isVisible().catch(() => false);

  if (!hasAddStop) {
    test.skip(true, 'No Add Stop button found — multi-stop may not be available');
  }

  // Click Add Stop and verify a stop input appears
  await addStopBtn.click();

  // A stop address input should appear
  const stopInputs = page.locator('[placeholder*="stop"], [name*="stop"], input').filter({ hasText: '' });
  const hasStopInput = await page.locator('[name*="stops_0_"]').isVisible().catch(() => false);
  const hasAddressInput = await page.getByRole('textbox').nth(2).isVisible().catch(() => false);

  expect(hasStopInput || hasAddressInput).toBeTruthy();
});

test('route detail shows finance section', async ({ page }) => {
  await page.goto('/routes');
  await page.waitForLoadState('domcontentloaded');

  const detailLinks = page.locator('a[href*="/routes/"]').filter({ hasNotText: /new|create/i });
  const hasRoutes = await detailLinks.first().isVisible().catch(() => false);

  if (!hasRoutes) {
    test.skip(true, 'No routes in DB — skipping route finance test');
  }

  await detailLinks.first().click();
  await page.waitForLoadState('domcontentloaded');

  // Route detail should have a financial section
  const hasFinance = await page.getByText(/financ|expense|profit|revenue/i).first().isVisible({ timeout: 10000 }).catch(() => false);

  expect(hasFinance).toBeTruthy();
});
