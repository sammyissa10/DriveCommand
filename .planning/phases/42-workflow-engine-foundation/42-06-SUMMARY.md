---
phase: 42-workflow-engine-foundation
plan: "06"
subsystem: ui
tags: [dnd-kit, trpc, tanstack-query, shadcn, workflow-engine, playbook-builder, drag-and-drop]

# Dependency graph
requires:
  - phase: 42-workflow-engine-foundation-04
    provides: "9 playbookRouter procedures including addStep, removeStep, updateStep, reorderSteps"
  - phase: 42-workflow-engine-foundation-05
    provides: "/checklists dashboard and PlaybookCard linking to /checklists/playbooks/[id]/edit"

provides:
  - "/checklists/playbooks/[id]/edit page: 3-column Playbook Builder (library + canvas + detail editor)"
  - "BuilderClient: DndContext shell with normaliseSteps() helper, optimistic cross-phase move state, addStep and reorderSteps mutation wiring"
  - "BuilderCanvas: 5 PhaseSection columns (PRE_START/DAY_1/WEEK_1/ONGOING/NONE) with SortableContext per phase"
  - "PhaseSection: SortableContext + useDroppable empty zone with 'Drop steps here' placeholder"
  - "BuilderStepRow: useSortable row with drag handle, stepType/role badges, select and remove actions"
  - "StepLibraryPanel: filterable (9 chips) list of StepTemplates, DraggableTemplateCard with useDraggable"
  - "NewStepTemplateButton: Dialog form for stepTemplate.create (name/description/stepType/assigneeRole)"
  - "StepDetailEditor: slide-in 360px right panel, renders config editor by stepType, Save wired to updateStep"
  - "FormFillEditor: field list with add/remove/reorder (up/down), per-field name+type+required"
  - "InspectionItemEditor: instruction textarea (500 chars) + requirePhotoOnFail Switch"
  - "SimpleEditors: DocumentUploadEditor, SignatureEditor, TrainingAckEditor, ApprovalEditor, ThirdPartyEditor, CustomNoteEditor"

affects:
  - 42-workflow-engine-foundation-07

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "normaliseSteps() helper: maps raw Prisma/tRPC output to a flat typed PlaybookStepItem[] to avoid TS2589 deep instantiation error during Next.js build"
    - "PlaybookStepItem exported from BuilderClient and re-imported by siblings (BuilderCanvas/BuilderStepRow/StepDetailEditor) to share type without duplication"
    - "DnD library item drag: useDraggable from @dnd-kit/core with data.type='library' and stepTemplateId; handled in BuilderClient onDragEnd CASE 1"
    - "DnD step drag: useSortable from @dnd-kit/sortable with data.type='step' and phase; cross-phase move optimistically updated in onDragOver, persisted in onDragEnd CASE 2"
    - "updateStep mutation: mutationOptions() without onError in options; error handled via mutate() second argument callback to avoid TS2589"
    - "Empty phase zone: PhaseSection uses useDroppable only when stepIds is empty, to create a dashed drop target for the DnD system"

key-files:
  created:
    - apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/page.tsx
    - apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/_components/BuilderClient.tsx
    - apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/_components/BuilderCanvas.tsx
    - apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/_components/PhaseSection.tsx
    - apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/_components/BuilderStepRow.tsx
    - apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/_components/StepLibraryPanel.tsx
    - apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/_components/NewStepTemplateButton.tsx
    - apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/_components/StepDetailEditor.tsx
    - apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/_components/stepConfigEditors/FormFillEditor.tsx
    - apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/_components/stepConfigEditors/InspectionItemEditor.tsx
    - apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/_components/stepConfigEditors/SimpleEditors.tsx
  modified: []

key-decisions:
  - "normaliseSteps() helper instead of direct as-cast: Next.js build TypeScript is stricter than tsc --noEmit; playbook.steps as PlaybookStepItem[] caused TS2589 instantiation-too-deep error in the build worker; normalising via an any-typed function breaks the inference chain cleanly"
  - "PlaybookStepItem exported from BuilderClient: single source of truth for the step shape used across 3 sibling components (canvas/row/detail editor)"
  - "updateStep onError via mutate() second arg: passing onError inside mutationOptions() for updateStep (which returns a complex Prisma include shape) triggered TS2589 under strict build mode; splitting onError to the mutate() callback avoids the deep generic chain"
  - "No shadcn Checkbox for FormFillEditor: apps/web has no @/components/ui/checkbox component; used native <input type=checkbox> instead to keep zero-dependency approach"
  - "StepLibraryPanel renders all templates via (templates as StepTemplateItem[]).map(): avoids the TS2589 that arises from inlining as StepTemplateItem inside the .map() callback"

