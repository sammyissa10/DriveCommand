# quick-567 — SUMMARY

**Date:** 2026-08-28 · **Branch:** `master`
**Commits:** `d02cfb6d` (drop the entry, correct the comment), `c91e7336` (guard + e2e comments + mdx)
**Baseline:** `6810cc31` · **tsc:** 0 in both apps, **probed** in both · **Suite:** 1730 → 1730 tests, identical 66-test failing set (0 net delta: −1 removed `it.each` row, +1 new pinning case)

---

## Why

quick-554 added AR Aging to the mobile More menu specifically to end a
desktop/mobile disagreement. quick-566 then removed the desktop sidebar
entry, scoped to the sidebar only, and reported the mobile entry as a
"genuine surface disagreement" with a recommendation to close it. This task
closes it: AR Aging now has no nav entry on **either** surface. Route, page,
API, the `arAgingReport` permission key and its `PERMISSION_GATED_PATHS` row
are all untouched — the report is reachable only by direct URL, still gated,
same terms as the sidebar removal.

## Task 1 — Remove the entry, correct the comment

**File:** `apps/web/src/components/navigation/owner-more-menu.tsx`

Removed the AR Aging item from the `Reports` section of `menuSections`,
replacing it with a comment recording the removal and a one-line reversal:

```ts
{ label: 'Revenue', href: '/carrier/reports/revenue', icon: BarChart3, permission: 'revenueReport' },
{ label: 'Driver Pay', href: '/carrier/reports/driver-pay', icon: BarChart3, permission: 'driverPayReport' },
// AR Aging is deliberately absent — quick-567. Route, page, API, the
// arAgingReport permission key and its PERMISSION_GATED_PATHS row are all
// untouched; only this nav entry is gone, matching the sidebar
// (quick-566). Reversing this is one line:
// { label: 'AR Aging', href: '/carrier/reports/aging', icon: BarChart3, permission: 'arAgingReport' },
{ label: 'Performance', href: '/carrier/reports/performance', icon: BarChart3, permission: 'performanceReport' },
```

Rewrote the stale header-comment bullet that described AR Aging as "ADDED …
That was the only legitimate difference between the two, and it is removed
rather than preserved" — a sentence this task makes false. It now records
the full lineage: quick-554 added it here to align with the sidebar,
quick-566 removed the sidebar entry, quick-567 removes this one too, so the
surfaces agree again at "no nav entry, direct URL only" rather than at
"both have it."

**Verified before committing:**
- `BarChart3` still imported and used by Revenue/Driver Pay/Performance/
  Today's Trips — grep-verified, nothing orphaned.
- `git diff --stat` touched exactly this one file.
- `apps/web/src/app/(owner)/carrier/reports/aging/` (page.tsx,
  AgingDesktop.tsx, AgingMobile.tsx, aging-report-utils.ts),
  `apps/web/src/app/api/v1/carrier/reports/aging/route.ts`, and
  `apps/web/src/lib/auth/permissions.ts` lines 36/90/111/170/222
  (`arAgingReport` field, both defaults, the catalogue row,
  `PERMISSION_GATED_PATHS`) all present on disk, byte-unchanged.

## Task 2 — Update the guard, pin the absence, correct the doc

**File:** `apps/web/src/components/navigation/__tests__/owner-more-menu-permissions.test.ts`

1. Removed `expect(hrefs).toContain('/carrier/reports/aging')` from the
   `'an OWNER sees everything…'` case, and removed the
   `['arAgingReport', '/carrier/reports/aging']` row from the `it.each` table.
