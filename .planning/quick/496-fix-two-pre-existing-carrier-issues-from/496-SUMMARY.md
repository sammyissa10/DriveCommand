---
phase: quick-496
plan: 01
subsystem: ui, api
tags: [react, setState-during-render, next.js, prisma, grid-preferences, onboarding-tour]

requires:
  - phase: quick-495
    provides: "Browser verification pass that surfaced these two pre-existing bugs"
provides:
  - "OnboardingTour.next() no longer fires markTourSeen()/setActive() side effects inside the setIndex render-phase updater"
  - "GET /api/user/grid-preferences/[gridId] returns 200 { preferences: null } for authenticated users with no saved prefs (was 404)"
  - "useGridPreferences correctly marks authenticated users as authenticated on the no-prefs case, so customizations persist to the DB instead of silently falling back to localStorage"
affects: [carrier-onboarding, data-grid, grid-preferences]

tech-stack:
  added: []
  patterns:
    - "Event-handler branch decisions must live in the handler body, not inside a React state-updater function, when the branch has side effects (server actions, other setState calls)"
    - "Discriminated union return type ({ authed: true; prefs: X | null } | { authed: false }) to let a fetch helper communicate both auth status and payload presence without conflating them"

key-files:
  created: []
  modified:
    - apps/web/src/components/onboarding/tour/OnboardingTour.tsx
    - apps/web/src/app/api/user/grid-preferences/[gridId]/route.ts
    - apps/web/src/components/data-grid/core/useGridPreferences.ts

key-decisions:
  - "Used a discriminated union ({authed, prefs}) instead of a sentinel value to distinguish authed-no-prefs from unauthenticated, avoiding ambiguity with null"
  - "Kept 401 semantics for unauthenticated unchanged; only the no-prefs case moved from 404 to 200 to align with REST semantics for 'valid resource path, no data yet'"

patterns-established:
  - "Never branch on side-effecting logic inside a React state updater function - decide in the handler body using state from closure, only use the updater for the actual state transition"

duration: 12min
completed: 2026-07-23
---

# Quick Task 496: Fix Two Pre-Existing Carrier Issues Summary

**Moved onboarding-tour finish() out of the setIndex render-phase updater, and changed grid-preferences GET to return 200 (not 404) for authenticated users with no saved prefs so DB persistence actually engages.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-23T16:00:00Z (approx)
- **Completed:** 2026-07-23T16:10:34Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- `OnboardingTourProvider.next()` now decides finish-vs-advance in the handler body (using `index` from closure) instead of inside the `setIndex` updater, eliminating the "Cannot update a component (`Router`) while rendering a different component (`OnboardingTourProvider`)" console error.
- `GET /api/user/grid-preferences/[gridId]` now returns `200 { preferences: null }` instead of `404` when an authenticated user has no saved grid prefs yet; `401` for unauthenticated is unchanged.
- `useGridPreferences.fetchPreferencesFromApi` now returns a discriminated `{ authed: true; prefs: GridPreferences | null } | { authed: false }` result, and `load()` sets `isAuthenticatedRef.current = true` on any 200 response (even with null prefs), so subsequent customizations save via `PUT` (DB upsert) instead of silently falling back to `localStorage`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix onboarding-tour setState-during-render warning** - `b3428c27` (fix)
2. **Task 2: Grid-preferences — 200 for authed-no-prefs + DB persistence** - `db3c66e9` (fix)

_Note: no plan metadata commit created per orchestrator instructions (single final push handled separately)._

## Files Created/Modified
- `apps/web/src/components/onboarding/tour/OnboardingTour.tsx` - `next()` branch decision moved out of `setIndex` updater into handler body; `index` added to deps array.
- `apps/web/src/app/api/user/grid-preferences/[gridId]/route.ts` - GET no-preference branch changed from 404 to 200 `{ preferences: null }`; JSDoc updated.
- `apps/web/src/components/data-grid/core/useGridPreferences.ts` - `fetchPreferencesFromApi` returns discriminated `{authed, prefs}` union; `load()` consumes it and sets `isAuthenticatedRef.current` correctly for the authed-no-prefs case.

## Decisions Made
- Detect "no saved prefs" in the hook by checking `data.preferences === null` on the parsed JSON body (matches the exact shape the route now returns), rather than inferring absence from missing pref fields — more explicit and less fragile.
- No architectural changes required; both fixes were surgical (Rule 1/3 category — bug fix / blocking-issue correction), consistent with the plan's pre-diagnosed root causes.

## Deviations from Plan

None - plan executed exactly as written. Both tasks matched the plan's exact before/after code blocks.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `tsc --noEmit` reports 0 errors (clean baseline maintained, no regressions).
- Browser verification still recommended (per plan's verify notes) to confirm: (1) advancing/finishing the tour on a mobile viewport no longer logs the setState-during-render warning; (2) first load of a grid with no saved prefs shows a 200 instead of a red 404 in the Network tab; (3) an authenticated user's grid customization persists across a reload via the DB; (4) anonymous users still fall back to localStorage. This was pre-diagnosed and surgical, so no blockers expected, but was not re-verified in-browser by this executor.
- No blockers for subsequent quick tasks or phase work.

---
*Phase: quick-496*
*Completed: 2026-07-23*

## Self-Check: PASSED

All 4 claimed files found on disk; both commit hashes (b3428c27, db3c66e9) found in git log.
