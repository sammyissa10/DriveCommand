---
phase: 46-workflow-engine-5-polish-analytics
plan: "04"
subsystem: ui
tags: [react, trpc, dnd-kit, preview-panel, step-editor, workflow-engine]

# Dependency graph
requires:
  - phase: 46-01
    provides: dueWithinHours + overdueRecipient fields on PlaybookStep schema + updatePlaybookStepSchema

provides:
  - PreviewPanel component with phone-frame Driver View tab and Dispatcher summary tab
  - Preview button in BuilderClient header toggling fixed-position panel
  - DnD-safe panel mounting via position:fixed (no layout shift)
  - StepDetailEditor dueWithinHours number input and overdueRecipient select
  - updateStep tRPC persists dueWithinHours + overdueRecipient to DB

affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "position:fixed preview panel pattern — avoids DnD DragOverlay offset bugs by staying out of flex layout"
    - "CSS-only phone frame — 375px wide div with zinc-900 bg, rounded-[40px], absolute notch div — no external library"
    - "useEffect reset on step.id change — resets all local state fields when user selects a different step"

key-files:
  created:
    - apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/_components/PreviewPanel.tsx
  modified:
    - apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/_components/BuilderClient.tsx
    - apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/_components/StepDetailEditor.tsx
    - apps/web/src/server/api/routers/workflows/playbook.ts

key-decisions:
  - "position:fixed for PreviewPanel — keeps it out of the DnD flex container so DragOverlay positioning is unaffected"
  - "CSS phone frame — no external library dependency, avoids bundle bloat, sufficient for preview purpose"
  - "PreviewPanel mounted at bottom of root div, after DndContext — sibling to DndContext, not inside it"

# Metrics
duration: 336s
completed: 2026-04-25
---

# Phase 46 Plan 04: Preview Panel + StepDetailEditor Overdue Fields Summary

**Fixed-position Builder Preview Panel with CSS phone frame (Driver View) and Dispatcher summary tab; StepDetailEditor extended with dueWithinHours input and overdueRecipient select wired to tRPC**

## Performance

- **Duration:** ~336s (5m 36s)
- **Started:** 2026-04-25T04:00:03Z
- **Completed:** 2026-04-25T04:05:39Z
- **Tasks:** 2
- **Files modified:** 3 (+ 1 created)

## Accomplishments

- Created `PreviewPanel.tsx` with two tabs: Driver View (CSS-only phone frame, 375px, rounded corners, simulated notch, step cards with type badge and due-hour badge) and Dispatcher summary (playbook name/category/step count/estimated time/step list with assignee role badges)
- Added Preview button (Eye icon) to BuilderClient header; `previewOpen` state toggles the panel
- Extended `PlaybookStepItem` interface with `isRequired`, `isDispatchBlocker`, `dueWithinHours`, and `overdueRecipient`; updated `normaliseSteps()` to map these from server data
- PreviewPanel mounted at the end of the root `<div>` (after `DndContext`) with `position:fixed` — DnD flex layout unaffected, DragOverlay offsets remain correct
- Added `useEffect` to `StepDetailEditor` that resets all local state when `step.id` changes (correct pattern for a shared editor component)
- Added "Due within (hours)" number input (1–8760, optional) and "Overdue alert recipient" select (Driver only / Owner/Dispatcher only / Both) to StepDetailEditor body
- Extended `updateStep` tRPC mutation in `playbook.ts` to conditionally persist `dueWithinHours` and `overdueRecipient` to the `PlaybookStep` DB row

## Task Commits

Each task was committed atomically:

1. **Task 1: PreviewPanel + BuilderClient Preview button** - `a14a6a6` (feat)
2. **Task 2: StepDetailEditor overdue fields + updateStep tRPC** - `125f591` (feat)

## Files Created/Modified

- `apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/_components/PreviewPanel.tsx` — new file; position:fixed panel with Driver View (phone frame, step cards) + Dispatcher summary tab
- `apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/_components/BuilderClient.tsx` — Eye import, Button import, PreviewPanel import; extended PlaybookStepItem + normaliseSteps; previewOpen state; Preview button in header; PreviewPanel conditional mount
- `apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/_components/StepDetailEditor.tsx` — useEffect + Input + Select imports; dueWithinHours/overdueRecipient state + reset effect; fields added to editor body; both fields passed to updateStep mutate
- `apps/web/src/server/api/routers/workflows/playbook.ts` — updateStep mutation extended with conditional dueWithinHours + overdueRecipient Prisma update

## Decisions Made

- `position:fixed` for the preview panel — keeps the panel out of the DnD flex container so DragOverlay offset calculations remain correct; panel renders over the layout without causing any reflow
- CSS-only phone frame — sufficient fidelity for owner preview purpose, no external library needed
- PreviewPanel placed as a sibling to DndContext inside the root `<div>`, not inside the DndContext

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Stale validation dist missing plan-01 schema additions**
- **Found during:** Task 2 TypeScript check
- **Issue:** `@drivecommand/validation` dist was stale (built before plan 01 added `dueWithinHours` + `overdueRecipient` to `updatePlaybookStepSchema`). TypeScript inferred the old type shape (4 fields) and reported errors on the new fields in both `StepDetailEditor.tsx` and `playbook.ts`.
- **Fix:** Ran `npx turbo run build --filter=@drivecommand/validation` to rebuild the dist. Dist is gitignored and regenerated at build time; only source was committed in plan 01. No source changes needed.
- **Files modified:** `packages/validation/dist/` (local only, gitignored)
- **Commit:** Documented in `125f591` commit message

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking)
**Impact on plan:** Unblocked Task 2 TypeScript cleanly. No scope creep.

## Issues Encountered

- Pre-existing TypeScript error in `apps/web/.next/types/validator.ts` (deleted `[stopId]/messages/route.ts`) — unrelated to this plan, present since Phase 45.

## User Setup Required

None.

## Next Phase Readiness

- Preview Panel visible in builder — owners can see driver UX before publishing
- StepDetailEditor overdue fields fully wired — per-step SLA configuration is complete UI end-to-end
- All plan 46 UI builder work is now complete (plans 03 + 04 delivered the full builder surface)

## Self-Check: PASSED
