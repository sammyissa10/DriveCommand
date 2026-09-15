import { test, expect } from '@playwright/test';
import path from 'path';

/**
 * quick-605 — the grid-bearing routes render, in a real browser.
 *
 * ─── WHY THIS EXISTS ALONGSIDE THE VITEST GUARD ─────────────────────────────
 *
 * `src/__tests__/nuqs-adapter-coverage.test.ts` asserts that every page that
 * transitively renders a nuqs hook has a `NuqsAdapter` at or above it in its
 * layout chain. That is deterministic, needs no server, and catches a NEW
 * consumer landing in a group with no adapter — but it is satisfied by a mount
 * that merely EXISTS. It cannot tell you the page renders.
 *
 * This spec can, and only this spec can. It also has misses the vitest guard
 * does not, and they are stated rather than left to be discovered:
 *
 *   - it needs a server, a session, and DATA IN THE RIGHT BRANCH;
 *   - it cannot cover the dynamic-segment routes (see the block comment below);
 *   - it is blind to a consumer page nobody thought to add here.
 *
 * Neither is sufficient. Both are cheap. See
 * `docs/audits/nuqs-adapter-render-failure.md` §8.
 *
 * ─── WHAT IS BEING ASSERTED, AND WHY NOT JUST THE STATUS ────────────────────
 *
 * The authority is the ABSENCE of the string `nuqs requires an adapter`, not the
 * HTTP status. quick-605 measured `/carrier/driver-pay/reports` on its default
 * tab answering **HTTP 200 while throwing that error** — its `SettlementsTable`
 * sits inside a `<Suspense>` boundary, so the status line is already committed
 * by the time the deferred segment renders and fails. A status-only assertion
 * would have called that page healthy while its settlements table was replaced
 * by an error boundary.
 *
 * ─── DYNAMIC SEGMENTS ARE DELIBERATELY OUT OF SCOPE ─────────────────────────
 *
 * `/carrier/driver-pay/reports/[driverId]` and `/carrier/imports/[id]/stops` are
 * NOT here. There is no stable id for either in a CI environment, and a
 * fabricated one measures the id rather than the page — quick-605 hit exactly
 * that: a driver id taken as "the first row in the table" belonged to a
 * different tenant and the page answered 404, which looked like a verdict and
 * was not. They are covered by the vitest guard's reachability assertion and by
 * the staging sweep in the audit report, and are named as unmeasured-here in §9.
 *
 * ─── SELECTOR NOTES (repo precedent) ────────────────────────────────────────
 *
 * Wait on a real selector, never `networkidle` — the sidebar and auth-dependent
 * chrome hydrate from `useAuth()` (`navigation-reachability.spec.ts` header).
 * And do NOT use `getByRole` to prove a node is ABSENT: the accessibility tree
 * excludes `display:none` subtrees, so a role query returns 0 for a
 * hidden-but-present node (quick-559). The absence checks below read the page
 * text and use a CSS locator.
 */

const NUQS_ERROR = 'nuqs requires an adapter';

/**
 * Next's dev error DIALOG. A CSS locator, not a role query — see the header.
 *
 * `nextjs-portal` is deliberately NOT in this list, and that is a measurement,
 * not a preference. Probed in a real browser against this dev server:
 *
 *   healthy page (/carrier/driver-pay/settlements, after the fix)
 *     nextjs-portal 1 · [data-nextjs-toast] 1 · [data-nextjs-dialog] 0 · [data-nextjs-dialog-overlay] 0
 *   genuinely failing page (/carrier/trips, HTTP 500)
 *     nextjs-portal 1 · [data-nextjs-toast] 1 · [data-nextjs-dialog] 1 · [data-nextjs-dialog-overlay] 1
 *
 * `nextjs-portal` and `[data-nextjs-toast]` are the dev-tools host and are
 * present on EVERY dev page. Asserting their absence fails on correct source —
 * which is what the first draft of this spec did, on all three (owner) rows,
 * while the pages themselves were rendering perfectly. The dialog pair is the
 * only part of that set that distinguishes the two states, and it was witnessed
 * doing so in both directions before being used.
 */
