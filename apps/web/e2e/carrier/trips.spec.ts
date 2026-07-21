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

  // TKT-0074/0056/0057 — legacy /routes/new (built on Route→User drivers and
  // pre-migration trucks) is retired; it must redirect to the carrier trip form
  // which sources drivers + trucks from the carrier fleet.
  test('legacy /routes/new redirects to the carrier trip form (TKT-0074/0057)', async ({ page }) => {
    await page.goto('/routes/new');
    await page.waitForURL('**/carrier/trips/new');
    expect(page.url()).toContain('/carrier/trips/new');
  });
});
