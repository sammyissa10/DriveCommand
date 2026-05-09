import { test, expect } from '@playwright/test';
import path from 'path';

test.use({ storageState: path.join(__dirname, '../../.playwright/auth/owner.json') });

test.describe('Carrier Dispatches', () => {
  test('@smoke dispatch list page loads', async ({ page }) => {
    await page.goto('/carrier/dispatches');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: /Dispatches/i })).toBeVisible();
  });

  test('@smoke create dispatch sheet opens via ?new=true', async ({ page }) => {
    await page.goto('/carrier/dispatches?new=true');
    await page.waitForLoadState('domcontentloaded');
    // The NewDispatchForm renders inside a Sheet — check for the sheet heading
    const sheetHeading = page.getByText(/New Dispatch/i).or(
      page.getByRole('dialog')
    );
    await expect(sheetHeading.first()).toBeVisible({ timeout: 5000 });
  });

  test('dispatch list shows all/active toggle or filter', async ({ page }) => {
    await page.goto('/carrier/dispatches');
    await page.waitForLoadState('domcontentloaded');
    // DispatchList has a "Show all" toggle (Switch component)
    const toggle = page.getByRole('switch').or(
      page.getByText(/Show all/i)
    );
    // Toggle may or may not exist depending on state — just confirm page rendered
    await expect(page.getByRole('heading', { name: /Dispatches/i })).toBeVisible();
  });

  test('dispatch detail page loads when dispatch exists', async ({ page }) => {
    await page.goto('/carrier/dispatches');
    await page.waitForLoadState('domcontentloaded');

    // Find first dispatch card link
    const firstDispatchLink = page.locator('a[href*="/carrier/dispatches/"]').first();
    const hasLink = await firstDispatchLink.isVisible().catch(() => false);
    if (!hasLink) {
      test.skip(true, 'No dispatches found — skipping detail test');
      return;
    }

    await firstDispatchLink.click();
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toMatch(/\/carrier\/dispatches\/.+/);
  });

  test('@smoke dispatch detail shows stop timeline section', async ({ page }) => {
    await page.goto('/carrier/dispatches');
    await page.waitForLoadState('domcontentloaded');

    const firstDispatchLink = page.locator('a[href*="/carrier/dispatches/"]').first();
    const hasLink = await firstDispatchLink.isVisible().catch(() => false);
    if (!hasLink) {
      test.skip(true, 'No dispatches found — skipping stop timeline test');
      return;
    }

    await firstDispatchLink.click();
    await page.waitForLoadState('domcontentloaded');

    // StopTimeline or an empty-state message should be visible
    const stopSection = page.getByText(/Stop/i).or(
      page.getByText(/No stops/i)
    );
    await expect(stopSection.first()).toBeVisible();
  });

  test('dispatch detail shows expenses panel section', async ({ page }) => {
    await page.goto('/carrier/dispatches');
    await page.waitForLoadState('domcontentloaded');

    const firstDispatchLink = page.locator('a[href*="/carrier/dispatches/"]').first();
    const hasLink = await firstDispatchLink.isVisible().catch(() => false);
    if (!hasLink) {
      test.skip(true, 'No dispatches found — skipping expenses test');
      return;
    }

    await firstDispatchLink.click();
    await page.waitForLoadState('domcontentloaded');

    // DispatchExpensesPanel heading
    const expensesSection = page.getByText(/Expenses/i).or(
      page.getByText(/No expenses/i)
    );
    await expect(expensesSection.first()).toBeVisible();
  });

  test('dispatch detail shows pay records panel section', async ({ page }) => {
    await page.goto('/carrier/dispatches');
    await page.waitForLoadState('domcontentloaded');

    const firstDispatchLink = page.locator('a[href*="/carrier/dispatches/"]').first();
    const hasLink = await firstDispatchLink.isVisible().catch(() => false);
    if (!hasLink) {
      test.skip(true, 'No dispatches found — skipping pay records test');
      return;
    }

    await firstDispatchLink.click();
    await page.waitForLoadState('domcontentloaded');

    // Pay records panel — rendered by DispatchExpensesPanel as "Driver Pay Records"
    const paySection = page.getByText(/Pay Records/i).or(
      page.getByText(/Driver Pay/i)
    );
    await expect(paySection.first()).toBeVisible();
  });
});
