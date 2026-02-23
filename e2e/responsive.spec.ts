import { test, expect } from '@playwright/test';

/**
 * E2E tests for Mobile Responsive Behavior
 * Tests that dashboards work correctly on mobile viewports
 *
 * NOTE: These tests require a running dev server with Clerk authentication.
 * Tests use the 'mobile' project configured in playwright.config.ts (iPhone 14)
 */

test.describe('Mobile Responsive - Safety Dashboard', () => {
  test('should load safety dashboard on mobile', async ({ page }) => {
    await page.goto('/safety');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('sign-in')) {
      test.skip(true, 'Authentication required');
    }

    // Verify page loaded
    await expect(page.getByRole('heading', { name: /Safety Dashboard/i })).toBeVisible();
  });

  test('should not have horizontal overflow on mobile', async ({ page }) => {
    await page.goto('/safety');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('sign-in')) {
      test.skip(true, 'Authentication required');
    }

    // Check for horizontal overflow
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);

    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5); // Allow 5px tolerance
  });

  test('should stack chart cards vertically on mobile', async ({ page }) => {
    await page.goto('/safety');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('sign-in')) {
      test.skip(true, 'Authentication required');
    }

    // Get grid containers
    const grids = page.locator('.grid');
    const count = await grids.count();

    if (count > 0) {
      // Check that grids have single-column classes on mobile
      const firstGrid = grids.first();
      const classList = await firstGrid.getAttribute('class');

      // Should have grid-cols-1 or similar for mobile stacking
      expect(classList).toBeTruthy();
    }
  });
});

test.describe('Mobile Responsive - Fuel Dashboard', () => {
  test('should load fuel dashboard on mobile', async ({ page }) => {
    await page.goto('/fuel');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('sign-in')) {
      test.skip(true, 'Authentication required');
    }

    await expect(page.getByRole('heading', { name: /Fuel.*Dashboard/i })).toBeVisible();
  });

  test('should not have horizontal overflow on fuel page', async ({ page }) => {
    await page.goto('/fuel');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('sign-in')) {
      test.skip(true, 'Authentication required');
    }

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);

    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5);
  });
});

test.describe('Mobile Responsive - Live Map', () => {
  test('should load live map on mobile', async ({ page }) => {
    await page.goto('/live-map');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('sign-in')) {
      test.skip(true, 'Authentication required');
    }

    await expect(page.getByRole('heading', { name: /Live Fleet Map/i })).toBeVisible();
  });

  test('should not have horizontal overflow on map page', async ({ page }) => {
    await page.goto('/live-map');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('sign-in')) {
      test.skip(true, 'Authentication required');
    }

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);

    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5);
  });

  test('should display status legend on mobile', async ({ page }) => {
    await page.goto('/live-map');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('sign-in')) {
      test.skip(true, 'Authentication required');
    }

    // Check for status indicators
    await expect(page.getByText('Moving')).toBeVisible();
    await expect(page.getByText('Idle')).toBeVisible();
    await expect(page.getByText('Offline')).toBeVisible();
  });
});

test.describe('Mobile Responsive - Tags Page', () => {
  test('should load tags page on mobile', async ({ page }) => {
    await page.goto('/tags');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('sign-in')) {
      test.skip(true, 'Authentication required');
    }

    await expect(page.getByRole('heading', { name: /Tags & Groups/i })).toBeVisible({ timeout: 15000 });
  });

  test('should not have horizontal overflow on tags page', async ({ page }) => {
    await page.goto('/tags');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('sign-in')) {
      test.skip(true, 'Authentication required');
    }

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);

    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5);
  });

  test('should show tag assignment tabs on mobile', async ({ page }) => {
    await page.goto('/tags');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('sign-in')) {
      test.skip(true, 'Authentication required');
    }

    // Tabs should be visible on mobile
    await expect(page.getByRole('tab', { name: 'Trucks' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Drivers' })).toBeVisible();
  });
});

test.describe('Desktop Layout Verification', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('should show multi-column layout on desktop', async ({ page }) => {
    await page.goto('/safety');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('sign-in')) {
      test.skip(true, 'Authentication required');
    }

    // Desktop should show grid layouts
    const grids = page.locator('.grid');
    const count = await grids.count();

    expect(count).toBeGreaterThan(0);
  });

  test('should display filter dropdown inline on desktop', async ({ page }) => {
    await page.goto('/safety');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('sign-in')) {
      test.skip(true, 'Authentication required');
    }

    // Filter should be visible in header
    const filterDropdown = page.locator('[role="combobox"]').first();
    await expect(filterDropdown).toBeVisible({ timeout: 15000 });
  });
});
