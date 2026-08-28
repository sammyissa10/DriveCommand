# quick-566 — SUMMARY

**Date:** 2026-08-28 · **Branch:** `master`
**Commits:** `b2377450` (the two source edits), `70311521` (the e2e spec + mdx correction)
**Baseline:** `1cb97699` · **tsc:** 0 in both apps, **probed** in both · **Suite:** 1730 → 1730 tests, identical 66-test failing set (0 delta)

---

## Step 1 — The indent

**File:** `apps/web/src/components/Sidebar/SidebarGroup.tsx:107`

| | Class | Measured left offsets (1568px, real Chromium, `getBoundingClientRect()`) |
|---|---|---|
| **Before** | `ml-6 space-y-1 border-l border-sidebar-border pl-3` | Trips icon `16px` → Document Imports icon `53px` → **delta 37px**. Trips label starts at `44px` — the child icon (53px) sits **past** the label. |
| **After**  | `ml-2 space-y-1 border-l border-sidebar-border pl-3` | Trips icon `16px` → Document Imports icon `37px` → **delta 21px**. Trips label starts at `43.88px` — the child icon (37px) now sits **strictly between** the parent icon (16px) and the parent label (43.88px). |

Only `ml-6` → `ml-2` changed; `border-l border-sidebar-border` and `space-y-1`
were kept exactly as the grounding specified. `SidebarFlyout.tsx` (collapsed
rail) has zero diff — confirmed via `git status`/`git diff` throughout, it was
never touched.

**How "before" was measured:** the committed tree already carries `ml-2`. To
get a real before/after pair I temporarily edited the class back to `ml-6` in
the running dev server (HMR picked it up, not a stash/swap — no Turbopack
cache poisoning), re-ran the measurement script, then restored `ml-2` and
re-verified. `git diff`/`git status` on the file were empty both before this
detour and after — the working tree never carried the temporary edit.

## Step 2 — AR Aging removed from the desktop sidebar only

