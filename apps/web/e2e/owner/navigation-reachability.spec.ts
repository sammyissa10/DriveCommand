import { test, expect } from '@playwright/test';
import path from 'path';

/**
 * Navigation reachability — quick-552.
 *
 * ─── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * Seven consecutive phases reported a navigation entry as "wired" when it was
 * not reachable. Two distinct failure modes produced identical symptoms, and
 * NEITHER is visible to `tsc`, to a unit test, or to reading the diff:
 *
 *  1. **The edit went into a component nothing mounts.** Phase 11 and quick-551
 *     both added entries to `components/navigation/sidebar.tsx`, which exported
 *     `AppSidebar` and was imported by NOTHING. The real sidebar is
 *     `AnimatedSidebar` in `components/Sidebar/index.tsx`. Both edits compiled,
 *     type-checked, reviewed correctly, and rendered nowhere.
 *
 *  2. **The edit rendered, and silently deleted a different link.**
 *     `SidebarGroup.tsx` renders a parent that HAS CHILDREN as a plain `<div>`,
 *     not a `<Link>`. quick-552's first attempt added Live Board as a child of
 *     Live Map — which removed the sidebar's only link to the live map. One
 *     unreachable page traded for another.
 *
 * Reading the source cannot catch either. Only asking a real browser what is in
 * the DOM can, which is what this file does.
 *
 * ─── HOW TO EXTEND ──────────────────────────────────────────────────────────
 *
 * When a task adds a nav entry, add its href here. That is the mechanical gate:
 * a nav claim is not done until an href appears in this list and this spec is
 * green. Adding a row costs one line; the alternative has cost seven phases.
 *
 * NOTE ON WAITING. The sidebar hydrates from `useAuth()`, so it renders NO links
 * on first paint and `networkidle` fires before it appears. Waiting on a
 * sidebar-only selector is required — a `networkidle` wait here reads the bottom
 * nav and reports a false negative, which is exactly what happened while this
 * was being diagnosed.
 */

test.use({ storageState: path.join(__dirname, '../../.playwright/auth/owner.json') });

/** Every href an OWNER must be able to reach from the desktop sidebar. */
const REQUIRED_SIDEBAR_HREFS = [
  '/live-map',
  '/live-map?view=board',
  '/carrier/dashboard',
  '/carrier/clients',
  '/carrier/loads',
  '/carrier/fleet/drivers',
  '/carrier/fleet/trucks',
];

test('every required sidebar destination is a real link in the DOM', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/carrier/dashboard');

  // Sidebar-only href — the bottom nav uses /carrier/dispatches for Trips, so
  // this marks the sidebar itself as hydrated rather than the page as loaded.
  await page.waitForSelector('a[href="/live-map?view=board"]', { timeout: 30_000 });

  const hrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href') || ''),
  );

  const missing = REQUIRED_SIDEBAR_HREFS.filter((h) => !hrefs.includes(h));

  expect(
    missing,
    `These navigation destinations have no link in the rendered DOM: ${missing.join(', ')}. ` +
      'Either the entry was added to a component nothing mounts, or it was added as a child ' +
      'of a parent item — which turns the PARENT into a non-clickable div. See this file header.',
  ).toEqual([]);
});
