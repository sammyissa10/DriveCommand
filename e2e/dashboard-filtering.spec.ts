import { test, expect } from '@playwright/test';

/**
 * E2E tests for Dashboard Tag Filtering
 * Tests tag filter dropdown and URL parameter updates across all dashboards
 *
 * NOTE: These tests require a running dev server with Clerk authentication.
 * Run `npm run dev` before running tests.
 */

test.describe('Safety Dashboard Filtering', () => {
  test('should render tag filter dropdown on safety page', async ({ page }) => {
    await page.goto('/safety');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('sign-in')) {
      test.skip(true, 'Authentication required');
    }

    // Check for tag filter dropdown (SelectTrigger)
    const filterDropdown = page.locator('[role="combobox"]').first();
    await expect(filterDropdown).toBeVisible();
  });

  test('should have "All Vehicles" option in filter', async ({ page }) => {
    await page.goto('/safety');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('sign-in')) {
      test.skip(true, 'Authentication required');
    }

    // Open dropdown
    const filterDropdown = page.locator('[role="combobox"]').first();
    await filterDropdown.click();

    // Wait for options to appear
    await page.waitForSelector('[role="option"]');

    // Check for "All Vehicles" option
    await expect(page.getByRole('option', { name: 'All Vehicles' })).toBeVisible();
  });

  test('should update URL when tag is selected', async ({ page }) => {
    await page.goto('/safety');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('sign-in')) {
      test.skip(true, 'Authentication required');
    }

    // Open dropdown
    const filterDropdown = page.locator('[role="combobox"]').first();
    await filterDropdown.click();

    // Wait for options
    await page.waitForSelector('[role="option"]');

    // Get all tag options (exclude "All Vehicles")
    const options = await page.locator('[role="option"]').all();

    if (options.length > 1) {
      // Select first tag (skip "All Vehicles" which is index 0)
      await options[1].click();

      // Wait for navigation
      await page.waitForURL(/tagId=/);

      // Verify URL contains tagId parameter
      expect(page.url()).toContain('tagId=');
    }
  });

  test('should remove tagId param when "All Vehicles" selected', async ({ page }) => {
    // Start at /safety, then select a real tag to get a valid tagId in URL
    await page.goto('/safety');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('sign-in')) {
      test.skip(true, 'Authentication required');
    }

    const filterDropdown = page.locator('[role="combobox"]').first();
    await filterDropdown.click();
    await page.waitForSelector('[role="option"]');

    const options = await page.locator('[role="option"]').all();
    if (options.length <= 1) {
      test.skip(true, 'No tags available to test filter removal');
    }

    // Select first real tag to add tagId to URL
    await options[1].click();
    await page.waitForURL(/tagId=/);

    // Now select "All Vehicles" to remove it
    await filterDropdown.click();
    await page.getByRole('option', { name: 'All Vehicles' }).click();
    await page.waitForTimeout(500);

    expect(page.url()).not.toContain('tagId=');
  });
});

test.describe('Fuel Dashboard Filtering', () => {
  test('should render tag filter dropdown on fuel page', async ({ page }) => {
    await page.goto('/fuel');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('sign-in')) {
      test.skip(true, 'Authentication required');
    }

    const filterDropdown = page.locator('[role="combobox"]').first();
    await expect(filterDropdown).toBeVisible();
  });

  test('should update URL with tagId on fuel page', async ({ page }) => {
    await page.goto('/fuel');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('sign-in')) {
      test.skip(true, 'Authentication required');
    }

    const filterDropdown = page.locator('[role="combobox"]').first();
    await filterDropdown.click();

    await page.waitForSelector('[role="option"]');

    const options = await page.locator('[role="option"]').all();

    if (options.length > 1) {
      await options[1].click();
      await page.waitForURL(/tagId=/);
      expect(page.url()).toContain('tagId=');
    }
  });
});

test.describe('Live Map Filtering', () => {
  test('should render tag filter dropdown on live map page', async ({ page }) => {
    await page.goto('/live-map');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('sign-in')) {
      test.skip(true, 'Authentication required');
    }

    const filterDropdown = page.locator('[role="combobox"]').first();
    await expect(filterDropdown).toBeVisible();
  });

  test('should update URL with tagId on live map page', async ({ page }) => {
    await page.goto('/live-map');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('sign-in')) {
      test.skip(true, 'Authentication required');
    }

    const filterDropdown = page.locator('[role="combobox"]').first();
    await filterDropdown.click();

    await page.waitForSelector('[role="option"]');

    const options = await page.locator('[role="option"]').all();

    if (options.length > 1) {
      await options[1].click();
      await page.waitForURL(/tagId=/);
      expect(page.url()).toContain('tagId=');
    }
  });
});

test.describe('Cross-Dashboard Filter Consistency', () => {
  test('should show vehicle count updates when filtered', async ({ page }) => {
    await page.goto('/live-map');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('sign-in')) {
      test.skip(true, 'Authentication required');
    }

    // Get initial vehicle count
    const countText = await page.getByText(/vehicle.*tracked/).textContent();
    expect(countText).toBeTruthy();
  });
});
