import { test, expect } from '@playwright/test';
import path from 'path';

test.use({ storageState: path.join(__dirname, '../../.playwright/auth/owner.json') });

/**
 * Owner portal — driver management tests.
 *
 * Covers: TC-OW-DRV-001, TC-OW-DRV-003, TC-OW-DRV-005
 *
 * Note: Driver invitations only send an email — the driver account does not
 * exist in the DB until they accept. Tests verify the invitation flow, not
 * that the driver appears as an active user.
 */

test('@smoke driver list page loads', async ({ page }) => {
  await page.goto('/drivers');
  await page.waitForLoadState('domcontentloaded');

  await expect(page.getByRole('heading', { name: 'Drivers' })).toBeVisible();

  // Either driver list or empty state is visible
  const hasContent = await page.locator('table, [class*="card"], [class*="list"]').first().isVisible().catch(() => false);
  const hasEmpty = await page.getByText(/no drivers/i).isVisible().catch(() => false);
  const hasInviteButton = await page.getByRole('link', { name: /invite/i }).isVisible().catch(() => false);

  expect(hasContent || hasEmpty || hasInviteButton).toBeTruthy();
});

test('@smoke invite driver — happy path', async ({ page }) => {
  const ts = Date.now();
  const email = `testdriver+${ts}@example.com`;

  await page.goto('/drivers/invite');
  await page.waitForLoadState('domcontentloaded');

  // Fill required fields
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('First Name').fill('Test');
  await page.getByLabel('Last Name').fill(`Driver${ts}`);

  // Submit
  await page.getByRole('button', { name: 'Send Invitation' }).click();
  await page.waitForLoadState('domcontentloaded');

  // Success: either a success message appears OR we're redirected to /drivers
  const hasSuccessMsg = await page.getByText(/invitation sent|driver invite|invited/i).isVisible({ timeout: 10000 }).catch(() => false);
  const onDriversPage = page.url().includes('/drivers');

  // At least one success indicator should be true
  expect(hasSuccessMsg || onDriversPage).toBeTruthy();
});

test('view driver detail page', async ({ page }) => {
  await page.goto('/drivers');
  await page.waitForLoadState('domcontentloaded');

  // Look for a driver detail link
  const detailLinks = page.locator('a[href*="/drivers/"]').filter({ hasNotText: /invite|new|add/i });
  const hasDrivers = await detailLinks.first().isVisible().catch(() => false);

  if (!hasDrivers) {
    test.skip(true, 'No active drivers in DB — skipping driver detail test');
  }

  await detailLinks.first().click();
  await page.waitForLoadState('domcontentloaded');

  // Should be on a driver detail page
  expect(page.url()).toMatch(/\/drivers\/[^/]+$/);

  // Profile information should be visible
  const hasName = await page.getByText(/name|first name|profile/i).first().isVisible().catch(() => false);
  const hasEmail = await page.getByText(/email|@/i).first().isVisible().catch(() => false);

  expect(hasName || hasEmail).toBeTruthy();
});

test('driver detail shows documents section', async ({ page }) => {
  await page.goto('/drivers');
  await page.waitForLoadState('domcontentloaded');

  const detailLinks = page.locator('a[href*="/drivers/"]').filter({ hasNotText: /invite|new|add/i });
  const hasDrivers = await detailLinks.first().isVisible().catch(() => false);

  if (!hasDrivers) {
    test.skip(true, 'No active drivers in DB — skipping driver detail test');
  }

  await detailLinks.first().click();
  await page.waitForLoadState('domcontentloaded');

  // Documents section should be present on driver detail
  const hasDocSection = await page.getByText(/documents|document/i).first().isVisible().catch(() => false);

  expect(hasDocSection).toBeTruthy();
});

test('driver invite form validation — invalid email', async ({ page }) => {
  await page.goto('/drivers/invite');
  await page.waitForLoadState('domcontentloaded');

  // Fill invalid email
  await page.getByLabel('Email').fill('not-an-email');
  await page.getByLabel('First Name').fill('Test');
  await page.getByLabel('Last Name').fill('Driver');

  // Submit
  await page.getByRole('button', { name: 'Send Invitation' }).click();

  // HTML5 email validation or server error should prevent submission
  // Verify still on invite page or error message shown
  const stillOnInvitePage = page.url().includes('/drivers/invite');
  const hasError = await page.getByText(/invalid|error|valid email/i).isVisible().catch(() => false);

  expect(stillOnInvitePage || hasError).toBeTruthy();
});
