import { test, expect } from '@playwright/test';
import path from 'path';

/**
 * /settings/my-notifications reachability — quick-575.
 *
 * ─── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * quick-574 shipped a "Notification preferences" link in every email footer,
 * plus a `List-Unsubscribe` header, pointing at `/settings/my-notifications`.
 * That route sat behind the bare `/settings` prefix in `OWNER_PATHS`, so a
 * DRIVER — the highest-volume recipient class — following either link was
 * redirected to `/home` instead of reaching the screen. quick-575 carved a
 * single exception out of the DRIVER guard for this one route.
 *
 * ─── WHAT EACH TEST PROVES ──────────────────────────────────────────────────
 *
 * - The DRIVER positive test is THE FIX. It fails against the pre-quick-575
 *   middleware (the driver would land on `/home`, not `/settings/my-notifications`).
 * - The MANAGER and OWNER positive tests are REGRESSION PINS, not fixes.
 *   Finding E (established while planning this task): `/settings/my-notifications`
 *   was never in `OWNER_ONLY_PATHS` and `PERMISSION_GATED_PATHS` has no
 *   `/settings` entry, so a MANAGER already reached this screen before this
 *   task touched anything. These two tests exist so a future edit that widens
 *   or narrows `OWNER_ONLY_PATHS` cannot silently break what already worked.
 * - The negative test (DRIVER -> `/settings/notifications`, the TENANT-level
 *   settings page) is what proves this task did not widen the whole `/settings`
 *   prefix by mistake — only the one leaf named in `ANY_AUTHENTICATED_PATHS`.
 *
 * This spec pairs with `tests/unit/auth/route-access.test.ts`, which is the
 * deterministic, server-free half of the same claim. Per quick-549: row/DOM
 * assertions and source scans catch different classes, and a test that calls
 * the classifier function directly is structurally blind to whatever renders
 * (or fails to render) the actual page — hence both files exist.
 *
 * ─── EXECUTION STATUS ───────────────────────────────────────────────────────
 *
 * See 575-SUMMARY.md for whether this file was actually run. Per the
 * project's non-negotiables: a spec that cannot be executed (no dev server,
 * or the driver/manager test accounts do not exist in the target database)
 * is reported as written-but-unexecuted, never marked `.skip` to fake a green
 * run, and never reported as passing without having actually run.
 */

const AUTH_DIR = path.join(__dirname, '..', '..', '.playwright', 'auth');

/**
 * Assert the preferences UI actually rendered — not just a heading that
 * happens to say something similar. `preferences-form.tsx` renders one
 * `Checkbox` per (trigger, channel) pair with an accessible label of
 * "Email me"; asserting on that role+name pair, rather than the page heading
 * alone, is what stops a redirect-to-a-similarly-titled-page from satisfying
 * this test by accident.
 */
async function expectPreferencesScreenRendered(page: import('@playwright/test').Page) {
  await expect(page.getByRole('heading', { name: 'My Notification Preferences' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Email me' }).first()).toBeVisible();
}

test.describe('DRIVER reaches /settings/my-notifications — this is the fix', () => {
  test.use({ storageState: path.join(AUTH_DIR, 'driver.json') });

  test('a driver session is not redirected away from /settings/my-notifications', async ({ page }) => {
    await page.goto('/settings/my-notifications');

    expect(page.url()).toContain('/settings/my-notifications');
    expect(page.url()).not.toContain('/home');
    expect(page.url()).not.toContain('/sign-in');

    await expectPreferencesScreenRendered(page);
  });
});

test.describe('MANAGER still reaches /settings/my-notifications — regression pin, not a fix', () => {
  test.use({ storageState: path.join(AUTH_DIR, 'manager.json') });

  test('a manager session still renders the preferences screen', async ({ page }) => {
    await page.goto('/settings/my-notifications');

    expect(page.url()).toContain('/settings/my-notifications');
    expect(page.url()).not.toContain('/carrier/dashboard');

    await expectPreferencesScreenRendered(page);
  });
});

test.describe('OWNER still reaches /settings/my-notifications — regression pin, not a fix', () => {
  test.use({ storageState: path.join(AUTH_DIR, 'owner.json') });

  test('an owner session still renders the preferences screen', async ({ page }) => {
    await page.goto('/settings/my-notifications');

    expect(page.url()).toContain('/settings/my-notifications');

    await expectPreferencesScreenRendered(page);
  });
});

test.describe('DRIVER is still blocked from /settings/notifications (tenant-level) — proves no over-widening', () => {
  test.use({ storageState: path.join(AUTH_DIR, 'driver.json') });

  test('a driver session requesting the tenant-level settings page is redirected to /home', async ({ page }) => {
    await page.goto('/settings/notifications');

    expect(page.url()).toContain('/home');
    expect(page.url()).not.toContain('/settings/notifications');
  });
});
