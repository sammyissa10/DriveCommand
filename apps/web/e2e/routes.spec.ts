import { test, expect } from '@playwright/test';
import path from 'path';

test.use({ storageState: path.join(__dirname, '../.playwright/auth/owner.json') });

// quick-477 — the New Route primary-driver dropdown was repointed at the CARRIER
// fleet (TKT-0074), but Route.driverId is an FK to a DRIVER-role User account.
// Carrier-driver ids do not map to User ids, so every save failed with "Driver
// not found" / "not a driver". Restored to DRIVER-role User sourcing — every
// option in the dropdown must be a selectable (enabled) User account.
test.describe('New Route — driver dropdown', () => {
  test('lists DRIVER-role User accounts, all selectable (quick-477)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Desktop route form');

    await page.goto('/routes/new');
    await page.waitForLoadState('domcontentloaded');

    const select = page.locator('#driverId:visible');
    await expect(select).toBeVisible();

    // Placeholder option present.
    const options = select.locator('option');
    await expect(options.first()).toHaveText(/Select a driver|No drivers available/);

    // No option in the driver picker is ever disabled — every listed driver is a
    // real DRIVER-role User account and thus a valid Route.driverId FK target.
    const disabledCount = await select.locator('option[disabled]').count();
    expect(disabledCount).toBe(0);
  });
});
