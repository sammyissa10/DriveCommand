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
 *     `SidebarGroup.tsx` USED TO render a parent that has children as a plain
 *     `<div>`, not a `<Link>` — and `SidebarFlyout.tsx` used a `<button>` for the
 *     same thing on the collapsed rail. quick-552's first attempt added Live
 *     Board as a child of Live Map, which removed the sidebar's only link to the
 *     live map. One unreachable page traded for another.
 *
 *     **quick-553 fixed the components** — both branches now render the parent
 *     through `SidebarItem`/`<Link>`. `/carrier/trips` had been the standing
 *     casualty of this since Document Imports was nested under Trips. The two
 *     tests below are what keep it fixed.
 *
 *  3. **The destination died with the file that described it — quick-553.**
 *     quick-552 deleted the orphaned `navigation/sidebar.tsx` and carried only
 *     `Live Board` into the mounted sidebar. The Reports group in that file went
 *     with it, and five report pages lost every desktop link they had. The orphan
 *     scanner cannot see this: it asks whether anything imports a file, not
 *     whether a live destination was described inside one being removed.
 *
 * Reading the source cannot catch any of these. Only asking a real browser what
 * is in the DOM can, which is what this file does.
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

  // quick-553 — failure mode 2, the one this list was written for. `Trips` has a
  // `Document Imports` child, so `SidebarGroup` rendered it as a plain <div> and
  // `/carrier/trips` had no link while `/carrier/imports` did. The child was in
  // the DOM and the parent was not.
  '/carrier/trips',
  '/carrier/imports',

  // quick-553 — failure mode 1, one commit later than the header describes. The
  // Reports group was written in the orphaned `navigation/sidebar.tsx`; quick-552
  // deleted that file and carried only `Live Board` across. Five report pages had
  // no desktop link at all until this group was restored. quick-554 later added
  // AR Aging to the mobile more-menu, so by the time quick-566 ran it had a link
  // on ONE surface, not zero — quick-567 then removed that one too.
  //
  // AR Aging is deliberately absent from this list — quick-566 removed its
  // desktop sidebar entry on request, and quick-567 removed the mobile
  // more-menu entry the same way, closing the split quick-566 reopened. The
  // route, page, API, permission key and PERMISSION_GATED_PATHS row are
  // untouched; it has no nav entry on either surface and is reachable only by
  // direct URL. See the negative assertion below, which pins the absence as a
  // decision rather than leaving it to be re-added by an edit that does not
  // know it was intentional.
  '/carrier/reports/revenue',
  '/carrier/reports/driver-pay',
  '/carrier/reports/performance',
  '/carrier/reports/todays-trips',
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

/**
 * AR Aging is deliberately absent from the desktop sidebar — quick-566.
 *
 * This is a POSITIVE + NEGATIVE pair, not just a deleted line: asserting only
 * the absence would pass just as well if the whole REPORTS group vanished, which
 * says nothing about the actual decision (quick-563's rule). So this also
 * re-asserts the other four report hrefs are present, scoped to `aside a` so an
 * unrelated in-page link elsewhere on the dashboard cannot trip either half.
 */
test('AR Aging has no sidebar link, but the other four reports still do', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/carrier/dashboard');

  await page.waitForSelector('a[href="/live-map?view=board"]', { timeout: 30_000 });

  const sidebarHrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('aside a')).map((a) => a.getAttribute('href') || ''),
  );

  expect(
    sidebarHrefs,
    'AR Aging should not have a link in the desktop sidebar (quick-566). If this is ' +
      'intentional, restore the `arAgingReport` block in Sidebar/index.tsx and remove this ' +
      'assertion; if not, the desktop entry regressed.',
  ).not.toContain('/carrier/reports/aging');

  const otherReportHrefs = [
    '/carrier/reports/revenue',
    '/carrier/reports/driver-pay',
    '/carrier/reports/performance',
    '/carrier/reports/todays-trips',
  ];

  for (const href of otherReportHrefs) {
    expect(sidebarHrefs, `Expected the sidebar to still link to ${href}`).toContain(href);
  }
});

/**
 * The COLLAPSED rail — quick-553.
 *
 * The test above runs with the sidebar expanded, which is the default, and it
 * cannot see the other half of the parent-with-children bug. When the rail is
 * collapsed, a parent that has children is rendered by `SidebarFlyout` instead
 * of `SidebarGroup`, and that component's trigger was a `<button>`. So
 * `/carrier/trips` had no `<a href>` in EITHER state, and a fix to the expanded
 * branch alone would have left this one green and the page still unreachable.
 *
 * Only the parent is asserted here. The children live in a Radix popover that is
 * mounted on hover, so they are legitimately absent from a resting DOM — that is
 * the flyout working, not a missing link.
 */
test('a parent item with children is still a link on the collapsed rail', async ({ page, context }) => {
  // `useSidebarState` reads the `sidebar:state` cookie first and it wins over
  // localStorage. Setting it up front is deterministic; clicking the toggle
  // would race the hydration effect that reads it.
  await context.addCookies([
    { name: 'sidebar:state', value: 'false', url: 'http://localhost:3000' },
  ]);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/carrier/dashboard');

  await page.waitForSelector('a[href="/live-map?view=board"]', { timeout: 30_000 });

  const hrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('aside a')).map((a) => a.getAttribute('href') || ''),
  );

  expect(
    hrefs,
    'The Trips parent has no link on the collapsed rail. `SidebarFlyout`\'s trigger ' +
      'must be a <Link href={item.href}>, not a <button> — a parent item owns its own ' +
      'route, and nesting a child under it must not take that route away.',
  ).toContain('/carrier/trips');
});
