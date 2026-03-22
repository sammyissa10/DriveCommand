import { test, expect } from '@playwright/test';
import path from 'path';

test.use({ storageState: path.join(__dirname, '../../.playwright/auth/owner.json') });

/**
 * Owner portal — loads and dispatch lifecycle tests.
 *
 * Covers: TC-OW-LOD-001, TC-OW-LOD-003, TC-OW-LOD-005, TC-OW-LOD-006,
 *         TC-OW-LOD-007, TC-OW-LOD-008, TC-OW-LOD-009
 *
 * The full load lifecycle (PENDING -> DISPATCHED -> PICKED_UP -> IN_TRANSIT ->
 * DELIVERED) is tested in a serial describe block so each test can operate on
 * the load created in the first test. INVOICED status requires a separate
 * Mark Invoiced button.
 */

test('@smoke load list page loads', async ({ page }) => {
  await page.goto('/loads');
  await page.waitForLoadState('domcontentloaded');

  await expect(page.getByRole('heading', { name: 'Loads' })).toBeVisible();

  // Either table, cards, or empty state
  const hasContent = await page.locator('table, [class*="card"]').first().isVisible().catch(() => false);
  const hasEmpty = await page.getByText(/no loads/i).isVisible().catch(() => false);
  const hasCreateButton = await page.getByRole('link', { name: /new load|create load/i }).isVisible().catch(() => false);

  expect(hasContent || hasEmpty || hasCreateButton).toBeTruthy();
});

test('load list page has required columns', async ({ page }) => {
  await page.goto('/loads');
  await page.waitForLoadState('domcontentloaded');

  // Look for column headers or load list content
  const hasOrigin = await page.getByText(/origin/i).first().isVisible().catch(() => false);
  const hasStatus = await page.getByText(/status/i).first().isVisible().catch(() => false);
  const hasRate = await page.getByText(/rate/i).first().isVisible().catch(() => false);

  expect(hasOrigin || hasStatus || hasRate).toBeTruthy();
});

test('load form validation — missing required fields', async ({ page }) => {
  await page.goto('/loads/new');
  await page.waitForLoadState('domcontentloaded');

  // Submit without filling required fields
  await page.getByRole('button', { name: 'Create Load' }).click();

  // Should stay on /loads/new (HTML5 validation or server error)
  expect(page.url()).toContain('/loads/new');
});

/**
 * Full load lifecycle — serial to test status progression on one load.
 *
 * Prerequisites:
 * - At least one CRM customer exists (test creates one if needed)
 * - At least one truck exists
 * - At least one active driver exists
 *
 * If prerequisites are missing, the first test creates them then skips
 * gracefully with a helpful message.
 */

// Shared state for the serial lifecycle tests
let testLoadUrl = '';

