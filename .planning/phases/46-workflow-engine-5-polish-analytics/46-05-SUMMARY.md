---
phase: 46-workflow-engine-5-polish-analytics
plan: "05"
subsystem: api, ui
tags: [trpc, recharts, analytics, workflows, checklists, tenant-isolation]

# Dependency graph
requires:
  - phase: 46-workflow-engine-5-polish-analytics
    provides: PlaybookInstance, StepInstance, Playbook, StepTemplate models; workflowsRouter; tenantMemberProcedure
provides:
  - analyticsRouter with getPlaybookStats, getAvgCompletionTime, getStepDropOff tRPC procedures
  - /checklists/analytics page with AnalyticsDashboard component
  - Analytics nav link on /checklists page header
affects: [checklists, workflows, analytics]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Prefetch instance IDs before groupBy to enforce tenant isolation on StepInstance queries"
    - "useTRPC + useQuery pattern for tRPC queries in client components"
    - "Time range selector (7d/30d/90d) drives all analytics queries via days input"

key-files:
  created:
    - apps/web/src/server/api/routers/workflows/analytics.ts
    - apps/web/src/app/(owner)/checklists/analytics/page.tsx
    - apps/web/src/app/(owner)/checklists/analytics/_components/AnalyticsDashboard.tsx
  modified:
    - apps/web/src/server/api/routers/workflows/index.ts
    - apps/web/src/app/(owner)/checklists/page.tsx

key-decisions:
  - "Instance ID prefetch pattern: fetch playbookInstance IDs filtered by tenantId first, then use IN clause for StepInstance groupBy — avoids cross-tenant data leakage since StepInstance has no tenantId column"
  - "Used Recharts (already installed) rather than adding a new chart library"
  - "Drop-off chart defaults to first playbook in the stats list (no empty state after stats load)"

patterns-established:
  - "analytics.ts: each procedure wraps Prisma calls in $transaction with set_config RLS bypass"

# Metrics
duration: 4min
completed: 2026-04-25
---

# Phase 46 Plan 05: Workflow Analytics Summary

**Analytics tRPC router (completion rate, avg time, step drop-off) + /checklists/analytics Recharts dashboard with time range selector and Analytics nav link on /checklists**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-25T03:50:48Z
- **Completed:** 2026-04-25T03:54:38Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created `analyticsRouter` with three tenant-scoped tRPC procedures mounted on `workflowsRouter` as `analytics`
- Built `/checklists/analytics` page with `AnalyticsDashboard` showing completion rate BarChart, avg completion time cards, and step drop-off stacked horizontal BarChart
- Added "Analytics" navigation link to the `/checklists` page header
- All queries scoped to `ctx.tenantId`; step drop-off uses instance ID prefetch to safely filter `StepInstance.playbookInstanceId IN (...)` without cross-tenant leakage

## Task Commits

Each task was committed atomically:

1. **Task 1: Analytics tRPC router + mount on workflows router** - `2fa03e9` (feat)
2. **Task 2: /checklists/analytics page + AnalyticsDashboard + Analytics nav link** - `6756168` (feat)

**Plan metadata:** (created next)

## Files Created/Modified
- `apps/web/src/server/api/routers/workflows/analytics.ts` - analyticsRouter with getPlaybookStats, getAvgCompletionTime, getStepDropOff procedures
- `apps/web/src/server/api/routers/workflows/index.ts` - Added analyticsRouter import and `analytics` key
- `apps/web/src/app/(owner)/checklists/analytics/page.tsx` - Route page with metadata and AnalyticsDashboard
- `apps/web/src/app/(owner)/checklists/analytics/_components/AnalyticsDashboard.tsx` - Client component with three charts + time range selector
- `apps/web/src/app/(owner)/checklists/page.tsx` - Added Analytics link in header

## Decisions Made
- Instance ID prefetch pattern for step drop-off: `StepInstance` has no `tenantId` column, so groupBy directly would not be tenant-scoped. Solution: fetch `playbookInstance.id` list filtered by `tenantId` first, then use `playbookInstanceId: { in: instanceIds }` for the groupBy.
- Used existing `recharts` (already in `package.json`) — no new dependencies added.
- Drop-off chart auto-selects the first playbook from `stats` results once loaded, avoiding an empty state when only one playbook exists.

## Deviations from Plan

None - plan executed exactly as written. The tRPC pattern adapted from `useTRPC + useQuery` (matching existing checklist components) rather than the plan's `api.workflows.analytics...useQuery()` syntax, which is the correct pattern for this codebase.

## Issues Encountered
- Pre-existing TypeScript error in `apps/web/.next/types/validator.ts` references a deleted route file (`[stopId]/messages/route.ts`). Confirmed this error predates this plan and is unrelated to analytics work.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 46 Plan 05 is the final plan in Phase 46
- Analytics dashboard is accessible at `/checklists/analytics` — no data until playbook instances exist in production
- All three procedures use the established `TX_OPTIONS + set_config('app.bypass_rls', 'on', TRUE)` RLS bypass pattern

---
*Phase: 46-workflow-engine-5-polish-analytics*
*Completed: 2026-04-25*

## Self-Check: PASSED

- FOUND: `apps/web/src/server/api/routers/workflows/analytics.ts`
- FOUND: `apps/web/src/app/(owner)/checklists/analytics/page.tsx`
- FOUND: `apps/web/src/app/(owner)/checklists/analytics/_components/AnalyticsDashboard.tsx`
- FOUND commit: `2fa03e9` (Task 1 — analytics tRPC router)
- FOUND commit: `6756168` (Task 2 — analytics page + component)
