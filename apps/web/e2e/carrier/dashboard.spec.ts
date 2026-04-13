import { test, expect } from '@playwright/test';
import path from 'path';

test.use({ storageState: path.join(__dirname, '../../.playwright/auth/owner.json') });

test.describe('Carrier Dashboard', () => {
  test('@smoke dashboard page loads', async ({ page }) => {
    await page.goto('/carrier/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('@smoke KPI strip is visible', async ({ page }) => {
    await page.goto('/carrier/dashboard');
    await page.waitForLoadState('domcontentloaded');
    // KPIStrip renders metric cards — at least one should be present
    const kpiSection = page.locator('[data-testid="kpi-strip"]').or(
      page.locator('.grid').first()
    );
    await expect(kpiSection).toBeVisible();
  });

  test("Today's Dispatches section is rendered", async ({ page }) => {
    await page.goto('/carrier/dashboard');
    await page.waitForLoadState('domcontentloaded');
    // Either shows dispatches or an empty-state message — both are valid
    const dispatches = page.getByText("Today's Dispatches").or(
      page.getByText('No dispatches today')
    );
    await expect(dispatches.first()).toBeVisible();
  });

  test('@smoke Quick Actions links are visible', async ({ page }) => {
    await page.goto('/carrier/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByText('Quick Actions')).toBeVisible();
    await expect(page.getByRole('link', { name: /New Dispatch/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /New Load/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /New Client/i })).toBeVisible();
  });

  test('New Dispatch quick action navigates to dispatches with new=true', async ({ page }) => {
    await page.goto('/carrier/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await page.getByRole('link', { name: /New Dispatch/i }).click();
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('/carrier/dispatches');
    expect(page.url()).toContain('new=true');
  });

  test('New Load quick action navigates to carrier loads new page', async ({ page }) => {
    await page.goto('/carrier/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await page.getByRole('link', { name: /New Load/i }).click();
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('/carrier/loads/new');
  });

  test('New Client quick action navigates to carrier clients new page', async ({ page }) => {
    await page.goto('/carrier/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await page.getByRole('link', { name: /New Client/i }).click();
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('/carrier/clients/new');
  });

  test('unauthenticated user is redirected from carrier dashboard', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    await page.goto('/carrier/dashboard');
    await page.waitForLoadState('domcontentloaded');
    // Should redirect to login
    expect(page.url()).toMatch(/\/(login|sign-in)/);
    await ctx.close();
  });
});
