import { test, expect } from '@playwright/test';

/**
 * E2E tests for Driver and Route Management pages
 * Tests navigation, forms, validation, and list display
 *
 * NOTE: These tests require a running dev server with Clerk authentication.
 * Run `npm run dev` before running tests.
 * Tests may require manual login or Clerk test mode configuration.
 */

test.describe('Driver Management', () => {
  test('should load drivers page with title', async ({ page }) => {
    await page.goto('/drivers');
    await page.waitForLoadState('networkidle');

    // Skip if auth redirect
    const url = page.url();
    if (url.includes('sign-in') || url.includes('auth')) {
      test.skip(true, 'Authentication required - skipping test');
    }

    // Verify page heading
    await expect(page.getByRole('heading', { name: 'Drivers', level: 1 })).toBeVisible();
  });

  test('should display drivers list or empty state', async ({ page }) => {
    await page.goto('/drivers');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('sign-in') || page.url().includes('auth')) {
      test.skip(true, 'Authentication required - skipping test');
    }

    // Check for either driver table or empty state
    const hasEmptyState = await page.getByText('No drivers yet').isVisible().catch(() => false);
    const hasTable = await page.locator('table').isVisible().catch(() => false);

    expect(hasEmptyState || hasTable).toBeTruthy();
  });

  test('should navigate to invite driver page', async ({ page }) => {
    await page.goto('/drivers');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('sign-in') || page.url().includes('auth')) {
      test.skip(true, 'Authentication required - skipping test');
    }

    // Click Invite Driver button and wait for navigation
    await Promise.all([
      page.waitForURL('**/drivers/invite'),
      page.getByRole('link', { name: /Invite Driver/i }).click(),
    ]);

    // Verify navigation to invite page
    expect(page.url()).toContain('/drivers/invite');

    // Verify form fields are present
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('First Name')).toBeVisible();
    await expect(page.getByLabel('Last Name')).toBeVisible();
    await expect(page.getByLabel(/License Number/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Send Invitation/i })).toBeVisible();
  });

  test('should show validation errors on empty invite form submit', async ({ page }) => {
    await page.goto('/drivers/invite');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('sign-in') || page.url().includes('auth')) {
      test.skip(true, 'Authentication required - skipping test');
    }

    // Try to submit empty form
    await page.getByRole('button', { name: /Send Invitation/i }).click();

    // HTML5 validation should prevent submission (check for :invalid pseudo-class)
    const emailInput = page.getByLabel('Email');
    const isInvalid = await emailInput.evaluate((el) => {
      return (el as HTMLInputElement).validity.valid === false;
    });

    expect(isInvalid).toBeTruthy();
  });

  test('should navigate to driver detail page if drivers exist', async ({ page }) => {
    await page.goto('/drivers');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('sign-in') || page.url().includes('auth')) {
      test.skip(true, 'Authentication required - skipping test');
    }

    // Check if any drivers exist
    const viewLink = page.getByRole('link', { name: 'View' }).first();
    const hasDrivers = await viewLink.isVisible().catch(() => false);

    if (!hasDrivers) {
      test.skip(true, 'No drivers available for detail test');
    }

    // Click first View link
    await viewLink.click();
    await page.waitForLoadState('networkidle');

    // Verify driver detail page loaded
    await expect(page.getByRole('heading', { name: /Driver Information/i })).toBeVisible();
  });
});

test.describe('Route Management', () => {
  test('should load routes page with title', async ({ page }) => {
    await page.goto('/routes');
    await page.waitForLoadState('networkidle');

    const url = page.url();
    if (url.includes('sign-in') || url.includes('auth')) {
      test.skip(true, 'Authentication required - skipping test');
    }

    // Verify page heading
    await expect(page.getByRole('heading', { name: 'Routes', level: 1 })).toBeVisible();
  });

  test('should display routes list or empty state', async ({ page }) => {
    await page.goto('/routes');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('sign-in') || page.url().includes('auth')) {
      test.skip(true, 'Authentication required - skipping test');
    }

    // Check for either route table or empty state
    const hasEmptyState = await page.getByText('No routes found').isVisible().catch(() => false);
    const hasTable = await page.locator('table').isVisible().catch(() => false);

    expect(hasEmptyState || hasTable).toBeTruthy();
  });

  test('should navigate to create route page', async ({ page }) => {
    await page.goto('/routes');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('sign-in') || page.url().includes('auth')) {
      test.skip(true, 'Authentication required - skipping test');
    }

    // Click Create Route button and wait for navigation
    await Promise.all([
      page.waitForURL('**/routes/new'),
      page.getByRole('link', { name: /Create Route/i }).click(),
    ]);

    // Verify navigation to new route page
    expect(page.url()).toContain('/routes/new');

    // Verify form fields are present
    await expect(page.getByLabel('Origin')).toBeVisible();
    await expect(page.getByLabel('Destination')).toBeVisible();
    await expect(page.getByLabel('Scheduled Date')).toBeVisible();
    await expect(page.getByLabel('Driver')).toBeVisible();
    await expect(page.getByLabel('Truck')).toBeVisible();
    await expect(page.getByRole('button', { name: /Create Route/i })).toBeVisible();
  });

  test('should show driver/truck dropdowns on route form', async ({ page }) => {
    await page.goto('/routes/new');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('sign-in') || page.url().includes('auth')) {
      test.skip(true, 'Authentication required - skipping test');
    }

    // Verify driver select exists
    const driverSelect = page.getByLabel('Driver');
    await expect(driverSelect).toBeVisible();

    // Check if it has options or "No drivers available" message
    const driverOptions = await driverSelect.locator('option').count();
    expect(driverOptions).toBeGreaterThan(0);

    // Verify truck select exists
    const truckSelect = page.getByLabel('Truck');
    await expect(truckSelect).toBeVisible();

    // Check if it has options
    const truckOptions = await truckSelect.locator('option').count();
    expect(truckOptions).toBeGreaterThan(0);
  });

  test('should have status filter on routes list', async ({ page }) => {
    await page.goto('/routes');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('sign-in') || page.url().includes('auth')) {
      test.skip(true, 'Authentication required - skipping test');
    }

    // The status filter is a plain <select> element (not a shadcn combobox)
    const selects = page.locator('select');
    const count = await selects.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // Find the select that contains "All Statuses" option
    const statusFilter = page.locator('select').filter({ has: page.locator('option', { hasText: 'All Statuses' }) });
    await expect(statusFilter).toBeVisible();

    const options = await statusFilter.locator('option').allTextContents();
    expect(options).toContain('All Statuses');
    expect(options).toContain('Planned');
  });

  test('should navigate to route detail page if routes exist', async ({ page }) => {
    await page.goto('/routes');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('sign-in') || page.url().includes('auth')) {
      test.skip(true, 'Authentication required - skipping test');
    }

    // Check if any routes exist
    const viewLink = page.getByRole('link', { name: 'View' }).first();
    const hasRoutes = await viewLink.isVisible().catch(() => false);

    if (!hasRoutes) {
      test.skip(true, 'No routes available for detail test');
    }

    // Click first View link
    await viewLink.click();
    await page.waitForLoadState('networkidle');

    // Verify route detail page loaded (should have heading with route info or "Route Details")
    const hasHeading = await page.getByRole('heading', { level: 1 }).isVisible();
    expect(hasHeading).toBeTruthy();
  });
});
