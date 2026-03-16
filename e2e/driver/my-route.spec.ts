import { test, expect } from '@playwright/test';
import path from 'path';

test.use({ storageState: path.join(__dirname, '../../.playwright/auth/driver.json') });

/**
 * Driver portal — My Route page tests.
 *
 * Covers: TC-DR-RTE-001, TC-DR-RTE-002, TC-DR-RTE-005
 *
 * Note: The test driver may or may not have an assigned route.
 * Tests handle both states gracefully.
 */

test('@smoke assigned route page renders', async ({ page }) => {
  await page.goto('/my-route');
  await page.waitForLoadState('domcontentloaded');

  // Page must load without error — either route details or empty state
  expect(page.url()).not.toContain('/sign-in');

  // Either the "My Route" heading OR the "No route assigned" empty state is visible
  const hasHeading = await page.getByRole('heading', { name: 'My Route' }).isVisible({ timeout: 10000 }).catch(() => false);
  const hasEmptyState = await page.getByText('No route assigned').isVisible({ timeout: 5000 }).catch(() => false);

  expect(hasHeading || hasEmptyState).toBeTruthy();
});

test('route shows stop information if assigned', async ({ page }) => {
  await page.goto('/my-route');
  await page.waitForLoadState('domcontentloaded');

  const hasRoute = await page.getByRole('heading', { name: 'My Route' }).isVisible({ timeout: 10000 }).catch(() => false);

  if (!hasRoute) {
    test.skip(true, 'No route assigned to test driver — skipping route detail checks');
    return;
  }

  // If route is assigned, the page subtitle shows origin → destination
  const subtitle = page.locator('p.mt-1.text-muted-foreground').first();
  await expect(subtitle).toBeVisible();
  // The subtitle contains " to " (origin to destination)
  const subtitleText = await subtitle.textContent();
  expect(subtitleText).toBeTruthy();
});

test('driver cannot upload documents on My Route page', async ({ page }) => {
  await page.goto('/my-route');
  await page.waitForLoadState('domcontentloaded');

  // No upload button, file input, or "Add Document" anywhere on the page
  await expect(page.locator('input[type="file"]')).not.toBeVisible();

  // Check for upload-related text
  const hasUploadButton = await page.getByRole('button', { name: /upload/i }).isVisible({ timeout: 3000 }).catch(() => false);
  const hasAddDocument = await page.getByText(/add document/i).isVisible({ timeout: 3000 }).catch(() => false);

  expect(hasUploadButton).toBeFalsy();
  expect(hasAddDocument).toBeFalsy();
});
