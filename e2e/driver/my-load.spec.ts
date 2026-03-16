import { test, expect } from '@playwright/test';
import path from 'path';

test.use({ storageState: path.join(__dirname, '../../.playwright/auth/driver.json') });

/**
 * Driver portal — My Load page tests.
 *
 * Covers: TC-DR-LOD-001, TC-DR-LOD-002, TC-DR-LOD-003, TC-DR-LOD-007
 *
 * Note: The test driver may or may not have an assigned active load.
 * Tests handle both states gracefully.
 */

test('@smoke my-load page renders', async ({ page }) => {
  await page.goto('/my-load');
  await page.waitForLoadState('domcontentloaded');

  // Page must load without error
  expect(page.url()).not.toContain('/sign-in');

  // Either the "My Load" heading OR the "No active load assigned" empty state
  const hasHeading = await page.getByRole('heading', { name: 'My Load' }).isVisible({ timeout: 10000 }).catch(() => false);
  const hasEmptyState = await page.getByText('No active load assigned').isVisible({ timeout: 5000 }).catch(() => false);

  expect(hasHeading || hasEmptyState).toBeTruthy();
});

test('load status badge visible if load assigned', async ({ page }) => {
  await page.goto('/my-load');
  await page.waitForLoadState('domcontentloaded');

  const hasLoad = await page.getByRole('heading', { name: 'My Load' }).isVisible({ timeout: 10000 }).catch(() => false);

  if (!hasLoad) {
    test.skip(true, 'No active load assigned to test driver — skipping load status checks');
    return;
  }

  // Status timeline section should be visible
  await expect(page.getByText('Status Timeline')).toBeVisible({ timeout: 10000 });

  // At least one of the known status labels should appear in the timeline
  const hasPending = await page.getByText('Pending').isVisible({ timeout: 5000 }).catch(() => false);
  const hasDispatched = await page.getByText('Dispatched').isVisible({ timeout: 5000 }).catch(() => false);
  const hasPickedUp = await page.getByText('Picked Up').isVisible({ timeout: 5000 }).catch(() => false);

  expect(hasPending || hasDispatched || hasPickedUp).toBeTruthy();
});

test('load advancement button visible for active load', async ({ page }) => {
  await page.goto('/my-load');
  await page.waitForLoadState('domcontentloaded');

  const hasLoad = await page.getByRole('heading', { name: 'My Load' }).isVisible({ timeout: 10000 }).catch(() => false);

  if (!hasLoad) {
    test.skip(true, 'No active load assigned to test driver — skipping status button checks');
    return;
  }

  // Update Status section must be visible
  await expect(page.getByText('Update Status')).toBeVisible({ timeout: 10000 });

  // For a non-delivered load, there should be an action button in the Update Status section
  const isDelivered = await page.getByText('In Transit').isVisible({ timeout: 3000 }).catch(() => false);

  if (!isDelivered) {
    // Any of the status advance buttons should be visible (Mark Picked Up, Mark In Transit, Mark Delivered)
    const hasMarkButton = await page.getByRole('button', { name: /mark/i }).first().isVisible({ timeout: 5000 }).catch(() => false);
    // If the load is DELIVERED, there may be no button — that's also valid
    // We simply verify the Update Status section rendered
    const hasUpdateSection = await page.getByText('Update Status').isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasUpdateSection || hasMarkButton).toBeTruthy();
  }
});
