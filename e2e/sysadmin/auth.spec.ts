import { test, expect } from '@playwright/test';
import path from 'path';

test.use({ storageState: path.join(__dirname, '../../.playwright/auth/sysadmin.json') });

/**
 * SysAdmin portal — authentication boundary tests.
 *
 * Covers: TC-SA-AUTH-001, TC-SA-AUTH-004, TC-SA-AUTH-006
 */

test('@smoke sysadmin can access admin dashboard', async ({ page }) => {
  await page.goto('/admin-dashboard');
  await page.waitForLoadState('domcontentloaded');

  // Must not be redirected to sign-in
  expect(page.url()).not.toContain('/sign-in');

  // The admin header nav must be visible
  await expect(page.getByRole('link', { name: 'Tenants' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Support' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Billing' })).toBeVisible();

  // Dashboard heading
  await expect(page.getByRole('heading', { name: 'Platform Overview' })).toBeVisible();
});

test('unauthenticated user is redirected from admin routes', async ({ browser }) => {
  // Use a fresh context with no auth cookies
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();

  await page.goto('/admin-dashboard');
  await page.waitForLoadState('domcontentloaded');

  // Must be redirected to sign-in
  expect(page.url()).toContain('/sign-in');

  await ctx.close();
});

test('non-admin (owner) user is redirected from admin routes', async ({ browser }) => {
  // Use owner storage state — owner is NOT isSystemAdmin
  const ctx = await browser.newContext({
    storageState: path.join(__dirname, '../../.playwright/auth/owner.json'),
  });
  const page = await ctx.newPage();

  await page.goto('/admin-dashboard');
  await page.waitForLoadState('domcontentloaded');

  // Middleware redirects non-admins away from admin paths — they go to /admin-support or sign-in
  // Either way, they should NOT see the admin dashboard
  expect(page.url()).not.toContain('/admin-dashboard');

  await ctx.close();
});
