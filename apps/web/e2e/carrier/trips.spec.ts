import { test, expect } from '@playwright/test';
import path from 'path';

test.use({ storageState: path.join(__dirname, '../../.playwright/auth/owner.json') });

// ---------------------------------------------------------------------------
// Carrier Trips — New Trip form (dispatch)
// ---------------------------------------------------------------------------

test.describe('Carrier Trips — New Trip pickers', () => {
  // TKT-0076 — the driver/truck pickers showed seeded [SAMPLE] records (and
  // didn't filter soft-deleted rows), which the user read as "data that does
  // not exist". They must now list only real, active, non-deleted fleet.
  test('new trip pickers exclude sample and deleted fleet (TKT-0076)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Desktop trip form');

    await page.goto('/carrier/trips/new');
    await page.waitForLoadState('networkidle');

    const desktop = page.locator('div.hidden.lg\\:block.space-y-6').first();

    // Sample records must be gone. "SAMPLE-1" is is_sample but NOT deleted, so
    // its absence proves the isSample filter specifically works.
    await expect(desktop.locator('option', { hasText: 'SAMPLE-1' })).toHaveCount(0);
    await expect(desktop.locator('option', { hasText: 'Sample Driver 1' })).toHaveCount(0);

    // Real fleet records must still be selectable.
    expect(await desktop.locator('option', { hasText: 'Ford' }).count()).toBeGreaterThan(0);
    expect(await desktop.locator('option', { hasText: 'Michael Jordan' }).count()).toBeGreaterThan(0);
  });
});
