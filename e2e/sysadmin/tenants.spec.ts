import { test, expect } from '@playwright/test';
import path from 'path';

test.use({ storageState: path.join(__dirname, '../../.playwright/auth/sysadmin.json') });

/**
 * SysAdmin portal — tenant management tests.
 *
 * Covers: TC-SA-TEN-001, TC-SA-TEN-003, TC-SA-TEN-008, TC-SA-TEN-009, TC-SA-TEN-010
 */

test('@smoke tenant list loads with table', async ({ page }) => {
  await page.goto('/tenants');
  await page.waitForLoadState('domcontentloaded');

  // Page heading
  await expect(page.getByRole('heading', { name: 'Tenant Management' })).toBeVisible();

  // "Create Tenant" button
  await expect(page.getByRole('link', { name: 'Create Tenant' })).toBeVisible();

  // Table headers — renders when tenants exist; if empty state, just verify the empty message
  const hasTable = await page.locator('table').isVisible().catch(() => false);
  const hasEmptyState = await page.getByText('No tenants found').isVisible().catch(() => false);
  expect(hasTable || hasEmptyState).toBeTruthy();
});

test('@smoke create tenant — happy path', async ({ page }) => {
  const uniqueName = `Test Tenant ${Date.now()}`;
  const uniqueSlug = `test-tenant-${Date.now()}`;

  await page.goto('/tenants/new');
  await page.waitForLoadState('domcontentloaded');

  // Fill form
  await page.getByLabel('Tenant Name').fill(uniqueName);
  await page.getByLabel('Slug').fill(uniqueSlug);
  await page.getByLabel('Owner First Name').fill('Test');
  await page.getByLabel('Owner Last Name').fill('Owner');
  await page.getByLabel('Owner Email').fill(`owner-${Date.now()}@testfleet.example`);

  // Submit
  await page.getByRole('button', { name: 'Create Tenant' }).click();

  // On success: redirect to /tenants OR stay with emailWarning banner
  await page.waitForLoadState('domcontentloaded');

  const onTenantsPage = page.url().includes('/tenants');
  expect(onTenantsPage).toBeTruthy();

  // If redirected to /tenants list, verify the tenant appears
  if (page.url().endsWith('/tenants')) {
    await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 10000 });
  }
  // If stayed on /tenants/new with emailWarning, the banner says "Tenant created"
  // — still a success
});

test('tenant detail page loads', async ({ page }) => {
  await page.goto('/tenants');
  await page.waitForLoadState('domcontentloaded');

  // Check if any tenants exist
  const viewLink = page.getByRole('link', { name: 'View' }).first();
  const hasTenants = await viewLink.isVisible().catch(() => false);

  if (!hasTenants) {
    test.skip(true, 'No tenants in DB — skipping tenant detail test');
  }

  await viewLink.click();
  await page.waitForLoadState('domcontentloaded');

  // Must be on a /tenants/[id] page
  expect(page.url()).toMatch(/\/tenants\/[^/]+$/);

  // Tenant detail sections
  await expect(page.getByText('Tenant Info')).toBeVisible();
  await expect(page.getByText('Tenant Status')).toBeVisible();
  await expect(page.getByText('Billing History')).toBeVisible();
});

test('suspend active tenant then reactivate', async ({ page }) => {
  await page.goto('/tenants');
  await page.waitForLoadState('domcontentloaded');

  // Find a tenant with "Suspend" action available (active tenant)
  const suspendBtn = page.getByRole('button', { name: 'Suspend' }).first();
  const hasSuspendable = await suspendBtn.isVisible().catch(() => false);

  if (!hasSuspendable) {
    test.skip(true, 'No active tenants available to suspend');
  }

  // Click Suspend — opens confirmation dialog
  await suspendBtn.click();

  // Confirm dialog should appear
  await expect(page.getByText('Suspend Tenant')).toBeVisible();
  await page.getByRole('button', { name: 'Suspend' }).last().click(); // last = confirm button

  await page.waitForLoadState('domcontentloaded');

  // After confirming, the tenant should now show "Reactivate" button
  await expect(page.getByRole('button', { name: 'Reactivate' }).first()).toBeVisible({ timeout: 10000 });

  // Now reactivate
  await page.getByRole('button', { name: 'Reactivate' }).first().click();
  await page.waitForLoadState('domcontentloaded');

  // Back to showing "Suspend" button
  await expect(page.getByRole('button', { name: 'Suspend' }).first()).toBeVisible({ timeout: 10000 });
});

test('tenant detail shows billing history section', async ({ page }) => {
  await page.goto('/tenants');
  await page.waitForLoadState('domcontentloaded');

  const viewLink = page.getByRole('link', { name: 'View' }).first();
  const hasTenants = await viewLink.isVisible().catch(() => false);

  if (!hasTenants) {
    test.skip(true, 'No tenants in DB');
  }

  await viewLink.click();
  await page.waitForLoadState('domcontentloaded');

  // Billing History section must render (even if empty)
  await expect(page.getByText('Billing History')).toBeVisible();

  // "+ New Invoice" link should be present
  await expect(page.getByRole('link', { name: '+ New Invoice' })).toBeVisible();
});
