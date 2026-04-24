---
phase: 42-workflow-engine-foundation
plan: "05"
subsystem: ui
tags: [trpc, tanstack-query, shadcn, next-js, workflow-engine, playbook, sidebar, dashboard]

# Dependency graph
requires:
  - phase: 42-workflow-engine-foundation-04
    provides: "workflowsRouter with workflows.playbook.list + workflows.playbook.create tRPC procedures, AppRouter type"
  - phase: 42-workflow-engine-foundation-03
    provides: "TRPCReactProvider in owner layout, useTRPC() hook from @/trpc/client"
provides:
  - "New 'Workflows' SidebarGroup in owner portal sidebar with ListChecks icon and 'Checklists & Workflows' link to /checklists"
  - "/checklists page: server component + DashboardClient with entity-type filter tabs and playbook card grid"
  - "PlaybookCard: color-coded category icon tile, entity type badge, step count, links to /checklists/playbooks/[id]/edit"
  - "CreatePlaybookCard: always-first dashed-border 'Create new' tile"
  - "CreatePlaybookDialog: controlled form (name/description/entityType/category/playbookPhase), calls playbook.create mutation, invalidates list, redirects to builder"
  - "EntityTypeFilterTabs: shadcn Tabs filtering the grid by DRIVER/VEHICLE/PARTNER/DISPATCH/OTHER/ALL"
affects:
  - 42-workflow-engine-foundation-06
  - 42-workflow-engine-foundation-07

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "tRPC v11 useQuery pattern: useQuery(trpc.xxx.queryOptions(...)) not trpc.xxx.useQuery(...)"
    - "tRPC v11 useMutation pattern: useMutation(trpc.xxx.mutationOptions({ onSuccess })) not trpc.xxx.useMutation(...)"
    - "queryClient.invalidateQueries({ queryKey: trpc.xxx.list.queryKey() }) after mutation"
    - "inferRouterOutputs<AppRouter>['workflows']['playbook']['list'][number] for PlaybookCard prop type"
    - "Controlled form state (no react-hook-form) for simple dialogs — validate() returns boolean"

key-files:
  created:
    - apps/web/src/app/(owner)/checklists/page.tsx
    - apps/web/src/app/(owner)/checklists/_components/DashboardClient.tsx
    - apps/web/src/app/(owner)/checklists/_components/PlaybookCard.tsx
    - apps/web/src/app/(owner)/checklists/_components/CreatePlaybookCard.tsx
    - apps/web/src/app/(owner)/checklists/_components/CreatePlaybookDialog.tsx
    - apps/web/src/app/(owner)/checklists/_components/EntityTypeFilterTabs.tsx
  modified:
    - apps/web/src/components/navigation/sidebar.tsx

key-decisions:
  - "Workflows SidebarGroup placed between Carrier Ops and Business — standalone per CONTEXT.md decision, not nested"
  - "Controlled form state used in CreatePlaybookDialog (not react-hook-form) — react-hook-form not installed in web app"
  - "PlaybookCard links to /checklists/playbooks/[id]/edit even though Plan 06 builds that page — link will 404 until then, by design"
  - "Naming lint: all JSX text uses user-facing names (Drivers/Vehicles/Onboarding etc.) — internal names (StepTemplate/PlaybookInstance) only appear in import/type lines"

patterns-established:
  - "Pattern: tRPC v11 useQuery via trpc.xxx.queryOptions({...}) in DashboardClient.tsx"
  - "Pattern: Category icon tile for Playbooks — 12x12 rounded-xl with color-coded bg per PlaybookCategory"
  - "Pattern: CreatePlaybookDialog resets form state and calls onOpenChange(false) on success before router.push"

# Metrics
duration: ~10min
completed: 2026-04-24
---

# Phase 42 Plan 05: Checklists Dashboard Summary

**Owner portal sidebar gains 'Workflows' group + /checklists page with entity-type-filtered playbook card grid and a create dialog that calls tRPC and redirects to the builder**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-24T03:05:00Z
- **Completed:** 2026-04-24T03:14:39Z
- **Tasks:** 2
- **Files modified:** 7 (6 created, 1 updated)

