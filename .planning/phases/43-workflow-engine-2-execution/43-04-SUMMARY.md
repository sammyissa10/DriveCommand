---
plan: 43-04
status: complete
phase: 43-workflow-engine-2-execution
completed: 2026-04-24
subsystem: workflow-engine
tags: [checklists, work-board, swimlanes, ui, tRPC, dispatch-readiness]
dependency-graph:
  requires: [43-03]
  provides: [active-work-board-ui, checklist-detail-page]
  affects: [checklists-dashboard, owner-portal]
tech-stack:
  added: [collapsible (shadcn), dropdown-menu (shadcn)]
  patterns: [tRPC useQuery/useMutation, CollapsibleSection, SVG progress ring]
key-files:
  created:
    - apps/web/src/app/(owner)/checklists/_components/WorkBoardSection.tsx
    - apps/web/src/app/(owner)/checklists/_components/StartChecklistDialog.tsx
    - apps/web/src/app/(owner)/checklists/instances/[id]/page.tsx
    - apps/web/src/app/(owner)/checklists/instances/[id]/_components/ChecklistDetailClient.tsx
  modified:
    - apps/web/src/app/(owner)/checklists/_components/DashboardClient.tsx
decisions:
  - "Used shadcn collapsible + dropdown-menu components (installed via CLI) for phase sections and step overflow menu"
  - "SVG ring for completion percent — avoids conic-gradient browser compat issues"
  - "Client-side instance classification (attention/progress/completed) avoids extra API surface"
metrics:
  duration: "~recovery session"
  completed: "2026-04-24"
  tasks: 2
  files: 6
---

# Phase 43 Plan 04: Active Work Board + Checklist Detail Summary

Active Work Board swimlanes (Needs Attention / In Progress / Completed Today) added to the /checklists dispatcher dashboard, and a full Active Checklist Detail screen built at /checklists/instances/[id] with phase-grouped step rows, dispatch readiness banner, skip-with-reason dialog, and view-result sheet.

## Tasks Completed

| Task | Status | Notes |
|------|--------|-------|
| Task 1: Active Work Board swimlanes on /checklists | Complete | WorkBoardSection.tsx (3 columns), StartChecklistDialog.tsx, DashboardClient.tsx updated |
| Task 2: Active Checklist Detail page | Complete | /checklists/instances/[id] with step rows, phase collapsibles, skip dialog, result sheet |

## Key Files

### Created
- `apps/web/src/app/(owner)/checklists/_components/WorkBoardSection.tsx` — 3-column swimlane board with client-side classification, circular progress rings, entity links, "View Checklist" buttons, empty state
- `apps/web/src/app/(owner)/checklists/_components/StartChecklistDialog.tsx` — playbook selector + entity type + entity ID picker, calls `instance.generate` tRPC mutation
- `apps/web/src/app/(owner)/checklists/instances/[id]/page.tsx` — Next.js 15 server component wrapper (async params)
- `apps/web/src/app/(owner)/checklists/instances/[id]/_components/ChecklistDetailClient.tsx` — full client component: header card (entity link, status badge, completion ring, dispatch readiness banner), phase-grouped collapsible sections, step rows with status icon/assignee/due date/result summary/action buttons, SkipDialog, ResultSheet

### Modified
- `apps/web/src/app/(owner)/checklists/_components/DashboardClient.tsx` — WorkBoardSection + "+ Start Checklist" button wired above Playbook grid

### Installed (deviation)
- `apps/web/src/components/ui/collapsible.tsx` — shadcn Collapsible (required by ChecklistDetailClient phase sections)
- `apps/web/src/components/ui/dropdown-menu.tsx` — shadcn DropdownMenu (required by ChecklistDetailClient step overflow menu)

## Verification

### Must-haves Satisfied

| Must-have | Status |
|-----------|--------|
| Active Work Board swimlanes (Needs Attention / In Progress / Completed Today) appear at top of /checklists | Satisfied — WorkBoardSection renders 3 columns |
| No swimlanes rendered when zero instances — empty state shown | Satisfied — `"When you start a checklist, it'll show up here."` rendered when all buckets empty |
| Start Checklist button opens modal with playbook selector + entity picker, calls instance.generate | Satisfied — StartChecklistDialog with shadcn Dialog |
| Active Checklist Detail at /checklists/instances/[id] shows entity name, playbook name, status badge, completion %, dispatch readiness | Satisfied — ChecklistDetailClient header card |
| Step rows show status icon, step name, assignee, due date (red if overdue), contextual action button | Satisfied — StepRow component |
| No internal names (PlaybookInstance, StepInstance) in JSX text — naming lint passes | Satisfied — `npm run test -- --run workflows-naming-lint` passes |

### TypeScript
`npx tsc --noEmit` — clean (zero new errors; pre-existing `.next/types/validator.ts` error from deleted [stopId]/messages route is unrelated to this plan)

### Naming Lint
`npm run test -- --run workflows-naming-lint` — 1 test passed

## Self-Check: PASSED

- [x] `apps/web/src/app/(owner)/checklists/_components/WorkBoardSection.tsx` — exists (committed 054712e)
- [x] `apps/web/src/app/(owner)/checklists/_components/StartChecklistDialog.tsx` — exists (committed 054712e)
- [x] `apps/web/src/app/(owner)/checklists/instances/[id]/page.tsx` — exists (committed f917111)
- [x] `apps/web/src/app/(owner)/checklists/instances/[id]/_components/ChecklistDetailClient.tsx` — exists (committed f917111)
- [x] `apps/web/src/app/(owner)/checklists/_components/DashboardClient.tsx` — modified (committed 054712e)
- [x] Naming lint passes
- [x] TypeScript compiles

## Deviations

### Stream Timeout Recovery
- **Found during:** Plan continuation
- **Issue:** Previous agent timed out after committing Task 1 (Work Board + StartChecklistDialog) but before committing Task 2 (Checklist Detail page). The detail page files were on disk but uncommitted.
- **Fix:** Continuation agent verified files, ran tsc, found and installed two missing shadcn components (`collapsible`, `dropdown-menu`) that ChecklistDetailClient.tsx imported, then committed.
- **Files added:** `collapsible.tsx`, `dropdown-menu.tsx` (shadcn install via CLI)
- **Commits:** `054712e` (Task 1, prior agent), `f917111` (Task 2 + shadcn components, this agent)

### Auto-installed Missing shadcn Components (Rule 3 — Blocking Issue)
- **Found during:** TypeScript check post-continuation
- **Issue:** ChecklistDetailClient.tsx imported `@/components/ui/collapsible` and `@/components/ui/dropdown-menu` which did not exist in the project
- **Fix:** `npx shadcn@latest add collapsible dropdown-menu --yes`
- **Files modified:** `apps/web/src/components/ui/collapsible.tsx` (created), `apps/web/src/components/ui/dropdown-menu.tsx` (created), `apps/web/package.json` (radix-ui deps added)