2. Added a new case, `'AR Aging has no entry for an OWNER, but the other four
   reports still do — quick-567'`, asserting the href is absent **for an
   OWNER** — the most permissive viewer, so the assertion cannot be satisfied
   by a permission simply being off — paired with the positive half
   (quick-563's rule): `revenue`, `driver-pay`, `performance`, `todays-trips`
   are all asserted present, so a passing test can't equally describe a
   Reports section that vanished entirely. Commented with why the absence is
   deliberate and how to reverse it.

**Integrity floors, checked not changed:** items 15 → 14 (floor `>= 12`,
holds); permissioned items 11 → 10 (floor `>= 9`, holds) — confirmed by the
still-green `'scanned a plausible menu (integrity floor)'` test.

**Proved the guard red before green, per the plan's explicit instruction:**
temporarily uncommented the AR Aging line in `owner-more-menu.tsx`, ran the
suite — the new case failed with `expected [...] to not include
'/carrier/reports/aging'` while all 17 other cases stayed green — then
reverted the file. `git diff` on `owner-more-menu.tsx` was empty afterward
(confirmed twice: immediately after revert, and again after the tsc probe
later touched the same file and was cleaned up). Re-ran: 18/18 green.

**`apps/web/e2e/owner/navigation-reachability.spec.ts`** — corrected the two
stale quick-566 comments (~77, ~83) that said AR Aging "had a link on ONE
surface, not zero" and "is still reachable from the mobile more-menu's
Reports section," both false after this task. `REQUIRED_SIDEBAR_HREFS` and
the sidebar-scoped counter-assertion test (`'AR Aging has no sidebar link,
but the other four reports still do'`) needed no change — they are about the
sidebar and remain correct as-is, per the grounding.

**`docs-content/client/carrier-reports-aging.mdx:25`** — rewrote:

- Before: *"On mobile, tap **More → Reports → AR Aging**. On desktop the
  report is not in the sidebar — open it directly at `/carrier/reports/aging`."*
- After: *"This report has no menu entry on either desktop or mobile — open
  it directly at `/carrier/reports/aging`."*

Names only the direct URL, no sidebar path, no More-menu path.
`feature-registry.ts`'s `carrier-reports-aging` entry was left untouched —
the route still works and `check-doc-drift.ts` requires the registry row.

## Task 3 — Verify and report

### DOM proof at 390px, real Chromium, signed in as owner

Started `next dev`, opened `/carrier/dashboard` at a 390×844 viewport using
the repo's existing `.playwright/auth/owner.json` storage state, located and
clicked the bottom nav's **More** control (a full-screen overlay, not
queried at rest), then **waited for a gated href
(`a[href="/carrier/reports/revenue"]`) to appear before reading the DOM** —
the menu fails OPEN while `useAuth()` is unloaded, so reading too early would
show everything and read as a false negative.

Full menu href list (27 unique hrefs) captured and screenshotted
(`more-menu-390.png`, saved to the session scratchpad). The **Reports**
section reads, in order: Revenue, Driver Pay, Performance, Today's Trips —
AR Aging is not among them.

```
AR Aging present:      false
revenue present:       true
driver-pay present:    true
performance present:   true
todays-trips present:  true
```

### `/carrier/reports/aging` by direct URL

Navigated directly as the signed-in owner: **HTTP 200**, `<h1>` = "AR Aging",
body text confirmed report content present (`waitUntil: 'networkidle'`). The
`PERMISSION_GATED_PATHS` gate is unmodified, so a viewer without
`arAgingReport` is still redirected exactly as before — untouched by this
task, not re-tested.

Both probe scripts were run from the repo root (where Playwright's
`node_modules` actually resolves), then deleted — `git status` confirmed
clean before and after each.

### tsc — probed in both apps

**apps/web:**
- Clean baseline: `npx tsc --noEmit` → exit 0, no output.
- Probe: appended `const __probe: number = 'y';` to
  `src/components/navigation/owner-more-menu.tsx` (a file this task actually
  edited) → `owner-more-menu.tsx(275,7): error TS2322: Type 'string' is not
  assignable to type 'number'` reported against that exact file → probe
  removed → re-ran clean, exit 0 → `git diff` on the file empty.

**apps/mobile:**
- Clean baseline: `npx tsc --noEmit` → exit 0, no output.
- Probe: appended the same line to `app/index.tsx` (a real file in the
  program; no mobile source was touched this task — grep-confirmed `apps/mobile`
  has zero references to the aging route or the More menu) →
  `app/index.tsx(20,7): error TS2322` reported against that file → probe
  removed → re-ran clean, exit 0 → `git diff` on the file empty.

Neither gate's only errors were syntax errors or confined to `.next/`; both
observed the injected error against the exact file it was injected into, so
neither was blind. No stray `__probe` files left in either tree.

### Suite — before/after, same reporter

The first baseline attempt used a `git worktree` checked out to `6810cc31`
**inside the repo**, per the worktree-safety rule — but that measured
1730/1575/66/86 (passed/pending differing by 25 from quick-566's own
published baseline at the *same* commit), traced to the worktree lacking
`apps/web/.env.local` (untracked, gitignored, so `git worktree add` never
copies it) — some DB-dependent tests behave differently without it. The
worktree was removed (`git worktree remove --force`) and discarded as
invalid.

Re-measured properly in the **main tree**, stopping `next dev` first (no
further browser checks pending), using `git checkout <rev> -- .` to swap the
four task-touched files to each commit's state in place — `.env.local` stays
present throughout since it's untracked. Both runs used
`npx vitest run --reporter=json`, one process at a time, no edits during
either run:

| | Total tests | Passed | Failed | Pending | Test files/suites |
|---|---|---|---|---|---|
| **Before** (`6810cc31`) | 1730 | 1600 | 66 | 61 | 600 |
| **After** (`c91e7336`, current HEAD) | 1730 | 1600 | 66 | 61 | 600 |