## Accomplishments
- Added `ListChecks` icon and a new standalone "Workflows" SidebarGroup to the owner sidebar — positioned after Carrier Ops, before Business — visible to OWNER and MANAGER roles only
- Built `/checklists` route under the `(owner)` pathless group with a server component page and a `DashboardClient` that queries `workflows.playbook.list` with entity-type filter
- `PlaybookCard` renders each playbook with a color-coded category icon tile (6 categories × distinct color), entity type badge, step count, and a link to the builder URL
- `CreatePlaybookDialog` collects name/description/entityType/category/playbookPhase via controlled state, validates client-side, calls `workflows.playbook.create` mutation, invalidates the list query, and redirects to `/checklists/playbooks/[id]/edit`
- All user-facing JSX text uses spec naming table: no "StepTemplate", "PlaybookInstance", "PlaybookTrigger", or "StepInstance" leaked into rendered text
- `tsc --noEmit` and `npm run build` both pass clean; `/checklists` appears in build route manifest

## Task Commits

Each task was committed atomically:

1. **Task 1: Add 'Workflows' sidebar group with 'Checklists & Workflows' link** - `0b9220a` (feat)
2. **Task 2: Build /checklists page with PlaybookCard grid and CreatePlaybookDialog** - `a9514f5` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `apps/web/src/components/navigation/sidebar.tsx` — Added `ListChecks` import + new Workflows SidebarGroup between Carrier Ops and Business sections
- `apps/web/src/app/(owner)/checklists/page.tsx` — Server component; `export const dynamic = 'force-dynamic'`, renders DashboardClient inside container
- `apps/web/src/app/(owner)/checklists/_components/DashboardClient.tsx` — Client component; tRPC `workflows.playbook.list` query with entity filter, grid layout, dialog trigger
- `apps/web/src/app/(owner)/checklists/_components/PlaybookCard.tsx` — Playbook tile; color-coded icon, entity badge, step count, links to builder
- `apps/web/src/app/(owner)/checklists/_components/CreatePlaybookCard.tsx` — Dashed-border "Create new" always-first tile
- `apps/web/src/app/(owner)/checklists/_components/CreatePlaybookDialog.tsx` — Modal form with controlled state; calls `workflows.playbook.create` mutation
- `apps/web/src/app/(owner)/checklists/_components/EntityTypeFilterTabs.tsx` — shadcn Tabs for ALL/DRIVER/VEHICLE/PARTNER/DISPATCH/OTHER

## Decisions Made
- Workflows SidebarGroup placed between Carrier Ops and Business — standalone per CONTEXT.md decision (not nested under either)
- Used controlled form state (not react-hook-form) for CreatePlaybookDialog since react-hook-form is not installed in the web app
- PlaybookCard link targets `/checklists/playbooks/[id]/edit` by design — Plan 06 builds that page; 404 is expected until then
- Naming lint passed: all JSX text uses user-facing names; internal model names only appear in import/type statements

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Self-Check

Files created/modified:
- `apps/web/src/components/navigation/sidebar.tsx` — FOUND (modified)
- `apps/web/src/app/(owner)/checklists/page.tsx` — FOUND
- `apps/web/src/app/(owner)/checklists/_components/DashboardClient.tsx` — FOUND
- `apps/web/src/app/(owner)/checklists/_components/PlaybookCard.tsx` — FOUND
- `apps/web/src/app/(owner)/checklists/_components/CreatePlaybookCard.tsx` — FOUND
- `apps/web/src/app/(owner)/checklists/_components/CreatePlaybookDialog.tsx` — FOUND
- `apps/web/src/app/(owner)/checklists/_components/EntityTypeFilterTabs.tsx` — FOUND

Commits:
- 0b9220a: feat(42-05): add Workflows sidebar group with Checklists & Workflows link — FOUND
- a9514f5: feat(42-05): build /checklists dashboard with playbook grid and create dialog — FOUND

TypeScript: PASSED (tsc --noEmit clean)
Build: PASSED (npm run build exit code 0, /checklists in route manifest)
Naming lint: PASSED (no PlaybookInstance/StepInstance/PlaybookTrigger/StepTemplate in JSX text)

## Self-Check: PASSED

## Next Phase Readiness
- Sidebar link to /checklists is live for OWNER/MANAGER roles
- /checklists page renders playbook grid with entity-type filtering
- CreatePlaybookDialog creates DB rows via tRPC and navigates to /checklists/playbooks/[id]/edit
- Plan 06 (Playbook Builder) can now build the edit page that CreatePlaybookDialog redirects to
- Plan 07 (naming lint test) can grep /checklists/_components/ — no internal names will leak

---
*Phase: 42-workflow-engine-foundation*
*Completed: 2026-04-24*
