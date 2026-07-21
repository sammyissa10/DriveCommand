import { test, expect } from '@playwright/test';
import path from 'path';

test.use({ storageState: path.join(__dirname, '../.playwright/auth/owner.json') });

// TKT-0078 — the account settings page hardcoded "John Doe" /
// "john@acmetrucking.com". It must show the actual signed-in account holder.
test.describe('Account settings', () => {
  test('shows the signed-in user, not the sample placeholder (TKT-0078)', async ({ page }) => {
    await page.goto('/settings/account');
    await page.waitForLoadState('domcontentloaded');

    // The real account holder (demo owner) is shown.
    await expect(page.getByText('demo@drivecommand.com').first()).toBeVisible();

    // The old hardcoded sample values are gone.
    await expect(page.getByText('john@acmetrucking.com')).toHaveCount(0);
    await expect(page.getByText('John Doe', { exact: true })).toHaveCount(0);
  });
});