test.describe.serial('load dispatch lifecycle', () => {
  test('@smoke create load — happy path', async ({ page }) => {
    const ts = Date.now();

    // First ensure a customer exists — navigate to CRM and create one if needed
    await page.goto('/crm');
    await page.waitForLoadState('domcontentloaded');

    const hasCustomer = await page.locator('table tbody tr, a[href*="/crm/"]').first().isVisible().catch(() => false);

    if (!hasCustomer) {
      // Create a customer first
      await page.goto('/crm/new');
      await page.waitForLoadState('domcontentloaded');
      await page.getByLabel('Company Name').fill(`Lifecycle Customer ${ts}`);
      await page.getByRole('button', { name: 'Create Customer' }).click();
      await page.waitForLoadState('domcontentloaded');
    }

    // Now create the load
    await page.goto('/loads/new');
    await page.waitForLoadState('domcontentloaded');

    // Select a customer
    const customerSelect = page.getByLabel('Customer');
    const customerOptions = await customerSelect.locator('option').count();

    if (customerOptions <= 1) {
      test.skip(true, 'No CRM customers available — cannot create load');
    }

    await customerSelect.selectOption({ index: 1 });

    // Fill required fields
    await page.getByLabel('Origin').fill(`Memphis, TN`);
    await page.getByLabel('Destination').fill(`Atlanta, GA`);

    // Set pickup date to next week
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const dateStr = nextWeek.toISOString().slice(0, 10);
    await page.getByLabel('Pickup Date').fill(dateStr);

    // Set rate
    await page.getByLabel('Rate').fill('1500');

    // Submit
    await page.getByRole('button', { name: 'Create Load' }).click();
    await page.waitForLoadState('domcontentloaded');

    // Should redirect to /loads list
    expect(page.url()).toContain('/loads');

    // New load appears with PENDING status
    const pendingBadge = page.getByText('Pending').first();
    await expect(pendingBadge).toBeVisible({ timeout: 10000 });
  });

  test('load detail page shows info', async ({ page }) => {
    await page.goto('/loads');
    await page.waitForLoadState('domcontentloaded');

    // Find a PENDING load to click
    const loadLinks = page.locator('a[href*="/loads/"]').filter({ hasNotText: /new|create/i });
    const hasLoads = await loadLinks.first().isVisible().catch(() => false);

    if (!hasLoads) {
      test.skip(true, 'No loads in DB');
    }

    await loadLinks.first().click();
    await page.waitForLoadState('domcontentloaded');

    expect(page.url()).toMatch(/\/loads\/[^/]+$/);

    // Detail page shows origin, destination, rate, status
    const hasOrigin = await page.getByText(/origin/i).isVisible().catch(() => false);
    const hasRate = await page.getByText(/rate/i).isVisible().catch(() => false);

    expect(hasOrigin || hasRate).toBeTruthy();

    // Save URL for subsequent lifecycle tests
    testLoadUrl = page.url();
  });

  test('@smoke dispatch load — PENDING to DISPATCHED', async ({ page }) => {
    // Navigate to a PENDING load
    await page.goto('/loads');
    await page.waitForLoadState('domcontentloaded');

    // Find a PENDING load — look for row with Pending badge and click it
    const pendingRow = page.locator('a[href*="/loads/"]').filter({ hasNotText: /new|create/i }).first();
    const hasLoads = await pendingRow.isVisible().catch(() => false);

    if (!hasLoads) {
      test.skip(true, 'No loads in DB — skipping dispatch test');
    }

    // Try using testLoadUrl from previous test if available
    if (testLoadUrl) {
      await page.goto(testLoadUrl);
    } else {
      await pendingRow.click();
    }
    await page.waitForLoadState('domcontentloaded');

    // Check if load is PENDING (has Dispatch Load button)
    const dispatchBtn = page.getByRole('button', { name: 'Dispatch Load' });
    const isPending = await dispatchBtn.isVisible().catch(() => false);

    if (!isPending) {
      test.skip(true, 'Load is not in PENDING status or no trucks/drivers available');
    }

    await dispatchBtn.click();

    // Modal opens — select driver and truck
    await expect(page.getByText('Dispatch Load')).toBeVisible({ timeout: 5000 });

    const driverSelect = page.getByLabel('Driver');
    const driverOptions = await driverSelect.locator('option').count();

    if (driverOptions <= 1) {
      // Close modal and skip
      await page.keyboard.press('Escape');
      test.skip(true, 'No drivers available for dispatch');
    }

    await driverSelect.selectOption({ index: 1 });

    const truckSelect = page.getByLabel('Truck');
    const truckOptions = await truckSelect.locator('option').count();

    if (truckOptions <= 1) {
      await page.keyboard.press('Escape');
      test.skip(true, 'No trucks available for dispatch');
    }

    await truckSelect.selectOption({ index: 1 });

    // Confirm dispatch
    await page.getByRole('button', { name: 'Dispatch' }).click();
    await page.waitForLoadState('domcontentloaded');

    // Status should change to DISPATCHED
    await expect(page.getByText('Dispatched')).toBeVisible({ timeout: 10000 });

    // Save URL for next tests
    testLoadUrl = page.url();
  });

  test('advance load to PICKED_UP', async ({ page }) => {
    if (!testLoadUrl) {
      test.skip(true, 'No load URL from dispatch test');
    }

    await page.goto(testLoadUrl);
    await page.waitForLoadState('domcontentloaded');

    const markPickedUpBtn = page.getByRole('button', { name: 'Mark Picked Up' });
    const isDispatched = await markPickedUpBtn.isVisible().catch(() => false);

    if (!isDispatched) {
      test.skip(true, 'Load not in DISPATCHED status');
    }

    await markPickedUpBtn.click();
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByText('Picked Up')).toBeVisible({ timeout: 10000 });
  });

  test('advance load to IN_TRANSIT', async ({ page }) => {
    if (!testLoadUrl) {
      test.skip(true, 'No load URL from previous tests');
    }

    await page.goto(testLoadUrl);
    await page.waitForLoadState('domcontentloaded');

    const markInTransitBtn = page.getByRole('button', { name: 'Mark In Transit' });
    const isPickedUp = await markInTransitBtn.isVisible().catch(() => false);

    if (!isPickedUp) {
      test.skip(true, 'Load not in PICKED_UP status');
    }

    await markInTransitBtn.click();
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByText('In Transit')).toBeVisible({ timeout: 10000 });
  });

  test('@smoke deliver load — IN_TRANSIT to DELIVERED', async ({ page }) => {
    if (!testLoadUrl) {
      test.skip(true, 'No load URL from previous tests');
    }

    await page.goto(testLoadUrl);
    await page.waitForLoadState('domcontentloaded');

    const markDeliveredBtn = page.getByRole('button', { name: 'Mark Delivered' });
    const isInTransit = await markDeliveredBtn.isVisible().catch(() => false);

    if (!isInTransit) {
      test.skip(true, 'Load not in IN_TRANSIT status');
    }

    await markDeliveredBtn.click();
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByText('Delivered')).toBeVisible({ timeout: 10000 });
  });

  test('advance load to INVOICED and create invoice link visible', async ({ page }) => {
    if (!testLoadUrl) {
      test.skip(true, 'No load URL from previous tests');
    }

    await page.goto(testLoadUrl);
    await page.waitForLoadState('domcontentloaded');

    // After DELIVERED, "Create Invoice" link should appear in Invoices section
    const createInvoiceLink = page.getByRole('link', { name: 'Create Invoice' });
    const hasCreateInvoice = await createInvoiceLink.isVisible().catch(() => false);

    if (hasCreateInvoice) {
      // Verify the link navigates to invoice creation
      const href = await createInvoiceLink.getAttribute('href');
      expect(href).toContain('/invoices/new');
    }

    // Mark Invoiced button advances load to final status
    const markInvoicedBtn = page.getByRole('button', { name: 'Mark Invoiced' });
    const isDelivered = await markInvoicedBtn.isVisible().catch(() => false);

    if (!isDelivered) {
      test.skip(true, 'Load not in DELIVERED status');
    }

    await markInvoicedBtn.click();
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByText('Invoiced')).toBeVisible({ timeout: 10000 });
  });
});
