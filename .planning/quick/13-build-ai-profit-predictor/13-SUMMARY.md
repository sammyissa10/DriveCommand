---
phase: quick-13
plan: 01
subsystem: ui
tags: [profit-predictor, lane-analytics, decimal-js, server-action, next-js, typescript]

# Dependency graph
requires:
  - phase: quick-10
    provides: getLaneAnalytics action with lane-level cost-per-mile data
  - phase: v3.0/phase-16-05
    provides: getFleetAverageCostPerMile fleet fallback action
provides:
  - predictLoadProfitability server action with lane/fleet cost resolution
  - ProfitPredictorForm client component with accept/caution/reject recommendation
  - /profit-predictor page route with OWNER/MANAGER guard
  - Profit Predictor sidebar link under Intelligence section
affects: [future-dispatch-integration, load-acceptance-workflow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lane-first with fleet fallback: try lane-specific cost-per-mile first (1-year window), fall back to fleet average"
    - "Decimal.js for all money calculations, parseFloat only for Intl.NumberFormat display"
    - "State variables used in result display (not echoed from server) to avoid adding fields to PredictionResult"

key-files:
  created:
    - src/app/(owner)/actions/profit-predictor.ts
    - src/components/profit-predictor/profit-predictor-form.tsx
    - src/app/(owner)/profit-predictor/page.tsx
  modified:
    - src/components/navigation/sidebar.tsx

key-decisions:
  - "Use 365-day window for getLaneAnalytics (vs 90-day fleet average) to maximize lane coverage for prediction"
  - "accept>=15%, caution 0-14.9%, reject<0% — thresholds match industry dispatcher decision-making standards"
  - "dataSource=none returns caution (not reject) — no data means uncertain, not bad"
  - "State variables (origin/destination) used in lane data source label instead of echoing from server to keep PredictionResult interface minimal"
  - "Calculator icon from lucide-react added to Intelligence sidebar section"

patterns-established:
  - "Profit prediction: lane lookup -> fleet fallback -> none chain with explicit dataSource field"
  - "Recommendation banner: full-width colored border+bg with icon for accept/caution/reject"

# Metrics
duration: 6min
completed: 2026-02-18
---

# Quick Task 13: Build AI Profit Predictor Summary

**Server-side profit prediction using lane-specific or fleet-average cost-per-mile, with accept/caution/reject recommendation banner at 15%/0% margin thresholds**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-02-18T21:55:01Z
- **Completed:** 2026-02-18T22:00:58Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- `predictLoadProfitability` server action resolves cost-per-mile from lane history (365-day window) or fleet average fallback — all math via Decimal.js
- `ProfitPredictorForm` client component with 4 inputs, recommendation banner, stats grid, and data source notice
- `/profit-predictor` page with OWNER/MANAGER auth guard and clean heading/description
- Sidebar "Profit Predictor" link with Calculator icon in Intelligence section

## Task Commits

Each task was committed atomically:

1. **Task 1: Create profit prediction server action** - `9867788` (feat)
2. **Task 2: Build prediction form component and page + sidebar link** - `eee9707` (feat)

**Plan metadata:** *(docs commit follows)*

## Files Created/Modified
- `src/app/(owner)/actions/profit-predictor.ts` - Server action: PredictionInput/PredictionResult interfaces, predictLoadProfitability with lane->fleet->none cost resolution
- `src/components/profit-predictor/profit-predictor-form.tsx` - Client form with real-time result display, recommendation banner, 4-col stats grid
- `src/app/(owner)/profit-predictor/page.tsx` - Server page wrapper with requireRole guard
- `src/components/navigation/sidebar.tsx` - Added Calculator import and Profit Predictor menu item after Lane Profitability

## Decisions Made
- Used 365-day window for `getLaneAnalytics` (instead of the 90-day default) to maximize lane coverage for prediction accuracy
- Thresholds: accept >= 15%, caution 0-14.9%, reject < 0% — these reflect typical freight dispatcher decision criteria
- `dataSource = 'none'` returns `caution` (not `reject`) — no historical data is uncertain, not inherently bad
- State variables `origin`/`destination` used in lane data source notice instead of echoing from server — keeps `PredictionResult` interface minimal
- `Calculator` icon chosen for Profit Predictor to visually distinguish from `TrendingUp` (Lane Profitability)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript error: PredictionResult missing origin/destination fields**
- **Found during:** Task 2 (TypeScript compilation check)
- **Issue:** Form template used `result.origin` and `result.destination` which don't exist on `PredictionResult`
- **Fix:** Used `origin` and `destination` state variables directly in the lane data source label (already in scope within the component)
- **Files modified:** `src/components/profit-predictor/profit-predictor-form.tsx`
- **Verification:** `npx tsc --noEmit` passes with no errors
- **Committed in:** `eee9707` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Minor fix to JSX — state variables serve the same purpose as echoed fields without modifying the server action interface.

## Issues Encountered
None beyond the TypeScript fix above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Profit Predictor live at `/profit-predictor` for OWNER/MANAGER roles
- Requires historical route data for meaningful predictions (lane match uses 1-year window, fleet average uses 90-day rolling window)
- Can be extended: add load count breakeven analysis, multi-lane comparison, or direct "accept load" action from prediction result

---
*Phase: quick-13*
*Completed: 2026-02-18*
