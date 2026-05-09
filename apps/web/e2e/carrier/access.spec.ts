import { test, expect } from '@playwright/test';
import path from 'path';

// ---------------------------------------------------------------------------
// Driver role — should be blocked from all /carrier/* routes
//
// CarrierLayout redirects DRIVER role to /my-route (confirmed in layout.tsx).
// The parent (owner)/layout.tsx also blocks non-owner roles to /unauthorized,
// but CarrierLayout fires first and redirects drivers specifically to /my-route.
// ---------------------------------------------------------------------------

test.describe('Carrier Access — Driver role blocked', () => {
  test.use({ storageState: path.join(__dirname, '../../.playwright/auth/driver.json') });

  test('@smoke driver cannot access /carrier/dashboard', async ({ page }) => {
    await page.goto('/carrier/dashboard');
    await page.waitForLoadState('domcontentloaded');
    // Driver redirected to /my-route or /unauthorized — NOT staying on /carrier/dashboard
    expect(page.url()).not.toContain('/carrier/dashboard');
  });

  test('driver cannot access /carrier/dispatches', async ({ page }) => {
    await page.goto('/carrier/dispatches');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).not.toContain('/carrier/dispatches');
  });

  test('driver cannot access /carrier/loads', async ({ page }) => {
    await page.goto('/carrier/loads');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).not.toContain('/carrier/loads');
  });

  test('driver cannot access /carrier/fleet/drivers', async ({ page }) => {
    await page.goto('/carrier/fleet/drivers');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).not.toContain('/carrier/fleet/drivers');
  });

  test('driver cannot access /carrier/reports/driver-pay', async ({ page }) => {
    await page.goto('/carrier/reports/driver-pay');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).not.toContain('/carrier/reports/driver-pay');
  });
});

// ---------------------------------------------------------------------------
// Unauthenticated users — should be redirected to /login
//
// (owner)/layout.tsx calls getSession() and redirects to /login when no session.
// ---------------------------------------------------------------------------

test.describe('Carrier Access — Unauthenticated', () => {
  test('@smoke unauthenticated user redirected from /carrier/dashboard', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    await page.goto('/carrier/dashboard');
    await page.waitForLoadState('domcontentloaded');
    // Must redirect to /login (the app's auth redirect target)
    expect(page.url()).toMatch(/\/login/);
    await ctx.close();
  });

  test('unauthenticated user redirected from /carrier/dispatches', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    await page.goto('/carrier/dispatches');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toMatch(/\/login/);
    await ctx.close();
  });

  test('unauthenticated user redirected from /carrier/reports/revenue', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    await page.goto('/carrier/reports/revenue');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toMatch(/\/login/);
    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// Owner role — positive control: should be allowed on all carrier routes
// ---------------------------------------------------------------------------

test.describe('Carrier Access — Owner allowed', () => {
  test.use({ storageState: path.join(__dirname, '../../.playwright/auth/owner.json') });

  test('@smoke owner can access /carrier/dashboard', async ({ page }) => {
    await page.goto('/carrier/dashboard');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('/carrier/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('owner can access /carrier/dispatches', async ({ page }) => {
    await page.goto('/carrier/dispatches');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('/carrier/dispatches');
  });

  test('owner can access /carrier/reports/driver-pay', async ({ page }) => {
    await page.goto('/carrier/reports/driver-pay');
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/carrier/reports/driver-pay');
  });
});
