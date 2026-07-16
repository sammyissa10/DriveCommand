---
phase: quick-469
plan: 1
subsystem: ui
tags: [nextjs, react, mobile-web, design-system, zod, prisma, carrier-loads]

# Dependency graph
requires:
  - phase: quick (Loads Overview + Create mobile-web rebuild)
    provides: LoadsMobile.tsx (STATUS_META tones, LargeTitleHeader pattern) and NewLoadMobile.tsx
      (RATE_TYPES vocabulary, calculateRevenuePreview usage, MobileStopsEditor)
provides:
  - Shared RATE_TYPES const (src/lib/carrier/rate-types.ts) backing all 3 carrier rate-type Zod schemas
  - LoadDetailMobile.tsx — the 4th and final page of the Loads mobile-web four-page set
  - Server-derived contract/facility select options pattern for detail pages
affects: [carrier-loads, mobile-design-system-log, carrier-mobile-web]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tabs stay visible through Edit mode; each tab flips its own view/edit content off one isEditing flag (diverges from TripDetailMobile's single-form-swap pattern) so a child editor (MobileStopsEditor) can feed the same save payload as the parent Details tab"
    - "All <select> options for a detail page are resolved server-side in page.tsx, including contracts scoped to the record's own clientId — prevents the 'first option renders when no <option> matches value' bug"

key-files:
  created:
    - apps/web/src/lib/carrier/rate-types.ts
    - "apps/web/src/app/(owner)/carrier/loads/[id]/LoadDetailMobile.tsx"
  modified:
    - "apps/web/src/app/api/v1/carrier/loads/[id]/route.ts"
    - apps/web/src/app/api/v1/carrier/loads/route.ts
    - apps/web/src/app/api/v1/carrier/contracts/route.ts
    - "apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx"
    - .planning/mobile-design-system.md

key-decisions:
  - "Shared RATE_TYPES tuple (8 values) backs loads PATCH/POST and contracts POST Zod schemas — the PATCH schema had drifted to 6 values, making per_load/per_hour loads unsaveable on edit"
  - "Tabs (Details/Stops/Assignments) stay mounted through Edit; each swaps its own content, because the Stops tab's MobileStopsEditor writes into the same stops array the Details tab PATCHes — no second save path"
  - "invoiced reads StatusPill tone=success like delivered (locked in LoadsMobile, reused here) — vip amber is reserved for VIP tags, desktop's purple has no ds equivalent"
  - "ParentStrip trip chip links to /carrier/trips/[dispatchId], not /carrier/dispatches/... (post-4986a301 redirect removal)"
  - "Add to Trip omits route-template prefill and co-driver — desktop-only conveniences not required to put a load on a trip; desktop modal stays available at lg+"
  - "Driver-pay Assignments tab is read-only on mobile (listAssignmentsForLoad); creating/editing assignments stays desktop-only for this task"

patterns-established:
  - "Detail-page tabs that must feed one save payload keep tabs visible through isEditing rather than swapping to a single edit form"

# Metrics
duration: ~25min
completed: 2026-07-15
---

# Quick 469: Rebuild carrier Loads Detail on the mobile-web design system Summary

**LoadDetailMobile.tsx closes the Loads four-page mobile-web set (Overview/Create/Detail/Edit) and fixes a stale PATCH Zod enum that made `per_load`/`per_hour` loads unsaveable after creation.**

## Performance

- **Duration:** ~25 min (first commit 19:01, last commit 19:20 local)
- **Started:** 2026-07-15T19:01:21-05:00 (approx, includes pre-commit research)
- **Completed:** 2026-07-15T19:20:19-05:00
- **Tasks:** 3
- **Files modified:** 8 (6 code files + mobile-design-system.md log + this summary)

## Accomplishments

- Fixed the PATCH `LoadUpdateSchema` rate-type enum drift (6 values vs the 8 everywhere else) via one shared `RATE_TYPES` const — a load created as `per_load` or `per_hour` can now be edited and saved without a 400.
- Rebuilt `/carrier/loads/[id]` on the mobile-web design system: identity + status pill, `ParentStrip` to the trip, Details/Stops/Assignments tabs, single `isEditing` flag driving Client/Contract/Commodity/Rate/Instructions with live revenue preview, audit footer.
- Add to Trip (new-trip / existing-trip modes) and Cancel Load (reason + conditional stop-removal toggle) ported with the desktop's exact gating logic.
- Stops tab: dot timeline with status pills in view mode, swaps to the shared `MobileStopsEditor` under Edit — same array feeds the Details-tab save, no second save path.
- Assignments tab: read-only rows from `listAssignmentsForLoad`, ported rate-formatting vocabulary from the desktop `assignment-card.tsx`.
- Desktop `/carrier/loads/[id]` at `lg:` and above is byte-for-byte unchanged.

## Task Commits

1. **Task 1: Fix the stale PATCH rate-type enum** - `aa84b6d4` (fix)
2. **Task 2: page.tsx server derivation + LoadDetailMobile (identity, tabs, Details, Edit/Save, audit)** - `fe480a7e` (feat)
3. **Task 3: Actions and children (Add to Trip, Cancel Load, Stops tab, Assignments tab)** - `c8498038` (feat)

## Files Created/Modified

- `apps/web/src/lib/carrier/rate-types.ts` - shared `RATE_TYPES` tuple + `RateType` type, single source of truth for the 8 carrier rate types
- `apps/web/src/app/api/v1/carrier/loads/[id]/route.ts` - PATCH `LoadUpdateSchema.rateType` now reads `z.enum(RATE_TYPES)` (was 6 values, gains `per_load`/`per_hour`)
- `apps/web/src/app/api/v1/carrier/loads/route.ts` - POST schema pointed at the shared const (no behavior change)
- `apps/web/src/app/api/v1/carrier/contracts/route.ts` - contract schema pointed at the shared const (no behavior change)
- `apps/web/src/app/(owner)/carrier/loads/[id]/LoadDetailMobile.tsx` - new ds Load Detail screen (~1,100 lines): identity, ParentStrip, Add to Trip/Cancel Load, Details/Stops/Assignments tabs, one `isEditing` flag, PATCH save, audit footer
- `apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx` - wraps existing desktop JSX in `hidden lg:block`, adds `lg:hidden` mobile branch, server-derives contracts/facilities/assignments for the mobile component
- `.planning/mobile-design-system.md` - §12 Loads (Detail) entry added; Loads (Overview)'s trailing "Pending" line updated to reflect the four-page set is complete

## Decisions Made

See `key-decisions` in frontmatter — all six documented above (RATE_TYPES sharing, tabs-stay-visible-through-edit, invoiced=success tone, trips-not-dispatches link, Add to Trip scope cut, Assignments read-only).

## Deviations from Plan

None — plan executed as written. The one structural judgment call (tabs remaining visible through edit mode, rather than TripDetailMobile's single-form-swap) was explicitly specified by the plan's Stops-tab instructions ("editing: render `<MobileStopsEditor>`" as tab content) and is documented as a decision, not a deviation.

## Issues Encountered

None. `npx tsc --noEmit` returned 0 errors both mid-plan and at completion (the plan's baseline note of ~35 pre-existing errors did not reproduce in this run — the working tree already had zero errors before this task started, per an unrelated in-flight change).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Loads four-page mobile-web set (Overview/Create/Detail/Edit) is complete.
- Follow-up parked in the design-system log: driver-pay assignment create/edit remains desktop-only from mobile (explicitly out of scope here).

---
*Phase: quick-469*
*Completed: 2026-07-15*

## Self-Check: PASSED

All created files and all three task commits verified present on disk / in git history.
