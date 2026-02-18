import { test, expect } from '@playwright/test';

/**
 * E2E tests for Tag Management page
 * Tests tag CRUD operations and assignment functionality
 *
 * NOTE: These tests require a running dev server with Clerk authentication.
 * Run `npm run dev` before running tests.
 * Tests may require manual login or Clerk test mode configuration.
 */

test.describe('Tag Management', () => {
  test('should load tags page with title', async ({ page }) => {
    await page.goto('/tags');

    // Wait for page to load (may require auth)
    await page.waitForLoadState('networkidle');

    // Check if redirected to auth or page loaded
    const url = page.url();
    if (url.includes('sign-in') || url.includes('auth')) {
      test.skip(true, 'Authentication required - skipping test');
    }

    // Verify page title
    await expect(page.getByRole('heading', { name: 'Tags & Groups', level: 1 })).toBeVisible();
  });

  test('should display existing tags or empty state', async ({ page }) => {
    await page.goto('/tags');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('sign-in')) {
      test.skip(true, 'Authentication required');
    }

    // Check for either existing tags or empty state message
    const hasEmptyState = await page.getByText('No tags created yet').isVisible().catch(() => false);
    const hasTags = await page.locator('[data-testid="tag-badge"]').count().catch(() => 0) > 0;

    expect(hasEmptyState || hasTags).toBeTruthy();
  });

  test('should show create tag form', async ({ page }) => {
    await page.goto('/tags');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('sign-in')) {
      test.skip(true, 'Authentication required');
    }

    // Verify create form elements
    await expect(page.getByLabel('Tag Name')).toBeVisible();
    await expect(page.getByRole('button', { name: /Create Tag/i })).toBeVisible();
  });

  test('should display tabs for Trucks and Drivers assignment', async ({ page }) => {
    await page.goto('/tags');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('sign-in')) {
      test.skip(true, 'Authentication required');
    }

    // Check for assignment tabs
    await expect(page.getByRole('tab', { name: 'Trucks' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Drivers' })).toBeVisible();
  });

  test('should switch between Trucks and Drivers tabs', async ({ page }) => {
    await page.goto('/tags');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('sign-in')) {
      test.skip(true, 'Authentication required');
    }

    // Click Drivers tab
    await page.getByRole('tab', { name: 'Drivers' }).click();

    // Verify tab content changed (wait for tab panel)
    await expect(page.getByRole('tabpanel')).toBeVisible();

    // Click back to Trucks tab
    await page.getByRole('tab', { name: 'Trucks' }).click();
    await expect(page.getByRole('tabpanel')).toBeVisible();
  });
});

test.describe('Tag CRUD Operations', () => {
  test('should have color selection buttons', async ({ page }) => {
    await page.goto('/tags');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('sign-in')) {
      test.skip(true, 'Authentication required');
    }

    // Check for color picker buttons (8 preset colors)
    // HTML converts camelCase backgroundColor to kebab-case background-color
    const colorButtons = page.locator('button[type="button"][style*="background-color"]');
    const count = await colorButtons.count();

    expect(count).toBeGreaterThanOrEqual(8);
  });

  test('should disable create button when name is empty', async ({ page }) => {
    await page.goto('/tags');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('sign-in')) {
      test.skip(true, 'Authentication required');
    }

    const createButton = page.getByRole('button', { name: /Create Tag/i });

    // Button should be disabled initially (no name entered)
    await expect(createButton).toBeDisabled();
  });
});
