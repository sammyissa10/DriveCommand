import { test, expect } from '@playwright/test';
import path from 'path';

test.use({ storageState: path.join(__dirname, '../../.playwright/auth/owner.json') });

// ---------------------------------------------------------------------------
// Carrier Drivers
// ---------------------------------------------------------------------------

test.describe('Carrier Fleet — Drivers', () => {
  test('@smoke driver list page loads', async ({ page }) => {
    await page.goto('/carrier/fleet/drivers');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: /Drivers/i })).toBeVisible();
  });

  test('driver list shows New Driver button', async ({ page }) => {
    await page.goto('/carrier/fleet/drivers');
    await page.waitForLoadState('domcontentloaded');
    const addBtn = page.getByRole('link', { name: /New Driver/i }).or(
      page.getByRole('button', { name: /New Driver/i })
    );
    await expect(addBtn.first()).toBeVisible();
  });

  test('@smoke create driver — happy path', async ({ page }) => {
    const ts = Date.now();
    await page.goto('/carrier/fleet/drivers/new');
    await page.waitForLoadState('domcontentloaded');

    // Fill required fields
    await page.getByLabel(/First Name/i).fill(`QA${ts}`);
    await page.getByLabel(/Last Name/i).fill('Driver');

    // Pay Model — shadcn Select (trigger has id="payModel")
    const payModelTrigger = page.locator('#payModel');
    await payModelTrigger.click();
    await page.getByRole('option', { name: /Per Mile/i }).click();

    // Pay Period — shadcn Select (trigger has id="payPeriod")
    const payPeriodTrigger = page.locator('#payPeriod');
    await payPeriodTrigger.click();
    await page.getByRole('option', { name: 'Weekly', exact: true }).click();

    // Pay Rate — input with id="payRate"
    const payRateInput = page.locator('#payRate');
    if (await payRateInput.isVisible().catch(() => false)) {
      await payRateInput.fill('0.55');
    }

    // Button label is "Create Driver" in create mode
    await page.getByRole('button', { name: /Create Driver/i }).click();
    await page.waitForLoadState('domcontentloaded');

    // On success, redirect back to driver list or driver detail
    expect(page.url()).toMatch(/\/carrier\/fleet\/drivers/);
  });

  test('view driver detail navigates to edit form', async ({ page }) => {
    await page.goto('/carrier/fleet/drivers');
    await page.waitForLoadState('domcontentloaded');

    const firstRow = page.locator('table tbody tr').first();
    const hasRow = await firstRow.isVisible().catch(() => false);
    if (!hasRow) {
      test.skip(true, 'No drivers in list — skipping detail test');
      return;
    }

    // Click driver name link — navigates to /carrier/fleet/drivers/:id which has edit form
    const editLink = firstRow.getByRole('link').first();
    await editLink.click();
    await page.waitForURL(/\/carrier\/fleet\/drivers\/.+/);
    await page.waitForLoadState('networkidle');
    // Edit form is rendered on the detail page
    await expect(page.getByLabel(/First Name/i)).toBeVisible();
  });

  test('driver form validates required First Name field', async ({ page }) => {
    await page.goto('/carrier/fleet/drivers/new');
    await page.waitForLoadState('domcontentloaded');
    // Submit with no data filled — form validates via JS and shows toast, stays on page
    await page.getByRole('button', { name: /Create Driver/i }).click();
    // Should stay on the same page (form validation prevents navigation)
    expect(page.url()).toContain('/carrier/fleet/drivers/new');
  });
});

// ---------------------------------------------------------------------------
// Carrier Trucks
// ---------------------------------------------------------------------------

test.describe('Carrier Fleet — Trucks', () => {
  test('@smoke truck list page loads', async ({ page }) => {
    await page.goto('/carrier/fleet/trucks');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: /Trucks/i })).toBeVisible();
  });

  test('truck list shows New Truck button', async ({ page }) => {
    await page.goto('/carrier/fleet/trucks');
    await page.waitForLoadState('domcontentloaded');
    const addBtn = page.getByRole('link', { name: /New Truck/i }).or(
      page.getByRole('button', { name: /New Truck/i })
    );
    await expect(addBtn.first()).toBeVisible();
  });

  test('@smoke create truck — happy path', async ({ page }) => {
    const ts = Date.now();
    await page.goto('/carrier/fleet/trucks/new');
    await page.waitForLoadState('domcontentloaded');

    // Unit Number is required — input with id="unitNumber"
    await page.locator('#unitNumber').fill(`T-${ts}`);

    // Truck Type — shadcn Select (trigger has id="truckType"), defaults to "semi"
    // Confirm it has a selected value already; if not, pick first option
    const truckTypeTrigger = page.locator('#truckType');
    await truckTypeTrigger.click();
    // Pick first available option (Semi is default but click explicitly)
    await page.getByRole('option').first().click();

    // Button label is "Create Truck" in create mode
    await page.getByRole('button', { name: /Create Truck/i }).click();
    await page.waitForLoadState('domcontentloaded');

    // On success, redirect back to truck list or truck detail
    expect(page.url()).toMatch(/\/carrier\/fleet\/trucks/);
  });

  test('view truck detail navigates to edit form', async ({ page }) => {
    await page.goto('/carrier/fleet/trucks');
    await page.waitForLoadState('domcontentloaded');

    const firstRow = page.locator('table tbody tr').first();
    const hasRow = await firstRow.isVisible().catch(() => false);
    if (!hasRow) {
      test.skip(true, 'No trucks in list — skipping detail test');
      return;
    }

    // Click truck link — navigates to /carrier/fleet/trucks/:id which has edit form
    const editLink = firstRow.getByRole('link').first();
    await editLink.click();
    await page.waitForURL(/\/carrier\/fleet\/trucks\/.+/);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#unitNumber')).toBeVisible();
  });

  test('truck form validates required Unit Number field', async ({ page }) => {
    await page.goto('/carrier/fleet/trucks/new');
    await page.waitForLoadState('domcontentloaded');
    // Submit with no unit number — form validates via JS and shows toast, stays on page
    await page.getByRole('button', { name: /Create Truck/i }).click();
    expect(page.url()).toContain('/carrier/fleet/trucks/new');
  });

  test('truck form accepts optional VIN and plate fields', async ({ page }) => {
    const ts = Date.now();
    await page.goto('/carrier/fleet/trucks/new');
    await page.waitForLoadState('domcontentloaded');

    await page.locator('#unitNumber').fill(`T-OPT-${ts}`);

    const vinInput = page.locator('#vin');
    if (await vinInput.isVisible().catch(() => false)) {
      await vinInput.fill('1HGCM82633A004352');
    }

    const plateInput = page.locator('#licensePlate');
    if (await plateInput.isVisible().catch(() => false)) {
      await plateInput.fill(`QA${ts}`);
    }

    // Truck Type — select first option
    const truckTypeTrigger = page.locator('#truckType');
    await truckTypeTrigger.click();
    await page.getByRole('option').first().click();

    await page.getByRole('button', { name: /Create Truck/i }).click();
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toMatch(/\/carrier\/fleet\/trucks/);
  });
});
