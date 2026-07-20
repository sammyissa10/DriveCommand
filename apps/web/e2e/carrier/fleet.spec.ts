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

  // TKT-0073 — "View" (and the driver-name link) previously dropped the user
  // straight into an editable form. The detail page must open READ-ONLY, with
  // the form gated behind an Edit toggle (mirrors the truck detail pattern).
  test('view driver detail opens read-only; Edit toggle reveals form (TKT-0073)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Desktop view/edit toggle only');

    const listRes = await page.request.get('/api/v1/carrier/fleet/drivers?pageSize=1');
    expect(listRes.ok()).toBeTruthy();
    const { data } = await listRes.json();
    const items = data?.items ?? [];
    test.skip(items.length === 0, 'No drivers to view');
    const driverId = items[0].id;

    // Open the detail page in VIEW mode (no ?mode=edit) — as the "View" action does.
    await page.goto(`/carrier/fleet/drivers/${driverId}`);
    await page.waitForLoadState('networkidle');

    // Scope to the desktop page body (excludes the mobile DOM copy + breadcrumb).
    const desktop = page.locator('div.hidden.lg\\:block.space-y-6').first();

    // View mode: read-only prompt shown, form fields absent.
    await expect(desktop.getByText(/Review this driver/i)).toBeVisible();
    await expect(desktop.getByLabel(/First Name/i)).toHaveCount(0);

    // Pressing Edit reveals the form.
    await desktop.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(desktop.getByLabel(/First Name/i)).toBeVisible();
    await expect(desktop.getByRole('button', { name: /Save Changes/i })).toBeVisible();
  });

  // TKT-0073 — the grid "Edit" quick action deep-links to ?mode=edit, which
  // must open the form immediately (no extra click).
  test('driver detail ?mode=edit opens the form directly (TKT-0073)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Desktop view/edit toggle only');

    const listRes = await page.request.get('/api/v1/carrier/fleet/drivers?pageSize=1');
    expect(listRes.ok()).toBeTruthy();
    const { data } = await listRes.json();
    const items = data?.items ?? [];
    test.skip(items.length === 0, 'No drivers');
    const driverId = items[0].id;

    await page.goto(`/carrier/fleet/drivers/${driverId}?mode=edit`);
    await page.waitForLoadState('networkidle');

    const desktop = page.locator('div.hidden.lg\\:block.space-y-6').first();
    await expect(desktop.getByLabel(/First Name/i)).toBeVisible();
    await expect(desktop.getByRole('button', { name: /Save Changes/i })).toBeVisible();
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

  // Regression: TKT-0081 — editing an existing truck's type to one of the
  // van/pickup/car options used to 400 ("system error") because the PATCH
  // schema enum was missing them. Editing to "Sprinter Van" must now succeed.
  test('@smoke edit truck type to Sprinter Van persists (TKT-0081)', async ({ page }, testInfo) => {
    // The inline edit form (#truckType) lives in the desktop (lg:block) detail view.
    test.skip(testInfo.project.name === 'mobile', 'Desktop inline edit form only');

    // Find a truck to edit via the list API.
    const listRes = await page.request.get('/api/v1/carrier/fleet/trucks?pageSize=1');
    expect(listRes.ok()).toBeTruthy();
    const { data } = await listRes.json();
    const items = data?.items ?? [];
    test.skip(items.length === 0, 'No trucks in system to edit');
    const truckId = items[0].id;

    // Open the detail page directly in edit mode.
    await page.goto(`/carrier/fleet/trucks/${truckId}?mode=edit`);
    await page.waitForLoadState('domcontentloaded');

    // The page renders both a mobile (lg:hidden) and desktop (hidden lg:block)
    // copy of the form in the DOM; on the desktop viewport only the desktop copy
    // is visible. Scope to visible elements to avoid strict-mode ambiguity.
    // Change truck type to Sprinter Van (the value that previously 400'd on save).
    await page.locator('#truckType:visible').click();
    await page.getByRole('option', { name: 'Sprinter Van', exact: true }).click();

    await page.getByRole('button', { name: /Save Changes/i }).and(page.locator(':visible')).click();

    // Success toast — was "Failed to save truck" before the enum fix.
    await expect(page.getByText(/Truck updated/i)).toBeVisible({ timeout: 10000 });

    // And it must actually persist server-side.
    const verify = await page.request.get(`/api/v1/carrier/fleet/trucks/${truckId}`);
    expect(verify.ok()).toBeTruthy();
    const verifyBody = await verify.json();
    expect(verifyBody.data.truckType).toBe('sprinter_van');
  });

  // Regression: TKT-0080 — the carrier breadcrumb linked every intermediate
  // segment, but "fleet" is a grouping folder with no page.tsx, so clicking the
  // "Fleet" crumb 404'd. Grouping segments must render as plain text, while real
  // pages ("Carrier", "Trucks") stay as working links.
  test('breadcrumb does not 404 on grouping segments (TKT-0080)', async ({ page }, testInfo) => {
    // The carrier breadcrumb is desktop-only (hidden lg:block in the layout).
    test.skip(testInfo.project.name === 'mobile', 'Breadcrumb is desktop-only');

    const listRes = await page.request.get('/api/v1/carrier/fleet/trucks?pageSize=1');
    expect(listRes.ok()).toBeTruthy();
    const { data } = await listRes.json();
    const items = data?.items ?? [];
    test.skip(items.length === 0, 'No trucks to view');
    const truckId = items[0].id;

    await page.goto(`/carrier/fleet/trucks/${truckId}`);
    await page.waitForLoadState('domcontentloaded');

    const crumb = page.getByRole('navigation', { name: 'Breadcrumb' }).first();
    await expect(crumb).toBeVisible();

    // "Fleet" is a grouping folder with no page — must NOT be a link (would 404).
    await expect(crumb.getByRole('link', { name: 'Fleet' })).toHaveCount(0);
    await expect(crumb.getByText('Fleet', { exact: true })).toBeVisible();

    // "Carrier" and "Trucks" are real pages — must be working links.
    await expect(crumb.getByRole('link', { name: 'Carrier' })).toHaveAttribute(
      'href',
      '/carrier/dashboard'
    );
    const trucksLink = crumb.getByRole('link', { name: 'Trucks' });
    await expect(trucksLink).toHaveAttribute('href', '/carrier/fleet/trucks');

    // Clicking a real crumb navigates without a 404.
    await trucksLink.click();
    await page.waitForURL('**/carrier/fleet/trucks');
    await expect(page.getByRole('heading', { name: /Trucks/i })).toBeVisible();
  });

  // TKT-0082 — the audit footer's "Last updated" time appeared frozen because
  // the underlying save was erroring out (TKT-0081). With saves working, a
  // successful edit must advance "Last updated" to a fresh relative time. This
  // guards the audit trail against silently dropping the last-update timestamp.
  test('audit trail records a fresh Last updated time after edit (TKT-0082)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Desktop inline edit form + audit footer');

    const listRes = await page.request.get('/api/v1/carrier/fleet/trucks?pageSize=1');
    expect(listRes.ok()).toBeTruthy();
    const { data } = await listRes.json();
    const items = data?.items ?? [];
    test.skip(items.length === 0, 'No trucks to edit');
    const truckId = items[0].id;

    // Edit a harmless field (notes) so updatedAt advances.
    await page.goto(`/carrier/fleet/trucks/${truckId}?mode=edit`);
    await page.waitForLoadState('domcontentloaded');
    await page.locator('#truckNotes:visible').fill(`audit check ${Date.now()}`);
    await page.getByRole('button', { name: /Save Changes/i }).and(page.locator(':visible')).click();
    await expect(page.getByText(/Truck updated/i)).toBeVisible({ timeout: 10000 });

    // Reload the read view and assert the "Last updated" line shows a fresh time.
    await page.goto(`/carrier/fleet/trucks/${truckId}`);
    await page.waitForLoadState('domcontentloaded');
    const lastUpdated = page.locator('p', { hasText: 'Last updated' }).filter({ has: page.locator(':visible') }).first();
    await expect(lastUpdated).toBeVisible();
    await expect(lastUpdated).toContainText(/just now|second|1 minute/i);
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
