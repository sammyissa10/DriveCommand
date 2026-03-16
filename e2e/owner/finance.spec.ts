import { test, expect } from '@playwright/test';
import path from 'path';

test.use({ storageState: path.join(__dirname, '../../.playwright/auth/owner.json') });

/**
 * Owner portal — finance, invoicing, CRM, and compliance page tests.
 *
 * Covers: TC-OW-INV-001, TC-OW-FIN pages
 *
 * These tests verify that key financial and operational pages load correctly.
 * They do not test create/edit flows (those are covered by the load lifecycle
 * and route tests). The focus here is page accessibility and basic rendering.
 */

test('@smoke invoices page loads', async ({ page }) => {
  await page.goto('/invoices');
  await page.waitForLoadState('domcontentloaded');

  await expect(page.getByRole('heading', { name: 'Invoices' })).toBeVisible();

  // Either invoice table or empty state
  const hasContent = await page.locator('table, [class*="card"]').first().isVisible().catch(() => false);
  const hasEmpty = await page.getByText(/no invoices/i).isVisible().catch(() => false);
  const hasCreateBtn = await page.getByRole('link', { name: /new invoice|create invoice/i }).isVisible().catch(() => false);

  expect(hasContent || hasEmpty || hasCreateBtn).toBeTruthy();
});

test('payroll page loads', async ({ page }) => {
  await page.goto('/payroll');
  await page.waitForLoadState('domcontentloaded');

  // Payroll heading or relevant content
  const hasHeading = await page.getByRole('heading', { name: /payroll/i }).isVisible().catch(() => false);
  const hasContent = await page.getByText(/payroll|earnings|driver pay/i).first().isVisible().catch(() => false);

  expect(hasHeading || hasContent).toBeTruthy();
});

test('CRM page loads', async ({ page }) => {
  await page.goto('/crm');
  await page.waitForLoadState('domcontentloaded');

  // CRM heading or customer list content
  const hasHeading = await page.getByRole('heading', { name: /crm|customers/i }).isVisible().catch(() => false);
  const hasContent = await page.locator('table, [class*="card"]').first().isVisible().catch(() => false);
  const hasEmpty = await page.getByText(/no customers/i).isVisible().catch(() => false);
  const hasAddBtn = await page.getByRole('link', { name: /add customer|new customer/i }).isVisible().catch(() => false);

  expect(hasHeading || hasContent || hasEmpty || hasAddBtn).toBeTruthy();
});

test('compliance page loads', async ({ page }) => {
  await page.goto('/compliance');
  await page.waitForLoadState('domcontentloaded');

  // Compliance heading or document expiry tracking content
  const hasHeading = await page.getByRole('heading', { name: /compliance/i }).isVisible().catch(() => false);
  const hasContent = await page.getByText(/compliance|document|expir/i).first().isVisible().catch(() => false);

  expect(hasHeading || hasContent).toBeTruthy();
});

test('route finance section visible on route detail', async ({ page }) => {
  await page.goto('/routes');
  await page.waitForLoadState('domcontentloaded');

  const detailLinks = page.locator('a[href*="/routes/"]').filter({ hasNotText: /new|create/i });
  const hasRoutes = await detailLinks.first().isVisible().catch(() => false);

  if (!hasRoutes) {
    test.skip(true, 'No routes in DB — skipping route finance section test');
  }

  await detailLinks.first().click();
  await page.waitForLoadState('domcontentloaded');

  // Finance section with expenses and profit should be present
  const hasExpenses = await page.getByText(/expenses/i).first().isVisible({ timeout: 10000 }).catch(() => false);
  const hasProfit = await page.getByText(/profit|revenue/i).first().isVisible({ timeout: 10000 }).catch(() => false);

  expect(hasExpenses || hasProfit).toBeTruthy();
});
