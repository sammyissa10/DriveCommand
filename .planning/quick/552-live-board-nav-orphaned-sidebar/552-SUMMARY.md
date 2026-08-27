---
phase: quick-552
plan: 552
subsystem: ui
tags: [navigation, sidebar, vitest, dead-code, guard-test]

requires:
  - phase: quick-551
    provides: "Live Board sidebar entry (added to the wrong, orphaned component)"
provides:
  - "Live Board entry rendered in the real mounted sidebar (AnimatedSidebar), nested under Live Map"
  - "Deletion of four orphaned navigation components (three named + one found by the guard)"
  - "A mechanical vitest guard that fails a future edit to an unimported nav component"
affects: [navigation, sidebar, live-map, quick-testing-conventions]

tech-stack:
  added: []
  patterns:
    - "Source-scanning guard test (read files, never import) with CRLF normalisation and an integrity floor, following the quick-546 idiom"
    - "NavItem.children rendered as an inline submenu for capped nav sections (precedent: Document Imports under Trips)"

key-files:
  created:
    - apps/web/src/components/__tests__/no-orphaned-navigation-components.test.ts
  modified:
    - apps/web/src/components/Sidebar/index.tsx

key-decisions:
  - "Live Board is a child of Live Map, not a third top-level Intelligence item — the section is capped at two and the board is a view of the same route, not a peer destination."
  - "Today's Trips was deliberately NOT added to the real sidebar — that sidebar carries no reports links by design, and owner-more-menu.tsx (live) already surfaces Driver Pay/reports; adding one lone reports entry to the sidebar would be an unscoped IA decision."
  - "A fourth orphan (pending-pay-badge.tsx, quick-301) not named in the plan's diagnosis was found by the guard and deleted under the same rationale as the three named files, since the guard's own done-criteria requires zero allowlist."

patterns-established:
  - "No-allowlist orphan guard: apps/web/src/components/__tests__/no-orphaned-navigation-components.test.ts — extend NAV_DIRS if another directory needs the same protection; never add an exemption list."

duration: 25min
completed: 2026-08-26
---

# Quick Task 552: Wire Live Board Into the Real Sidebar, Delete Dead Nav Components Summary

**Moved the quick-551 "Live Board" entry from an unmounted `AppSidebar` component into `AnimatedSidebar` (the sidebar actually rendered by `owner-shell.tsx`) as a child of Live Map, deleted four verified-dead navigation files (three diagnosed + one the new guard found), and shipped a source-scanning vitest guard so the next orphaned nav edit fails a test instead of shipping invisibly.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-26
- **Completed:** 2026-08-26
- **Tasks:** 2 completed
- **Files modified:** 6 (1 edited, 4 deleted, 1 created)

## Accomplishments

- "Live Board" (`/live-map?view=board`, `ListChecks` icon) now renders as `children[0]` of the "Live Map" `NavItem` in `apps/web/src/components/Sidebar/index.tsx` — the component `owner-shell.tsx` actually imports and mounts as `AnimatedSidebar`. The Intelligence group's two-item cap (Live Map, Carrier Dashboard) is unchanged; the board is a submenu entry, not a third peer.
- Deleted the three diagnosed orphans with zero importers anywhere in `src/`, `e2e/`, `tests/`: `apps/web/src/components/navigation/sidebar.tsx` (the unmounted `AppSidebar`, 670 lines, carrying both quick-551's Live Board entry and Phase 11's "Today's Trips" entry — neither ever rendered), `apps/web/src/components/navigation/support-badge.tsx`, `apps/web/src/components/Sidebar/SidebarSearch.tsx`.
- Added `apps/web/src/components/__tests__/no-orphaned-navigation-components.test.ts`: reads (never imports) every `.ts`/`.tsx` file under `src/components/navigation/` and `src/components/Sidebar/` (excluding `index.tsx` and `__tests__`), and asserts each has at least one importer somewhere in `src/`, matched by module-specifier ending in the file's basename (regex-escaped, anchored on the closing quote — a bare substring match on `sidebar` would false-negative against `sidebar.config`). CRLF-normalises every read (`core.autocrlf=true`, no `.gitattributes`) and carries an integrity floor (≥10 candidates, ≥50 total sources scanned) so a broken glob cannot pass vacuously. No allowlist.
- The guard immediately found a **fourth, undiagnosed orphan** on its first real run — see Deviations below — and was proven to fail correctly on a deliberately introduced scratch file before being proven green again.

## Task Commits

1. **Task 1: Add Live Board as a child of Live Map in the sidebar that is actually mounted** - `dc6a1805` (feat)
2. **Task 2: Delete the three orphaned navigation components and add the mechanical orphan guard** - `5952ad92` (fix — includes the guard test and all four deletions)

