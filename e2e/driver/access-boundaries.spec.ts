import { test, expect } from '@playwright/test';
import path from 'path';

const DRIVER_AUTH = path.join(__dirname, '../../.playwright/auth/driver.json');
const OWNER_AUTH = path.join(__dirname, '../../.playwright/auth/owner.json');
const SYSADMIN_AUTH = path.join(__dirname, '../../.playwright/auth/sysadmin.json');

/**
 * Cross-role access boundary tests.
 *
 * Verifies that each role CANNOT access the other portals' routes.
 *
 * Covers: TC-DR-SEC-001 → TC-DR-SEC-004 (driver blocked from owner routes)
 *         Owner → admin route isolation
 *         Sysadmin → owner route isolation
 */

// --- Driver attempting owner routes ---

test.describe('Driver cannot access owner portal routes', () => {
  test.use({ storageState: DRIVER_AUTH });

  test('@smoke driver cannot access /dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');

    // Middleware redirects DRIVER away from owner paths to /my-route
    expect(page.url()).not.toContain('/dashboard');
    // Should end up at /my-route or /sign-in
    const redirectedToDriverHome = page.url().includes('/my-route');
    const redirectedToSignIn = page.url().includes('/sign-in');
    expect(redirectedToDriverHome || redirectedToSignIn).toBeTruthy();
  });

  test('driver cannot access /trucks', async ({ page }) => {
    await page.goto('/trucks');
    await page.waitForLoadState('domcontentloaded');

    expect(page.url()).not.toContain('/trucks');
    const redirectedCorrectly = page.url().includes('/my-route') || page.url().includes('/sign-in');
    expect(redirectedCorrectly).toBeTruthy();
  });

  test('driver cannot access /loads', async ({ page }) => {
    await page.goto('/loads');
    await page.waitForLoadState('domcontentloaded');

    expect(page.url()).not.toContain('/loads');
    const redirectedCorrectly = page.url().includes('/my-route') || page.url().includes('/sign-in');
    expect(redirectedCorrectly).toBeTruthy();
  });
});

// --- Driver attempting sysadmin routes ---

test.describe('Driver cannot access sysadmin routes', () => {
  test.use({ storageState: DRIVER_AUTH });

  test('driver cannot access /admin-dashboard', async ({ page }) => {
    await page.goto('/admin-dashboard');
    await page.waitForLoadState('domcontentloaded');

    // Should redirect to sign-in or my-route — not render the admin dashboard
    expect(page.url()).not.toContain('/admin-dashboard');
  });
});

// --- Owner attempting sysadmin routes ---

test.describe('Owner cannot access sysadmin routes', () => {
  test.use({ storageState: OWNER_AUTH });

  test('owner cannot access /admin-dashboard', async ({ page }) => {
    await page.goto('/admin-dashboard');
    await page.waitForLoadState('domcontentloaded');

    // Middleware redirects non-admins away from admin paths
    expect(page.url()).not.toContain('/admin-dashboard');
  });
});

// --- Sysadmin attempting owner routes ---

test.describe('Sysadmin behavior on owner routes', () => {
  test.use({ storageState: SYSADMIN_AUTH });

  test('sysadmin accessing /dashboard is redirected away from owner portal', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');

    // Sysadmin middleware restricts them to admin paths only — redirects to /admin-support
    // In all cases, they should NOT see the owner dashboard
    expect(page.url()).not.toContain('/dashboard');
  });
});