# Metrics
duration: ~15min
completed: 2026-04-24
---

# Phase 42 Plan 06: Playbook Builder UI Summary

**3-column Playbook Builder with @dnd-kit drag-and-drop canvas (5 phase sections), filterable Step Library, and 8-type step config editor — makes the phase-goal UAT demo achievable**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-24T03:18:47Z
- **Completed:** 2026-04-24T03:36:09Z
- **Tasks:** 2
- **Files modified:** 11 created

## Accomplishments

- Built `/checklists/playbooks/[id]/edit` — a 3-column Playbook Builder that is the core UX deliverable of Phase 42
- `BuilderClient`: wraps everything in `DndContext`, manages `localSteps` optimistic state for cross-phase moves, handles two drag cases (library-to-canvas calls `addStep`, step-to-step calls `reorderSteps`)
- `BuilderCanvas` + `PhaseSection`: 5 phase containers each with `SortableContext` + empty-zone `useDroppable`; user-facing phase labels ("Before Start", "Day 1", "First Week", "Ongoing", "Unassigned")
- `BuilderStepRow`: `useSortable` row with a subtle drag handle (GripVertical, visible on hover), stepType badge, role label, Edit and Remove (X) buttons
- `StepLibraryPanel`: 9-chip filter row (ALL + 8 step types), `DraggableTemplateCard` per template, `+ New Step Template` button in footer
- `NewStepTemplateButton`: shadcn Dialog form with controlled state; name, description, stepType, assigneeRole; calls `stepTemplate.create` mutation, invalidates library list
- `StepDetailEditor`: 360px slide-in panel; `Edit Step` header with name/type/role; dispatches to 8 editors based on `stepTemplate.stepType`; Save wired to `workflows.playbook.updateStep` (Plan 04); hard-reload after Save shows persisted values
- `FormFillEditor`: field list with add, remove, and up/down reorder; native checkbox for required flag (no shadcn Checkbox in this project)
- `InspectionItemEditor`: instruction textarea (500 chars with live counter) + shadcn Switch for requirePhotoOnFail
- 6 SimpleEditors: DocumentUpload (MIME types + max size + instructions), Signature (label + consent text), TrainingAck (URL + min seconds), Approval (approver role select + instructions), ThirdParty (name + email + instructions), CustomNote (large textarea)
- `tsc --noEmit` and `npm run build` both pass clean; `/checklists/playbooks/[id]/edit` appears in Next.js route manifest
- Naming lint passed: no `PlaybookInstance`, `StepInstance`, `PlaybookTrigger` in rendered JSX

## Task Commits

Each task was committed atomically:

1. **Task 1: Build 3-column builder shell with DnD canvas + phase sections + reorder** - `c79ae67` (feat)
2. **Task 2: Build Step Library Panel + StepDetailEditor with 8 step-type editors + New StepTemplate dialog** - `5ba8344` (feat)

## Files Created/Modified

- `apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/page.tsx` — server component; async params; renders BuilderClient
- `apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/_components/BuilderClient.tsx` — 3-column layout, DndContext, normaliseSteps(), optimistic localSteps, drag handlers
- `apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/_components/BuilderCanvas.tsx` — 5 PhaseSection columns grouped by playbookPhase
- `apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/_components/PhaseSection.tsx` — SortableContext per phase, useDroppable empty zone
- `apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/_components/BuilderStepRow.tsx` — useSortable row with drag handle, badges, remove button
- `apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/_components/StepLibraryPanel.tsx` — filter chips, DraggableTemplateCard, footer button
- `apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/_components/NewStepTemplateButton.tsx` — Dialog form for stepTemplate.create
- `apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/_components/StepDetailEditor.tsx` — slide-in editor, 8-type switch, updateStep Save
- `apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/_components/stepConfigEditors/FormFillEditor.tsx` — full field editor
- `apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/_components/stepConfigEditors/InspectionItemEditor.tsx` — instruction + photo toggle
- `apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/_components/stepConfigEditors/SimpleEditors.tsx` — 6 simpler editors

## Decisions Made