_No separate plan-metadata commit requested; STATE.md update follows this summary in the same task._

## Files Created/Modified

- `apps/web/src/components/Sidebar/index.tsx` - Live Map's `NavItem` gained a `children: [{ label: "Live Board", href: "/live-map?view=board", icon: ListChecks }]` array, with an explanatory comment matching the in-repo "Document Imports under Trips" precedent. No new import added (`ListChecks` was already imported at line 37).
- `apps/web/src/components/__tests__/no-orphaned-navigation-components.test.ts` - new guard test (2 `it` blocks: integrity floor, orphan scan).
- `apps/web/src/components/navigation/sidebar.tsx` - deleted (`git rm`).
- `apps/web/src/components/navigation/support-badge.tsx` - deleted (`git rm`).
- `apps/web/src/components/Sidebar/SidebarSearch.tsx` - deleted (`git rm`).
- `apps/web/src/components/navigation/pending-pay-badge.tsx` - deleted (`git rm`) — see Deviations.

## Decisions Made

- **The collapsed-sidebar caveat, stated explicitly per the plan's output requirement:** `useSidebarState.ts:35` defaults `isExpanded` to `true`, so on a cold start the Live Board child link is inline in the DOM (`SidebarGroup.tsx:79-99`). A user who has previously collapsed the sidebar reaches Live Map's children through the hover flyout instead (`SidebarGroup.tsx:66`). This was deliberately not changed by this task — it is existing, correct behavior for every other capped-section child (e.g. Document Imports under Trips) and changing it would be a UX decision outside this task's scope.
- **"Today's Trips" was deliberately NOT added to the real sidebar.** `grep -rn "reports" src/components/Sidebar/` is empty by design — that sidebar carries no reports links at all. `owner-more-menu.tsx` is live (imported by `owner-bottom-nav.tsx:7`) and already lists a "Driver Pay" reports entry, so Today's Trips-style reports are already reachable through the More menu. Adding a lone Reports entry to the capped sidebar would be a standalone IA decision this task has no mandate to make.
- **The guard ships with no allowlist, and none should ever be added.** An exemption list quietly grows, and the first exemption is the moment the guard stops proving anything — exactly the shape of failure that let quick-551's entry and Phase 11's entry both ship invisibly for phases at a time.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Deleted a fourth orphaned navigation component the plan's diagnosis did not name**
- **Found during:** Task 2, first real run of the newly-written guard (before the deliberate red/green proof)
- **Issue:** The guard, implemented exactly to the plan's spec, failed on its first run — not because of a test bug, but because it found `apps/web/src/components/navigation/pending-pay-badge.tsx` (from quick-301) has zero importers anywhere in `src/`, `e2e/`, or `tests/`. It exports `PendingPayBadge`, meant to render a red count badge beside a "Driver Pay" nav link. The live "Driver Pay" entry (`owner-more-menu.tsx:59`) never imports or renders it — the badge component has been dead code since it shipped. The plan's diagnosis (item 6) asserted "exactly three" orphaned files and explicitly said not to re-derive it; this is not a re-litigation of that diagnosis, it is the guard doing exactly the job it was built for and finding a real defect the manual scan missed. The plan's own success criteria for the guard is "no allowlist" and "passes with nothing exempted after the Part A deletions" — those two statements are only simultaneously true if this orphan is also resolved, since it lives in one of the two directories the guard is scoped to.
- **Fix:** Verified with a full `grep -rln "pending-pay-badge\|PendingPayBadge" src e2e tests` that the only hit was the file's own definition, confirmed the live "Driver Pay" menu entry (`owner-more-menu.tsx`) has no badge rendering, and deleted the file via `git rm` under the identical rationale as the three named orphans — wire it or delete it, and wiring it (deciding where a pending-pay badge belongs in the current IA) is a product decision outside this task's mandate, whereas deleting genuinely dead code is not.
- **Files modified:** `apps/web/src/components/navigation/pending-pay-badge.tsx` (deleted)
- **Verification:** Guard passes 2/2 with the file gone; re-confirmed no references remain anywhere in `src`/`e2e`/`tests`.
- **Committed in:** `5952ad92` (Task 2 commit, same commit as the three planned deletions and the guard)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking issue, the guard's own pass criterion required it)
**Impact on plan:** Necessary for the guard to ship with zero allowlist as the plan mandates. No scope creep — same class of fix (delete verified-dead nav code), same two directories the plan already scoped the guard to, no new files installed or architecture touched.

## Issues Encountered