The "before" figures reproduce quick-566's own published baseline
(1730/1600/66/61) exactly, confirming the corrected method is sound.

**Arithmetic for the identical total:** Task 2 removed one `it.each` row
(`arAgingReport`, one generated test) and removed one assertion from an
existing test (no test-count change), then added one new test
(`'AR Aging has no entry for an OWNER…'`). Net: −1 + 1 = **0** — matching
the plan's expectation of "a small negative delta … plus a small positive …
state the arithmetic."

Diffed the failing-test **identity** sets, not just counts (18 failing test
files both runs): byte-identical after normalizing path separators — 0 newly
failing, 0 newly fixed. `git checkout HEAD -- .` restored the tree to
post-task state before this diff and before the tsc probes above.

### Lint

`apps/web` has no working lint entry point: `npx next lint` returns
`Invalid project directory provided, no such directory:
…\apps\web\lint` (this Next version rejects the old `--dir` invocation
pattern) and ESLint 9 finds no flat config (`.eslintrc.*` only). Reported as
unavailable, not claimed as passing — `tsc` is the only gate that actually
executes, reported and probed above.

## Diff summary

```
d02cfb6d  fix(quick-567): drop AR Aging from the mobile More menu
  apps/web/src/components/navigation/owner-more-menu.tsx | 18 ++++++++++++++----
  1 file changed, 14 insertions(+), 4 deletions(-)

c91e7336  test(quick-567): pin AR Aging's absence from both nav surfaces
  apps/web/e2e/owner/navigation-reachability.spec.ts                       | 14 ++++++++------
  apps/web/src/components/navigation/__tests__/owner-more-menu-permissions.test.ts | 20 ++++++++++++++++++--
  docs-content/client/carrier-reports-aging.mdx                            |  2 +-
  3 files changed, 27 insertions(+), 9 deletions(-)

TOTAL: 4 files changed, 41 insertions(+), 13 deletions(-)
```

Exactly the four files the plan named — `owner-more-menu.tsx`, its
permissions test, the e2e spec's stale comments, and the one `.mdx` sentence
— nothing else in the tree touched. `components/Sidebar/` (desktop sidebar)
has zero diff this task, confirmed via `git diff --stat` against `6810cc31`.

## Self-Check: PASSED

- FOUND: `.planning/quick/567-hide-ar-aging-from-the-mobile-more-menu-/567-SUMMARY.md`
- FOUND: `apps/web/src/components/navigation/owner-more-menu.tsx`
- FOUND: `apps/web/src/components/navigation/__tests__/owner-more-menu-permissions.test.ts`
- FOUND: `apps/web/e2e/owner/navigation-reachability.spec.ts`
- FOUND: `docs-content/client/carrier-reports-aging.mdx`
- FOUND: commit `d02cfb6d`
- FOUND: commit `c91e7336`

---

## Per-item audit

| Brief item | Status | Evidence |
|---|---|---|
| **1 — AR Aging entry removed from owner-more-menu.tsx, nav entry only (route/page/API/permission gate/PERMISSION_GATED_PATHS all intact)** | **IMPLEMENTED** | The item deleted from `menuSections`'s Reports array; `page.tsx`/`AgingDesktop.tsx`/`AgingMobile.tsx`/`aging-report-utils.ts`, `api/v1/carrier/reports/aging/route.ts`, and `permissions.ts` lines 36/90/111/170/222 all verified present and byte-unchanged on disk; live 200 response confirms the API/gate chain still works end to end. |
| **2 — The same reversal comment added** | **IMPLEMENTED** | Inline comment above the deleted line names quick-567, states route/API/permission/`PERMISSION_GATED_PATHS` are intact, and gives the exact one-line reinstatement — same shape as quick-566's sidebar comment. The file header's stale "AR Aging is ADDED… removed rather than preserved" bullet was also corrected to record the full quick-554 → quick-566 → quick-567 lineage. |
| **3 — docs-content/client/carrier-reports-aging.mdx names ONLY the direct URL** | **IMPLEMENTED** | Step text rewritten to "This report has no menu entry on either desktop or mobile — open it directly at `/carrier/reports/aging`." No sidebar path, no More-menu path remain anywhere in the file. |
| **4 — DOM proof at 390px showing the entry absent, and /carrier/reports/aging confirmed 200 by URL** | **IMPLEMENTED** | Real Chromium at 390×844, signed in as owner, More overlay opened via the bottom nav control, waited for a gated href before reading — AR Aging absent, the other four report hrefs present, screenshot captured. Direct URL returned HTTP 200 with the report rendering. |

---
*Task: quick-567*
*Completed: 2026-08-28*
