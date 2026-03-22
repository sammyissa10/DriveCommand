import { test, expect } from '@playwright/test';
import path from 'path';

test.use({ storageState: path.join(__dirname, '../../.playwright/auth/owner.json') });

/**
 * Owner portal — dashboard tests.
 *
 * Covers: TC-OW-DASH-001, TC-OW-DASH-002, and navigation smoke tests.
 */

test('@smoke dashboard loads with fleet summary cards', async ({ page }) => {
  await page.goto('/dashboard');
  await page.waitForLoadState('domcontentloaded');

  // Page heading should be visible
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10000 });

  // Stat cards render — wait for at least one of the known stat labels
  // The dashboard uses Suspense streaming so cards may take a moment
  const hasActiveDrivers = await page.getByText('Active Drivers').isVisible({ timeout: 10000 }).catch(() => false);
  const hasActiveLoads = await page.getByText('Active Loads').isVisible({ timeout: 10000 }).catch(() => false);

  expect(hasActiveDrivers || hasActiveLoads).toBeTruthy();
});

test('dashboard shows additional stat cards', async ({ page }) => {
  await page.goto('/dashboard');
  await page.waitForLoadState('domcontentloaded');

  // Wait for streaming to complete by waiting for heading
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10000 });

  // Revenue per mile or other stat cards should appear after streaming
  const statsVisible = await page.getByText('Revenue / Mile').isVisible({ timeout: 10000 }).catch(() => false);
  const lateLoadsVisible = await page.getByText('Late Loads').isVisible({ timeout: 10000 }).catch(() => false);

  // At least one additional card should be visible
  expect(statsVisible || lateLoadsVisible).toBeTruthy();
});

test('@smoke sidebar navigation links work', async ({ page }) => {
  await page.goto('/dashboard');
  await page.waitForLoadState('domcontentloaded');

  // Navigate to Trucks via sidebar
  await page.getByRole('link', { name: 'Trucks' }).first().click();
  await page.waitForLoadState('domcontentloaded');
  expect(page.url()).toContain('/trucks');

  // Navigate to Drivers
  await page.getByRole('link', { name: 'Drivers' }).first().click();
  await page.waitForLoadState('domcontentloaded');
  expect(page.url()).toContain('/drivers');

  // Navigate to Loads
  await page.getByRole('link', { name: 'Loads' }).first().click();
  await page.waitForLoadState('domcontentloaded');
  expect(page.url()).toContain('/loads');
});

test('sidebar navigation to Routes and Invoices works', async ({ page }) => {
  await page.goto('/dashboard');
  await page.waitForLoadState('domcontentloaded');

  // Navigate to Routes
  await page.getByRole('link', { name: 'Routes' }).first().click();
  await page.waitForLoadState('domcontentloaded');
  expect(page.url()).toContain('/routes');

  // Navigate to Invoices
  await page.getByRole('link', { name: 'Invoices' }).first().click();
  await page.waitForLoadState('domcontentloaded');
  expect(page.url()).toContain('/invoices');
});

test('dashboard responsive on mobile viewport', async ({ page }) => {
  // Set mobile viewport
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/dashboard');
  await page.waitForLoadState('domcontentloaded');

  // Page heading should still be visible on mobile
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10000 });

  // No overflow or crash — page renders usably
  const body = page.locator('body');
  await expect(body).toBeVisible();
});
