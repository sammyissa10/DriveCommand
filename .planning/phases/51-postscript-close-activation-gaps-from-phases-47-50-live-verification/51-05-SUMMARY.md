---
phase: 51-postscript-close-activation-gaps-from-phases-47-50-live-verification
plan: 05
subsystem: onboarding
tags: [prisma, transactions, bypass_rls, error-handling, welcome-page, activation]

# Dependency graph
requires:
  - phase: 51-04
    provides: hydrateTenant implementation + ActivationProgress model

provides:
  - Welcome page resilient catch block that checks Tenant.provisioningPhase before showing error UI
  - False-negative timeout handling: HYDRATED tenants see normal welcome page despite hydrateTenant throw

affects:
  - onboarding flow
  - welcome page UX
  - future error handling patterns in page-level try/catch blocks

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Nested try/catch in page-level catch block to query DB state before surfacing error UI"
    - "shouldShowError flag pattern: default true, flip to false if DB confirms success"
    - "Fetch fresh data in catch path before fallthrough to normal render"

key-files:
  created: []
  modified:
    - apps/web/src/app/onboarding/welcome/page.tsx

key-decisions:
  - "Check Tenant.provisioningPhase in catch block before showing error UI to handle client-side timeout false negatives"
  - "Use optional chaining on catchActivation (catchActivation?.completionPct ?? 20) to handle HYDRATED-but-no-ActivationProgress edge case gracefully"
  - "Inner try/catch around state check — if state check itself fails, fall back to error UI (safe default)"

patterns-established:
  - "Pattern: page catch blocks should verify DB state before surfacing error UI when idempotent operations may have completed server-side"

# Metrics
duration: 2min
completed: 2026-05-03
---

# Phase 51 Plan 05: Welcome Page Error UI Checks Tenant State Before Rendering Summary

**Catch block now queries Tenant.provisioningPhase before rendering error UI, so Prisma client-side timeouts on already-HYDRATED tenants no longer show false "Setup incomplete" screens**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-03T21:30:07Z
- **Completed:** 2026-05-03T21:31:45Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments

- Replaced the simple error-return catch block with a nested try/catch that queries Tenant.provisioningPhase using bypass_rls before deciding to show error UI
- When provisioningPhase='HYDRATED', logs a warning and fetches fresh ActivationProgress, then renders the normal welcome page (not the error UI)
- When provisioningPhase='MINIMAL' or the state check itself fails, the original "Setup incomplete" error UI renders unchanged
- Edge case handled: HYDRATED tenant with no ActivationProgress row falls back to completionPct=20 defaults via optional chaining

## Task Commits

Each task was committed atomically:

1. **Task 1: Read page.tsx and understand catch block structure** - (no commit — read-only)
2. **Task 2: Replace catch block with state-checking logic** - `0291dd9` (fix)
3. **Task 3: Verify and commit** - `0291dd9` (TypeScript clean, committed)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `apps/web/src/app/onboarding/welcome/page.tsx` - Catch block now has nested try/catch; queries Tenant + ActivationProgress before rendering; HYDRATED path renders normal welcome UI; MINIMAL path renders error UI

## Decisions Made

- Used `shouldShowError = true` default flag flipped to `false` only on confirmed HYDRATED state — safe default avoids accidentally hiding real failures
- Optional chaining on `catchActivation?.completionPct ?? 20` handles the unlikely case where HYDRATED but ActivationProgress row doesn't exist yet
- Inner try/catch wraps the state check: if Prisma fails again inside the catch block, the original error UI still shows (belt-and-suspenders)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. TypeScript errors found by `npx tsc --noEmit` were all in `.next/dev/types/` (auto-generated Next.js dev server files), not source files. Source compiled cleanly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Welcome page is now resilient to Prisma client-side timeouts when the DB transaction completed server-side
- All 5 plans of Phase 51 postscript complete

---
*Phase: 51-postscript-close-activation-gaps-from-phases-47-50-live-verification*
*Completed: 2026-05-03*