const ERROR_OVERLAY = '[data-nextjs-dialog], [data-nextjs-dialog-overlay]';

async function assertRendersWithoutNuqsError(
  page: import('@playwright/test').Page,
  url: string,
  headingText: string,
) {
  const response = await page.goto(url);

  // A redirect to /sign-in means the storage state is stale; that must fail
  // loudly rather than pass because the sign-in page has no nuqs error on it.
  expect(page.url(), `${url} redirected away — the session is not valid`).not.toContain('/sign-in');

  expect(response?.status(), `${url} did not answer 200`).toBe(200);

  // A real selector, not networkidle. If the page threw before the shell
  // flushed there is no heading and this is where it fails.
  await expect(page.locator('h1', { hasText: headingText })).toBeVisible({ timeout: 20_000 });

  const body = await page.locator('body').innerText();
  expect(body, `${url} rendered the nuqs adapter error`).not.toContain(NUQS_ERROR);

  const html = await page.content();
  expect(html, `${url} carries the nuqs adapter error in its markup`).not.toContain(NUQS_ERROR);

  expect(
    await page.locator(ERROR_OVERLAY).count(),
    `${url} raised an error overlay`,
  ).toBe(0);
}

test.describe('nuqs grid render — (owner)', () => {
  test.use({ storageState: path.join(__dirname, '../../.playwright/auth/owner.json') });

  test('@smoke /carrier/driver-pay/settlements renders its grid', async ({ page }) => {
    // Unconditional `SettlementListTable` — this route answered HTTP 500 in
    // production until quick-605.
    await assertRendersWithoutNuqsError(page, '/carrier/driver-pay/settlements', 'Settlements');
  });

  test('@smoke /checklists/automation renders its grid', async ({ page }) => {
    // Unconditional `CustomRulesTable` — also HTTP 500 until quick-605.
    await assertRendersWithoutNuqsError(page, '/checklists/automation', 'Auto-Start Rules');
  });

  test('@smoke /carrier/driver-pay/reports renders a grid on an EXPLICIT tab', async ({ page }) => {
    // The `?tab=` is load-bearing. The DEFAULT tab's grid is behind a data gate
    // (`isEmpty`, page.tsx:122) that swaps the entire content block for an empty
    // state when the tenant has no payroll in the period — which is precisely how
    // this route measured 200 on an empty database while being broken. Visiting
    // the bare URL against a tenant with no payroll asserts nothing.
    // `settlement-history` has no data gate and no Suspense boundary.
    await assertRendersWithoutNuqsError(
      page,
      '/carrier/driver-pay/reports?tab=settlement-history',
      'Driver Pay Reports',
    );
  });
});

test.describe('nuqs grid render — (admin)', () => {
  // The (admin) row is the half a mount in `(owner)/layout.tsx` would have
  // missed, so it is the only browser evidence for WHY the mount is at the root.
  //
  // `test.use` is UNCONDITIONAL here, matching the five existing
  // `e2e/sysadmin/*.spec.ts` files. A guarded `fs.existsSync` skip was written
  // first and then removed: Playwright collects every spec module BEFORE the
  // `setup` project runs, so on a cold checkout the file does not exist yet at
  // module load and the block would skip itself on every CI run while looking
  // deliberate. A spec that can never run is worse than one that fails loudly
  // when `TEST_SYSADMIN_EMAIL`/`TEST_SYSADMIN_PASSWORD` are unset — which is a
  // real gap in this environment and is recorded in
  // docs/audits/nuqs-adapter-render-failure.md §9.
  test.use({ storageState: path.join(__dirname, '../../.playwright/auth/sysadmin.json') });

  test('@smoke /docs/features renders its grid', async ({ page }) => {
    // Unconditional `useDataGrid`. This page had never been measured by any task
    // before quick-605, and it answered HTTP 500.
    await assertRendersWithoutNuqsError(page, '/docs/features', 'Feature Reference');
  });
});
