import { test, expect } from '@playwright/test';
import path from 'path';
import { requireRoleAuth } from '../fixtures/auth-helpers';

/**
 * User menu link gating — quick-576.
 *
 * ─── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * quick-575 shipped a user menu with four links (Profile, My Notifications,
 * Settings, Help & Support) and no role gating at all. Two of those four
 * bounce a DRIVER off to /unauthorized or /home the moment they're clicked:
 * `/settings/notifications` sits behind the bare `/settings` prefix in
 * `OWNER_PATHS` (middleware), and `/help` sits behind the `(owner)` route
 * group's own layout redirect — TWO different mechanisms, neither of which
 * the menu itself was aware of. This spec pins the fix: the menu now derives
 * `canSeeOwnerSettings` from `PORTAL_ROLES.owner` and conditionally renders
 * those two items.
 *
 * ─── WHAT EACH TEST PROVES ──────────────────────────────────────────────────
 *
 * - The DRIVER describe proves BOTH that the gated links are gone AND that
 *   the ungated links are still there — a bare absence assertion passes
 *   identically if the menu simply failed to open (quick-563/566's rule:
 *   every negative assertion needs a positive counter-assertion in the same
 *   test, or it proves nothing).
 * - The OWNER describe proves the gate does not over-fire: an owner's menu
 *   must still carry all four links.
 * - Locators are scoped to `[role="menu"] a` (never a bare `document
 *   .querySelectorAll('a')`, quick-566) and matched on exact href, never
 *   `toContainText` — `/settings/notifications` is a superstring of
 *   `/settings/my-notifications`'s absence check would be meaningless
 *   against a substring match.
 * - The trigger is opened via `[data-testid="user-menu-trigger"]:visible`
 *   (D7) rather than a role/name locator — `owner-shell.tsx` mounts UserMenu
 *   twice (desktop + `lg:hidden` mobile lanes) and `compactOnMobile` hides
 *   the accessible name below 640px, and this spec runs in BOTH the
 *   `chromium` and `mobile` Playwright projects.
 *
 * ─── RED PROOF ──────────────────────────────────────────────────────────────
 *
 * This spec was run once with the gate physically removed from
 * `user-menu.tsx` (both items rendered unconditionally) to confirm it fails
 * for the right reason. See 576-SUMMARY.md for the captured failure output.
 *
 * ─── QUICK-577 UPDATE ───────────────────────────────────────────────────────
 *
 * The four-link menu above described a `/profile` link that was a 404 for
 * every role (reported by quick-576, since there was never a route to gate —
 * `find src/app -iname "*profile*"` returns nothing, no rewrite/redirect
 * exists for it). quick-577 removed the link entirely; this is a DELIBERATE
 * unlink, not the accidental kind quick-552/553 spent two tasks recovering.
 * The menu now carries three links total. `UNGATED_HREFS` drops to just
 * `/settings/my-notifications`, and the OWNER describe below gained an
 * explicit absence assertion for `/profile` — paired with its existing
 * positive assertions in the same test — so a future re-add is caught
 * (quick-566/567's rule: deleting a nav entry records nothing unless the
 * absence is asserted).
 */

const AUTH_DIR = path.join(__dirname, '..', '..', '.playwright', 'auth');

const GATED_HREFS = ['/settings/notifications', '/help'];
const UNGATED_HREFS = ['/settings/my-notifications'];

/** Opens the user menu via the stable testid and returns the open menu's hrefs. */
async function openMenuAndGetHrefs(page: import('@playwright/test').Page): Promise<string[]> {
  const trigger = page.locator('[data-testid="user-menu-trigger"]:visible');
  // A generous timeout here, not a flaky default: on the dev server
  // (Turbopack, on-demand compilation) the FIRST hit against a route in a
  // given run can take well over 15s to compile before anything renders —
  // measured directly: a cold /carrier/dashboard compile plus its
  // mobile-specific DashboardMobile.tsx chunk, compiling concurrently across
  // 3 Playwright workers, pushed past 15s on the `mobile` project alone
  // while an isolated single-page run resolved in under 8s. Unrelated to the
  // gate under test — a real "menu never opened" failure still fails loudly
  // via the positive-half assertions below regardless of this timeout.
  await expect(trigger).toBeVisible({ timeout: 30_000 });
  await trigger.click();

  const menu = page.locator('[role="menu"]');
  await expect(menu).toBeVisible();

  return menu.locator('a').evaluateAll((links) => links.map((a) => new URL((a as HTMLAnchorElement).href).pathname));
}

test.describe('DRIVER session — user menu omits owner-only links', () => {
  test.use({ storageState: path.join(AUTH_DIR, 'driver.json') });

  test.beforeAll(() => {
    requireRoleAuth('driver');
  });

  test('shows My Notifications, omits Settings and Help & Support', async ({ page }) => {
    await page.goto('/my-route');
    await page.waitForLoadState('domcontentloaded');

    const hrefs = await openMenuAndGetHrefs(page);

    // Positive half — the menu genuinely opened and the ungated links are there.
    for (const href of UNGATED_HREFS) {
      expect(hrefs, `expected ${href} to be present for DRIVER`).toContain(href);
    }

    // Negative half — the two owner-only links must be absent, not merely
    // hidden. This only proves something because the positive half above
    // already established the menu opened with real content.
    for (const href of GATED_HREFS) {
      expect(hrefs, `expected ${href} to be ABSENT for DRIVER`).not.toContain(href);
    }
  });
});

test.describe('OWNER session — user menu carries all three links', () => {
  test.use({ storageState: path.join(AUTH_DIR, 'owner.json') });

  test.beforeAll(() => {
    requireRoleAuth('owner');
  });

  test('shows My Notifications, Settings and Help & Support, omits Profile', async ({ page }) => {
    await page.goto('/carrier/dashboard');
    await page.waitForLoadState('domcontentloaded');

    const hrefs = await openMenuAndGetHrefs(page);

    // Positive half — the menu opened with real content, for the most
    // permissive viewer there is (an OWNER's menu must not be missing a
    // link merely because a permission happens to be off).
    for (const href of [...UNGATED_HREFS, ...GATED_HREFS]) {
      expect(hrefs, `expected ${href} to be present for OWNER`).toContain(href);
    }

    // Negative half — /profile is gone for good, not merely ungated. Pinned
    // against OWNER specifically so it can't be satisfied by a permission
    // being switched off (quick-566/567).
    expect(hrefs, 'expected /profile to be ABSENT for OWNER — the route does not exist').not.toContain('/profile');
  });
});
