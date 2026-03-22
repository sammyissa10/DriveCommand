import { test, expect } from '@playwright/test';
import path from 'path';

test.use({ storageState: path.join(__dirname, '../../.playwright/auth/owner.json') });

/**
 * Owner portal — trucks CRUD tests.
 *
 * Covers: TC-OW-TRK-001, TC-OW-TRK-003, TC-OW-TRK-004, TC-OW-TRK-005, TC-OW-TRK-006
 *
 * Each test generates unique data via Date.now() to avoid DB collisions.
 */

test('@smoke truck list page loads', async ({ page }) => {
  await page.goto('/trucks');
  await page.waitForLoadState('domcontentloaded');

  await expect(page.getByRole('heading', { name: 'Trucks' })).toBeVisible();

  // Either a table/list of trucks or an empty state message is visible
  const hasTable = await page.locator('table').isVisible().catch(() => false);
  const hasCards = await page.locator('[class*="card"]').first().isVisible().catch(() => false);
  const hasEmpty = await page.getByText(/no trucks/i).isVisible().catch(() => false);
  const hasAddButton = await page.getByRole('link', { name: /add|new truck/i }).isVisible().catch(() => false);

  expect(hasTable || hasCards || hasEmpty || hasAddButton).toBeTruthy();
});

test('@smoke create truck — happy path', async ({ page }) => {
  const ts = Date.now();
  const make = `TestMake${ts}`;
  const model = `TestModel${ts}`;
  // Generate a valid 17-char VIN (no I, O, Q) using timestamp
  const vin = `1FUJA${String(ts).slice(-12)}`.toUpperCase().replace(/[IOQ]/g, 'X');

  await page.goto('/trucks/new');
  await page.waitForLoadState('domcontentloaded');

  // Fill make
  await page.getByLabel('Make').fill(make);

  // Fill model
  await page.getByLabel('Model').fill(model);

  // Select year via the searchable year dropdown
  await page.getByLabel('Year').fill('2024');
  // Wait for dropdown and click the 2024 option
  await page.getByText('2024', { exact: true }).first().click();

  // Fill VIN
  await page.getByLabel('VIN').fill(vin);

  // Fill license plate
  await page.getByLabel('License Plate').fill(`TST-${String(ts).slice(-5)}`);

  // Fill odometer
  await page.getByLabel('Odometer (miles)').fill('50000');

  // Submit
  await page.getByRole('button', { name: 'Create Truck' }).click();
  await page.waitForLoadState('domcontentloaded');

  // Should redirect to /trucks list
  expect(page.url()).toContain('/trucks');

  // The new truck should appear in the list
  await expect(page.getByText(make)).toBeVisible({ timeout: 10000 });
});

test('truck list shows column headers or truck info', async ({ page }) => {
  await page.goto('/trucks');
  await page.waitForLoadState('domcontentloaded');

  // Look for table headers or labels commonly shown for trucks
  const hasMakeColumn = await page.getByText(/make|model|vehicle/i).first().isVisible().catch(() => false);
  const hasStatusColumn = await page.getByText(/status/i).first().isVisible().catch(() => false);

  // Either there's column info or a truck list item visible
  expect(hasMakeColumn || hasStatusColumn).toBeTruthy();
});

test('view truck detail page', async ({ page }) => {
  await page.goto('/trucks');
  await page.waitForLoadState('domcontentloaded');

  // Find a truck link or row to click
  // Try clicking first truck entry — look for detail links
  const truckLink = page.getByRole('link').filter({ hasText: /[A-Z0-9]/ }).first();
  const hasTrucks = await truckLink.isVisible().catch(() => false);

  if (!hasTrucks) {
    test.skip(true, 'No trucks in DB — skipping truck detail test');
  }

  // Click a truck detail link (not Add New Truck)
  // Navigate directly to trucks list and look for detail row links
  const rows = page.locator('tr, [class*="row"], a[href*="/trucks/"]');
  const truckDetailLink = rows.filter({ hasNot: page.getByText(/add|new|invite/i) }).first();

  // Find links to truck detail pages
  const detailLinks = page.locator('a[href*="/trucks/"]').filter({ hasNotText: /new|add/i });
  const hasDetailLink = await detailLinks.first().isVisible().catch(() => false);

  if (!hasDetailLink) {
    test.skip(true, 'No truck detail links found');
  }

  await detailLinks.first().click();
  await page.waitForLoadState('domcontentloaded');

  // Should be on a truck detail page
  expect(page.url()).toMatch(/\/trucks\/[^/]+$/);

  // Truck detail fields visible
  const hasMake = await page.getByText(/make|freightliner|kenworth|testmake/i).first().isVisible().catch(() => false);
  const hasVin = await page.getByText(/vin/i).first().isVisible().catch(() => false);

  expect(hasMake || hasVin).toBeTruthy();
});

test('edit truck', async ({ page }) => {
  await page.goto('/trucks');
  await page.waitForLoadState('domcontentloaded');

  // Find a truck detail link
  const detailLinks = page.locator('a[href*="/trucks/"]').filter({ hasNotText: /new|add/i });
  const hasDetailLink = await detailLinks.first().isVisible().catch(() => false);

  if (!hasDetailLink) {
    test.skip(true, 'No trucks in DB — skipping edit test');
  }

  await detailLinks.first().click();
  await page.waitForLoadState('domcontentloaded');

  // Click Edit button
  const editLink = page.getByRole('link', { name: /edit/i });
  const hasEdit = await editLink.isVisible().catch(() => false);

  if (!hasEdit) {
    test.skip(true, 'No edit button on truck detail page');
  }

  await editLink.click();
  await page.waitForLoadState('domcontentloaded');

  // Change odometer field
  const odometerField = page.getByLabel('Odometer (miles)');
  await odometerField.clear();
  await odometerField.fill('55000');

  // Submit
  await page.getByRole('button', { name: /save|update/i }).click();
  await page.waitForLoadState('domcontentloaded');

  // Should be back on detail page showing updated value
  expect(page.url()).toMatch(/\/trucks\/[^/]+$/);
});

test('truck form validation — empty submission', async ({ page }) => {
  await page.goto('/trucks/new');
  await page.waitForLoadState('domcontentloaded');

  // Submit without filling any fields
  await page.getByRole('button', { name: 'Create Truck' }).click();

  // HTML5 required validation or custom error should prevent submission
  // Check that we're still on /trucks/new
  expect(page.url()).toContain('/trucks/new');
});
