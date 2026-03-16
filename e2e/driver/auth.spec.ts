import { test, expect } from '@playwright/test';
import path from 'path';

test.use({ storageState: path.join(__dirname, '../../.playwright/auth/driver.json') });

/**
 * Driver portal — authentication boundary tests.
 *
 * Covers: TC-DR-AUTH-001 (smoke), TC-DR-AUTH-003, TC-DR-AUTH-005
 */

test('@smoke driver can access my-route page', async ({ page }) => {
  await page.goto('/my-route');
  await page.waitForLoadState('domcontentloaded');

  // Must not be redirected away
  expect(page.url()).not.toContain('/sign-in');

  // Driver bottom navigation must be visible (aria-label set on the nav element)
  await expect(page.getByRole('navigation', { name: 'Driver navigation' })).toBeVisible({ timeout: 10000 });

  // At least one driver nav link should be present
  const hasRoute = await page.getByRole('link', { name: 'Route' }).first().isVisible({ timeout: 5000 }).catch(() => false);
  const hasLoad = await page.getByRole('link', { name: 'Load' }).first().isVisible({ timeout: 5000 }).catch(() => false);
  expect(hasRoute || hasLoad).toBeTruthy();
});

test('driver root URL redirects to /my-route', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  // Root URL should redirect driver to /my-route
  expect(page.url()).toContain('/my-route');
});

test('unauthenticated user cannot access driver pages', async ({ browser }) => {
  // Use a fresh context with no auth cookies
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();

  await page.goto('/my-route');
  await page.waitForLoadState('domcontentloaded');

  // Must be redirected to sign-in
  expect(page.url()).toContain('/sign-in');

  await ctx.close();
});

test('driver does not see owner sidebar', async ({ page }) => {
  await page.goto('/my-route');
  await page.waitForLoadState('domcontentloaded');

  // Owner sidebar navigation items should NOT be visible for a driver
  // These links only appear in the owner portal sidebar
  await expect(page.getByRole('link', { name: 'Trucks' })).not.toBeVisible();
  await expect(page.getByRole('link', { name: 'Drivers' })).not.toBeVisible();
  await expect(page.getByRole('link', { name: 'Routes' })).not.toBeVisible();
});
