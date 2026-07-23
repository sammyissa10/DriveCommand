---
phase: quick-503
plan: 503
subsystem: ui
tags: [react, trpc, workflow-engine, dispatch-gate, tailwind, nativewind-ds-tokens]

# Dependency graph
requires:
  - phase: quick-497
    provides: "getDriverReadiness resolver returning { isReady: true, warning: 'NO_ONBOARDING_INSTANCE' } for drivers with no PlaybookInstance"
provides:
  - "Pure driverReadinessLabel helper mapping getDriverReadiness output to a 3-state UI tone (ready/not_started/incomplete)"
  - "canDispatchClientSide predicate that aligns the client preflight with the server dispatch gate"
  - "3-state readiness chip + accurate block modal on desktop Create Dispatch (NewDispatchForm.tsx)"
  - "3-state readiness chip + accurate block sheet on mobile New Trip (NewTripMobile.tsx)"
affects: [dispatch-creation, driver-onboarding, workflow-engine]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure framework-free helper co-located with a Vitest test in src/lib/dispatch/ for UI label derivation, decoupled from trpc types via a minimal input interface"
    - "Client preflight predicate mirrors a server gate explicitly (canDispatchClientSide) rather than re-deriving isReady inline in each surface"

key-files:
  created:
    - apps/web/src/lib/dispatch/driver-readiness-label.ts
    - apps/web/src/lib/dispatch/driver-readiness-label.test.ts
  modified:
    - apps/web/src/components/carrier/dispatches/NewDispatchForm.tsx
    - apps/web/src/app/(owner)/carrier/trips/new/NewTripMobile.tsx

key-decisions:
  - "Checked warning === 'NO_ONBOARDING_INSTANCE' before isReady in the label mapping, since quick-497 deliberately returns isReady:true alongside that warning"
  - "Reused existing amber-50/amber-200 pattern (quick-499) on desktop and ds-warning tokens on mobile instead of inventing new visual design"
  - "Removed the now-unused isDispatchReady boolean in both files in favor of the richer label object, since nothing else referenced it"

# Metrics
duration: 14min
completed: 2026-07-23
---

# Quick Task 503: Surface Driver Onboarding Not-Started State Summary

**3-state readiness indicator (ready/not-started/incomplete) via a shared pure helper, wired into both desktop and mobile create-dispatch preflight so the client agrees with the server gate before the network round-trip.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-07-23T18:17:00-05:00
- **Completed:** 2026-07-23T18:30:18-05:00
- **Tasks:** 3
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- Extracted a pure, framework-free `driverReadinessLabel` helper (+ `canDispatchClientSide` predicate) with 6 passing Vitest cases covering all three tones, the null-href edge case, and both predicate branches
- Desktop `NewDispatchForm.tsx`: chip is now green only when ready with no warning; amber "Onboarding not started" with a "Start onboarding" link to `/checklists` for `NO_ONBOARDING_INSTANCE`; amber "Onboarding incomplete" listing blocker steps with a "View checklist" instance link otherwise. Preflight now uses `canDispatchClientSide` so it opens the block modal client-side for a not-started driver instead of showing green and then failing on the server 409. Block modal title/body switch on tone; Cancel and the OWNER/MANAGER Override path are untouched.
- Mobile `NewTripMobile.tsx`: same 3-state chip using `ds-warning`/`ds-danger` tokens (no amber-50, per mobile styling convention), same preflight fix, same tone-driven block sheet copy with a "Start onboarding" action, Cancel + Override preserved.
- Verified `next build` passes cleanly and `tsc --noEmit` shows 0 errors project-wide (better than the documented ~35-error baseline — no regressions either way).

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract pure driverReadinessLabel helper + Vitest** - `1f4648e4` (feat)
2. **Task 2: Desktop NewDispatchForm 3-state chip + consistent preflight + actionable modal** - `c70d2325` (fix)
3. **Task 3: Mobile NewTripMobile parity + full build/test verification** - `22b68b94` (fix)

_No plan-metadata commit yet — created after this summary per orchestrator's final-commit step._

## Files Created/Modified
- `apps/web/src/lib/dispatch/driver-readiness-label.ts` - Pure helper: `driverReadinessLabel()` maps `{isReady, blockerStepNames, openInstanceId, userId, warning?}` to `{tone, title, detail?, href?}`; `canDispatchClientSide()` predicate for preflight checks
- `apps/web/src/lib/dispatch/driver-readiness-label.test.ts` - Vitest: ready / not_started / incomplete(+href) / incomplete(null href) / predicate true+false — 6 tests, all passing
- `apps/web/src/components/carrier/dispatches/NewDispatchForm.tsx` - 3-state chip (green/amber "not started"/amber "incomplete"), preflight uses `canDispatchClientSide`, block modal title/body driven by tone with a "Start onboarding" action for the not-started case
- `apps/web/src/app/(owner)/carrier/trips/new/NewTripMobile.tsx` - Same 3-state chip using ds tokens, same preflight fix, block sheet title/body driven by tone with a "Start onboarding" action

## Decisions Made
- Order of checks in `driverReadinessLabel` is warning-first, then `!isReady`, then ready — matches the verified quick-497 resolver shape where `NO_ONBOARDING_INSTANCE` co-occurs with `isReady: true`
- Dropped the standalone `isDispatchReady` boolean in both files since the richer `label` object supersedes it and nothing else referenced it after the preflight/chip rewrite — kept the diff minimal otherwise
- `NewTripFormClient.tsx` (same folder as `NewTripMobile.tsx`) was grep-confirmed to have no `getDriverReadiness` usage — correctly out of scope, no action taken there

## Deviations from Plan

None - plan executed exactly as written. The one plan-anticipated ambiguity (whether `isDispatchReady` should be kept if referenced elsewhere) resolved cleanly: it had zero remaining references in either file, so it was removed rather than kept dead.

## Issues Encountered
None. Both `tsc --noEmit` and `next build` were clean on first run; no regressions to reconcile against the documented pre-existing baseline.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The chip and preflight in both create-dispatch surfaces now agree with the server dispatch gate (`trips.ts`) for the `NO_ONBOARDING_INSTANCE` case; no further follow-up required for this specific confusion.
- `getDriverReadiness` resolver, `computeDispatchReadiness.ts`, `trips.ts` gate/override logic, and `schema.prisma` were not touched, per hard scope guard - the server remains the source of truth and continues to reject with `DRIVER_NOT_DISPATCH_READY` if the client preflight is ever bypassed.
- Reminder for future work: `User.isDispatchReady` is still the stale column the server gate reads (per quick-497 diagnosis) - this task only fixed the client-side signal, not the underlying column staleness, which is intentionally out of scope here.

---
*Phase: quick-503*
*Completed: 2026-07-23*

## Self-Check: PASSED

All created/modified files confirmed present on disk; all 3 task commits (`1f4648e4`, `c70d2325`, `22b68b94`) confirmed present in git log.
