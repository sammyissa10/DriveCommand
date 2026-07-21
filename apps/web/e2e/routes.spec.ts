import { test, expect } from '@playwright/test';
import path from 'path';

test.use({ storageState: path.join(__dirname, '../.playwright/auth/owner.json') });

// TKT-0074 — the New Route primary-driver dropdown listed User login accounts
// (incl. stray/dummy data) instead of the carrier fleet. It must now list only
// real fleet drivers; those without a portal login are shown but disabled.
test.describe('New Route — driver dropdown', () => {
  test('lists carrier fleet drivers, disables no-login, excludes samples (TKT-0074)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Desktop route form');

    await page.goto('/routes/new');
    await page.waitForLoadState('domcontentloaded');

    const select = page.locator('#driverId:visible');
    await expect(select).toBeVisible();

    // A real, login-having fleet driver is selectable.
    const jordan = select.locator('option', { hasText: 'Michael Jordan' });
    await expect(jordan).toHaveCount(1);
    await expect(jordan).toBeEnabled();

    // A fleet driver with no login is shown but disabled.
    const carlos = select.locator('option', { hasText: 'Carlos Rivera' });
    await expect(carlos).toHaveCount(1);
    await expect(carlos).toBeDisabled();

    // Seeded sample drivers never appear.
    await expect(select.locator('option', { hasText: 'Sample Driver 1' })).toHaveCount(0);
  });
});
