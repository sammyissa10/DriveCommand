import { test, expect } from '@playwright/test';
import path from 'path';

test.use({ storageState: path.join(__dirname, '../../.playwright/auth/sysadmin.json') });

/**
 * SysAdmin portal — dashboard tests.
 *
 * Covers: TC-SA-DASH-001, TC-SA-DASH-003
 */

test('@smoke dashboard shows metric cards', async ({ page }) => {
  await page.goto('/admin-dashboard');
  await page.waitForLoadState('domcontentloaded');

  // Heading
  await expect(page.getByRole('heading', { name: 'Platform Overview' })).toBeVisible();

  // The 4 metric card labels must be present
  await expect(page.getByText('Total Tenants')).toBeVisible();
  await expect(page.getByText('Active Loads Today')).toBeVisible();
  await expect(page.getByText('New Signups This Week')).toBeVisible();
  await expect(page.getByText('Open Tickets')).toBeVisible();
});

test('dashboard shows quick-nav links', async ({ page }) => {
  await page.goto('/admin-dashboard');
  await page.waitForLoadState('domcontentloaded');

  // Three quick-nav links at the bottom of the dashboard
  await expect(page.getByRole('link', { name: 'Manage Tenants' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Billing' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Support Queue' })).toBeVisible();
});

test('dashboard navigation links work', async ({ page }) => {
  await page.goto('/admin-dashboard');
  await page.waitForLoadState('domcontentloaded');

  // Click the "Tenants" header nav link
  await page.getByRole('navigation').getByRole('link', { name: 'Tenants' }).click();
  await page.waitForLoadState('domcontentloaded');
  expect(page.url()).toContain('/tenants');

  // Navigate back and click Support
  await page.goto('/admin-dashboard');
  await page.waitForLoadState('domcontentloaded');
  await page.getByRole('navigation').getByRole('link', { name: 'Support' }).click();
  await page.waitForLoadState('domcontentloaded');
  expect(page.url()).toContain('/admin-support');

  // Navigate back and click Billing
  await page.goto('/admin-dashboard');
  await page.waitForLoadState('domcontentloaded');
  await page.getByRole('navigation').getByRole('link', { name: 'Billing' }).click();
  await page.waitForLoadState('domcontentloaded');
  expect(page.url()).toContain('/billing');
});