- **Plan-authored grep expectations don't literally hold, harmlessly.** The plan's own exact code snippet for the Live Map comment contains the literal string `/live-map?view=board` inside a prose comment, so `grep -n "view=board" src/components/Sidebar/index.tsx` prints 2 lines (the comment plus the real `href`) rather than the "exactly one line" the verify step describes. Likewise the guard test's own doc-comment (written verbatim per the plan's required exact shape) contains the strings `navigation/sidebar` and `AppSidebar` in its historical explanation, so `grep -rn "navigation/sidebar\|AppSidebar\|support-badge\|SupportBadge\|SidebarSearch" src e2e tests` reports 2 lines from that comment rather than "no output." Both are artifacts of the plan's own required verbatim text, not dangling code references — confirmed by inspection that in both cases the only non-comment hit is the intended one (the real `href` in the first case; zero real code references in the second, since `no-orphaned-navigation-components.test.ts` was excluded from the deletion-reference grep by construction — it's the guard itself). No code change was made to work around this; it's noted here as a discrepancy between the plan's literal verify commands and its own literal required content.
- No other issues. TDD-style probes (blind-gate check on `tsc --noEmit`) were run before and after each task per the verification discipline and both confirmed the gate is not blind.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The sidebar / nav-component orphan class of bug (quick-551, Phase 11, and now the pending-pay-badge finding) now has a standing mechanical guard in CI-equivalent test runs (`npx vitest run src/components/__tests__/`). Any future nav component added under `src/components/navigation/` or `src/components/Sidebar/` without an importer will fail this test rather than shipping invisibly.
- No blockers. The board itself, `board-*.ts`, `BoardRow.tsx`, `LiveBoard.tsx`, `BoardToggle.tsx`, `live-map-wrapper.tsx`, `live-map/page.tsx`, and the Map default were not touched, per the task constraints.
- Not deployed/pushed (per workflow — orchestrator pushes once at the end, not the executor).

---
*Phase: quick-552*
*Completed: 2026-08-26*

## Self-Check: PASSED

- FOUND: `apps/web/src/components/__tests__/no-orphaned-navigation-components.test.ts`
- CONFIRMED DELETED: `apps/web/src/components/navigation/sidebar.tsx`
- CONFIRMED DELETED: `apps/web/src/components/navigation/support-badge.tsx`
- CONFIRMED DELETED: `apps/web/src/components/Sidebar/SidebarSearch.tsx`
- CONFIRMED DELETED: `apps/web/src/components/navigation/pending-pay-badge.tsx`
- FOUND: `.planning/quick/552-live-board-nav-orphaned-sidebar/552-SUMMARY.md`
- FOUND commit: `dc6a1805`
- FOUND commit: `5952ad92`

---

## Addendum — orchestrator verification (af0beb17)

The plan's child-item shape was **verified in a real browser and reverted.**

`SidebarGroup.tsx:79-95` renders a parent that has `children` as a plain `<div>`,
not a `<Link>`. Adding Live Board as a child of Live Map therefore removed the
sidebar's only link to `/live-map` — one unreachable page traded for another.
Neither `tsc`, the orphan guard, nor reading the diff can see this; only the DOM
can. Live Board is now a third top-level INTELLIGENCE item and the section's
"Max 2" comment is raised to 3 with the reasoning recorded inline.

**DOM proof** — OWNER (`demo@drivecommand.com`) on `/carrier/dashboard`,
`document.querySelectorAll('a')` filtered `/live|board/i`:

```
  "DriveCommand"      -> /carrier/dashboard
  "Live Map"          -> /live-map                 <- sidebar, still clickable
  "Live Board"        -> /live-map?view=board      <- the fix
  "Carrier Dashboard" -> /carrier/dashboard
  "Carrier"           -> /carrier/dashboard
  "Dashboard"         -> /carrier/dashboard
  "Live Map"          -> /live-map                 <- bottom nav
```

**A false negative worth recording.** The first DOM runs reported the link
missing *after* the fix was correct. The sidebar hydrates from `useAuth()` and
renders no links on first paint, so `waitForLoadState('networkidle')` returned
while only the bottom nav existed — and the bottom nav also contains a
`/live-map` link, so the dump looked like a plausible sidebar. Two wrong
conclusions followed (a stale Turbopack cache, then a broken fix) before waiting
on a sidebar-only selector showed the truth. **When asserting a nav element is
absent, first prove the component that owns it has rendered at all.**

**Also found, reported not fixed:** `Trips` has the identical defect from its
Document Imports child — `/carrier/trips` has no sidebar link either.

**New permanent guard:** `e2e/owner/navigation-reachability.spec.ts`, proven red
against a deliberately missing href before being trusted.