- `normaliseSteps()` helper: Next.js build TypeScript is stricter than `tsc --noEmit`; direct `as PlaybookStepItem[]` cast on `playbook.steps` caused TS2589 instantiation-too-deep error in the build worker; an explicit normaliser function with `any` input breaks the inference chain cleanly without polluting types elsewhere
- `PlaybookStepItem` exported from `BuilderClient`: single source of truth shared across siblings (BuilderCanvas, BuilderStepRow, StepDetailEditor) — no duplicate interface definitions
- `updateStep onError` moved to `mutate()` second arg: passing `onError` inside `mutationOptions()` for the `updateStep` procedure (which returns a complex Prisma include type) triggered TS2589 in the build; splitting to the `mutate()` callback resolves it
- Native `<input type="checkbox">` in FormFillEditor: `@/components/ui/checkbox` (shadcn) does not exist in this project; used native checkbox with `accent-primary` Tailwind class instead

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TS2589 type instantiation too deep on playbook.steps cast**
- **Found during:** Task 1 build verification
- **Issue:** `playbook.steps as PlaybookStepItem[]` in `handleDragStart` and `handleDragOver` caused "type instantiation is excessively deep and possibly infinite" in Next.js production build (stricter than `tsc --noEmit`)
- **Fix:** Introduced `normaliseSteps(raw: any[]): PlaybookStepItem[]` helper that explicitly maps raw data to the typed shape, breaking TypeScript's inference chain; `playbook.steps` is normalised once in `useMemo` on the server data
- **Files modified:** `BuilderClient.tsx`

**2. [Rule 1 - Bug] TS2589 on updateStep mutationOptions with onError**
- **Found during:** Task 2 build verification
- **Issue:** `trpc.workflows.playbook.updateStep.mutationOptions({ onError })` triggered TS2589 because `updateStep` returns a type with deeply nested Prisma include (PlaybookStep + stepTemplate) that causes instantiation depth overflow when combined with the generic error callback
- **Fix:** Moved `onError` handler from `mutationOptions({})` into the `mutate()` second argument (per-call callbacks); `mutationOptions()` is called with only `onSuccess`
- **Files modified:** `StepDetailEditor.tsx`

**3. [Rule 2 - Missing critical functionality] shadcn Checkbox not installed**
- **Found during:** Task 2 — FormFillEditor references `@/components/ui/checkbox`
- **Issue:** `apps/web/src/components/ui/checkbox.tsx` does not exist in the project; import fails TypeScript type check
- **Fix:** Replaced shadcn Checkbox with native `<input type="checkbox">` styled with `accent-primary` — functionally equivalent for a simple required-toggle
- **Files modified:** `FormFillEditor.tsx`

## Issues Encountered

None beyond the auto-fixed TypeScript build errors above.

## User Setup Required

None — no external service configuration required.

## Self-Check

Files created:
- `apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/page.tsx` — FOUND
- `apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/_components/BuilderClient.tsx` — FOUND
- `apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/_components/BuilderCanvas.tsx` — FOUND
- `apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/_components/PhaseSection.tsx` — FOUND
- `apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/_components/BuilderStepRow.tsx` — FOUND
- `apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/_components/StepLibraryPanel.tsx` — FOUND
- `apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/_components/NewStepTemplateButton.tsx` — FOUND
- `apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/_components/StepDetailEditor.tsx` — FOUND
- `apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/_components/stepConfigEditors/FormFillEditor.tsx` — FOUND
- `apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/_components/stepConfigEditors/InspectionItemEditor.tsx` — FOUND
- `apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/_components/stepConfigEditors/SimpleEditors.tsx` — FOUND

Commits:
- c79ae67: feat(42-06): build 3-column builder shell with DnD canvas + phase sections + reorder — FOUND
- 5ba8344: feat(42-06): build Step Library Panel, StepDetailEditor with 8 step-type editors, New Step Template dialog — FOUND

TypeScript: PASSED (tsc --noEmit clean)
Build: PASSED (npm run build exit code 0, /checklists/playbooks/[id]/edit in route manifest)
Naming lint: PASSED (no PlaybookInstance/StepInstance/PlaybookTrigger in JSX text)
updateStep wiring: PASSED (workflows.playbook.updateStep found in StepDetailEditor.tsx)

## Self-Check: PASSED

## Next Phase Readiness

- Playbook Builder is fully functional: library, canvas, drag-and-drop (within and across phases), step detail editor with all 8 step types
- `overrideConfig` persistence verified by the Save → invalidate → refetch cycle — hard reload shows saved values
- Plan 07 (naming lint test / phase wrap-up) can run against the builder files — all naming checks will pass
- Phase 42 UAT goal is achievable: "build a Pre-Trip Inspection checklist in under 10 minutes" — owner can create a playbook, drag inspection steps into it, configure each with instructions and photo toggle, save, and reload

---
*Phase: 42-workflow-engine-foundation*
*Completed: 2026-04-24*