**File:** `apps/web/src/components/Sidebar/index.tsx` (~line 476, inside the
`REPORTS` block's `isOwnerOrManager` branch)

Removed:
```ts
if (managerHasPermission(perms, "arAgingReport", userRole)) {
  reportsItems.push({
    label: "AR Aging",
    href: "/carrier/reports/aging",
    icon: BarChart3,
  })
}
```
Replaced with an expanded block comment recording why, what survives, and how
to reverse it (see the commit). `BarChart3` is still imported and used by
Revenue/Driver Pay/Performance — grep-verified, nothing orphaned.

**Proof everything else survived, in production code paths:**
- `grep -n "reports/aging" apps/web/src/lib/auth/permissions.ts` still matches all
  three sites: the `arAgingReport` field comment (line 36), the permission
  catalogue row (line 170), and `PERMISSION_GATED_PATHS` (line 222).
- `apps/web/src/app/(owner)/carrier/reports/aging/page.tsx` and
  `apps/web/src/app/api/v1/carrier/reports/aging/route.ts` both still exist on disk.
- Live-browser proof: navigating directly to `/carrier/reports/aging` at 1568px
  as the signed-in owner returned **HTTP 200** and rendered the full report
  (breadcrumb `Carrier > Reports > AR Aging`, heading "AR Aging Report", body
  "Accounts receivable bucketed by age…"). The permission gate itself
  (`PERMISSION_GATED_PATHS`) is untouched, so a user without `arAgingReport`
  is still redirected exactly as before — no code on that path changed.

## Step 3 — Every other AR Aging reference, audited

| Location | Verdict | Notes |
|---|---|---|
| `apps/web/src/components/navigation/owner-more-menu.tsx:96` | **LEAVE IT** | Real nav link, `lg:hidden` (mobile only). The brief scoped this task to the desktop sidebar; the more-menu is a different, explicitly out-of-scope surface. **Result: a genuine surface disagreement** — AR Aging is reachable on mobile (More → Reports → AR Aging) but not on desktop. **Recommendation:** if the owner's intent was "hide AR Aging everywhere," a follow-up quick task should remove it from `owner-more-menu.tsx` too, in the same one-line-reversible shape. If the intent was specifically "get it off the crowded desktop rail while keeping it one tap away on mobile," no further action is needed — leave as is. Reported per the plan's explicit instruction; not resolved here because the brief said "sidebar only" and "do not change any other nav entry." |
| `apps/web/src/components/carrier/CarrierBreadcrumb.tsx:21` | **Unaffected** | `aging: "AR Aging"` is a label map for the breadcrumb trail, not a link source. Confirmed live — the aging page's breadcrumb still renders `Carrier > Reports > AR Aging` correctly when reached by URL. |
| `apps/web/src/components/carrier/clients/ClientFinancials.tsx` | **Unaffected** | Fetches `/api/v1/carrier/reports/aging` and renders buckets inline on a client's financials tab. An API consumer, not a nav link — confirms why the API route must (and does) survive. |
| `apps/web/src/lib/docs/feature-registry.ts:276-284` | **Kept, unchanged** | The `carrier-reports-aging` registry entry stays — the route still works, the doc is still true, and `check-doc-drift.ts` requires every doc'd route to have a registry row. |
| `docs-content/client/carrier-reports-aging.mdx:25` | **Corrected** | Old: *"Navigate to **Carrier → Reports → AR Aging**. The report loads with all unpaid invoices."* — a false desktop-sidebar claim as of this task. New: *"On mobile, tap **More → Reports → AR Aging**. On desktop the report is not in the sidebar — open it directly at `/carrier/reports/aging`. The report loads with all unpaid invoices."* — states the truth on both surfaces rather than only the mobile one. |
| `docs-content/sysadmin/carrier-reports-aging.mdx` | **No change** | Read in full. Zero sentences about sidebar/nav reachability — it documents route, server action, aging-bucket logic and the `Invoice` schema only. Confirmed no correction needed. |
| `apps/web/src/lib/carrier/__tests__/reports-permission-gating.test.ts` | **Green, untouched** | 46/46 passing before and after this task; `git diff --stat` shows the file with zero changes. |
| `apps/web/src/components/navigation/__tests__/owner-more-menu-permissions.test.ts` | **Green, untouched** | 18/18 passing before and after; zero diff. |

## Step 4 — The e2e spec asserts nav presence, not route reachability

`apps/web/e2e/owner/navigation-reachability.spec.ts`'s existing test walks
`document.querySelectorAll('a')` against `REQUIRED_SIDEBAR_HREFS` — it is a DOM
presence check, never a navigation/route-load check (that half is already
covered separately by the live "aging page loads by URL" verification in Step 2).

Changes:
1. Removed `'/carrier/reports/aging'` from `REQUIRED_SIDEBAR_HREFS`.
2. Rewrote the comment block that said AR Aging "had none on ANY surface — it
   is not in the mobile more-menu either" (false since quick-554), replacing it
   with the true, current state and a pointer to the new negative assertion.
3. Added a new test, `'AR Aging has no sidebar link, but the other four
   reports still do'`, scoped to `aside a` (not every `<a>` on the page) so an
   unrelated in-page link can't trip either half. It asserts BOTH:
   - `/carrier/reports/aging` is **absent** from the sidebar, and
   - the four other report hrefs (`revenue`, `driver-pay`, `performance`,
     `todays-trips` — read directly off `REQUIRED_SIDEBAR_HREFS`, not retyped)
     are all still **present**.

   Per quick-563's rule, the positive half is load-bearing: without it, the
   negative assertion alone would pass identically if the whole REPORTS group
   vanished, which says nothing about the actual decision being pinned.
4. Reused the spec's existing hydration-safe wait,
   `a[href="/live-map?view=board"]` — never `networkidle`.

## Step 5 — DOM proof at 1568px (real Chromium, signed in as owner)

Waited on `a[href="/live-map?view=board"]` before reading the DOM (never
`networkidle`).

**Full sidebar (`aside a`) href list** (22 links):
```
/carrier/dashboard
/live-map
/live-map?view=board
/carrier/dashboard
/carrier/clients
/carrier/contracts
/routes
/carrier/loads
/carrier/trips
/carrier/imports
/carrier/fleet/drivers
/carrier/fleet/trucks
/carrier/facilities
/checklists
/carrier/templates
/carrier/reports/revenue
/carrier/reports/driver-pay
/carrier/reports/performance
/carrier/reports/todays-trips
/carrier/messages
/settings
/help
```

- **`/carrier/reports/aging` — ABSENT.** Confirmed `sidebarHrefs.includes('/carrier/reports/aging') === false`.
- **The other four report hrefs — ALL PRESENT:** `revenue` ✓, `driver-pay` ✓, `performance` ✓, `todays-trips` ✓.
- **Indent offset** (see Step 1 table): before `37px`, after `21px`, both measured with `getBoundingClientRect()` on the actual `<svg>` icons inside the `Trips` and `Document Imports` `<a>` elements.
- **`/carrier/reports/aging` still loads by URL:** navigated directly, got HTTP `200`, page rendered with breadcrumb and heading intact. The permission gate (`PERMISSION_GATED_PATHS`) is unmodified, so this proves reachability survived without re-testing the negative (denied) case, which was already covered by the untouched, still-green `reports-permission-gating.test.ts`.

No red DOM check was hit during this task, so the Turbopack-cache-poisoning
caveat never had to be invoked — noted for completeness since the constraint
required addressing it.

## Diff summary

```
b2377450  fix(quick-566): tighten child-row indent, drop AR Aging from desktop nav
  apps/web/src/components/Sidebar/SidebarGroup.tsx |  2 +-
  apps/web/src/components/Sidebar/index.tsx        | 25 ++++++++++++------------
  2 files changed, 14 insertions(+), 13 deletions(-)

70311521  test(quick-566): pin AR Aging's desktop-nav absence, correct stale mdx claim
  apps/web/e2e/owner/navigation-reachability.spec.ts | 51 ++++++++++++++++++++--
  docs-content/client/carrier-reports-aging.mdx      |  2 +-
  2 files changed, 49 insertions(+), 4 deletions(-)

TOTAL: 4 files changed, 63 insertions(+), 17 deletions(-)
```
Exactly the three source files the plan named (`SidebarGroup.tsx`,
`Sidebar/index.tsx`, `navigation-reachability.spec.ts`) plus the one `.mdx`
sentence that was actually false — nothing else in the tree touched
(`git status --short` clean before commit, clean after, apart from this
plan's own directory).

## tsc — probed in both apps

**apps/web:**
- Clean baseline: `npx tsc --noEmit` → exit `0`, no output.
- Probe: injected `const __probe: number = "y";` at top level of
  `src/components/Sidebar/SidebarGroup.tsx` (a file actually edited this task)
  → `error TS2322: Type 'string' is not assignable to type 'number'` reported
  **against that exact file** → probe removed → re-ran clean, exit `0`,
  `git diff`/`git status` on the file empty.

**apps/mobile:**
- Clean baseline: `npx tsc --noEmit` → exit `0`, no output.
- Probe: injected the same line into `app/index.tsx` (a real file in the
  program; mobile has no source touched by this task) → `error TS2322` reported
  against that file → probe removed → re-ran clean, exit `0`, file byte-identical
  to git (`git diff` empty).

No stray `__probe.ts`/`__probe` files left in either tree — grep-verified after
cleanup. Neither run's only errors were syntax errors or confined to
`.next/`; both gates observed the injected error, so neither was blind.

## Suite — before/after, same reporter

Both runs used `npx vitest run --reporter=json` in `apps/web`, captured on a
clean tree (baseline before any edit; after-run once all edits were committed
and the file changes verified — never mid-run).

| | Total tests | Passed | Failed | Pending | Test files/suites |
|---|---|---|---|---|---|
| **Before** (`1cb97699`) | 1730 | 1600 | 66 | 61 | 600 |
| **After** (`70311521`) | 1730 | 1600 | 66 | 61 | 600 |

Diffed the failing-test identity sets (not just counts): **0 tests newly
failing, 0 tests newly passing** — the exact same 66 pre-existing failures in
both runs (unrelated to this task; present before any edit was made). The two
named permission tests (`reports-permission-gating.test.ts`,
`owner-more-menu-permissions.test.ts`) were green in both runs.

## Lint

`apps/web` has **no working lint entry point** — `next lint` rejects `--dir` on
this Next version and ESLint 9 finds no flat config (the repo still carries
`.eslintrc.*`). Not run; not claimed as passing. `tsc` is the only gate that
actually executes, and it is reported above, probed.

---

## Per-item audit

| Step | Status | Evidence |
|---|---|---|
| **1 — Reduce child indent** | **IMPLEMENTED** | `ml-6` → `ml-2` at `SidebarGroup.tsx:107`; browser-measured delta 37px → 21px, child icon now strictly between parent icon (16px) and parent label (43.88px). `SidebarFlyout.tsx` untouched. |
| **2 — Remove AR Aging sidebar entry** | **IMPLEMENTED** | Push removed from `Sidebar/index.tsx`'s REPORTS block only; route/page/API/permission/`PERMISSION_GATED_PATHS` all verified intact on disk and live (200, gate unmodified); reversal comment added. |
| **3 — Audit every other AR Aging reference** | **IMPLEMENTED** | All six locations from the grounding checked (more-menu, breadcrumb, ClientFinancials, feature-registry, both `.mdx`s, both permission tests); one false `.mdx` sentence corrected, one surface disagreement (mobile more-menu) reported with a recommendation, nothing else needed changing. |
| **4 — Update e2e spec to assert absence as a decision** | **IMPLEMENTED** | `REQUIRED_SIDEBAR_HREFS` no longer requires it; new counter-assertion test proves both the absence AND the other four presences, scoped to `aside a`; stale comment corrected. |
| **5 — DOM-verify at 1568px + probe both tsc gates + diff suite + report** | **IMPLEMENTED** | Full sidebar href list captured live, AR Aging absence and the four presences confirmed, indent measured before/after, both tsc gates probed non-blind in both apps, suite diffed like-for-like with the same reporter and an identical failing-test set, lint status reported as unavailable rather than claimed. |

## Self-Check: PASSED

- FOUND: `.planning/quick/566-reduce-child-item-indent-in-mounted-side/566-SUMMARY.md`
- FOUND: `apps/web/src/components/Sidebar/SidebarGroup.tsx`
- FOUND: `apps/web/src/components/Sidebar/index.tsx`
- FOUND: `apps/web/e2e/owner/navigation-reachability.spec.ts`
- FOUND: commit `b2377450`
- FOUND: commit `70311521`
