---
phase: quick-166
plan: "01"
subsystem: carrier-ops
tags:
  - drag-and-drop
  - dnd-kit
  - stop-builder
  - carrier-ops
  - reusable-component
dependency_graph:
  requires:
    - apps/web/src/components/carrier/facilities/FacilitySearchModal.tsx
    - apps/web/src/components/carrier/facilities/FacilityForm.tsx
  provides:
    - apps/web/src/components/carrier/stops/StopBuilder.tsx
    - apps/web/src/components/carrier/stops/StopCard.tsx
    - apps/web/src/components/carrier/stops/StopBuilderAddModal.tsx
  affects:
    - Route Templates create/edit pages (future)
    - Loads create/edit pages (future)
tech_stack:
  added:
    - "@dnd-kit/core ^6.3.1"
    - "@dnd-kit/sortable ^10.0.0"
    - "@dnd-kit/utilities ^3.2.2"
  patterns:
    - "SortableContext + DragOverlay pattern for accessible drag-and-drop lists"
    - "Controlled component pattern — stops[] + onChange callback"
    - "Two-step modal flow — facility search then quick-add form"
    - "Mode prop ('template' | 'load') toggles appointment field types"
key_files:
  created:
    - apps/web/src/components/carrier/stops/StopBuilder.tsx
    - apps/web/src/components/carrier/stops/StopCard.tsx
    - apps/web/src/components/carrier/stops/StopBuilderAddModal.tsx
  modified:
    - apps/web/package.json
    - package-lock.json
decisions:
  - "DragOverlay uses isDragOverlay prop to disable interactivity on clone — avoids useSortable re-entrancy"
  - "StopBuilderStop exported from StopCard.tsx and re-exported from StopBuilder.tsx — consumers import from StopBuilder"
  - "BOL/POD auto-defaults on stop_type change in add modal — pickup auto-sets BOL, delivery auto-sets both"
  - "sequence_order recomputed as 1-based integer after every add/remove/reorder — parent array is source of truth"
  - "PointerSensor activationConstraint distance:5 prevents accidental drags on inline-edit clicks"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-05"
  tasks_completed: 2
  files_created: 3
  files_modified: 2
---

# Phase quick-166 Plan 01: Stop Builder Drag-and-Drop Summary

Drag-and-drop sortable stop builder using @dnd-kit/sortable with inline-edit cards and two-step facility-search add modal.

## What Was Built

Three fully reusable components in `apps/web/src/components/carrier/stops/`:

**StopCard.tsx** — Individual stop card with:
- `useSortable` drag handle (GripVertical icon, PointerSensor-safe)
- Sequence number badge, stop-type badge (pickup=blue, delivery=green, fuel_stop=gray, layover=amber)
- Indicators: appointment window text, dwell time, BOL/POD badges
- Inline edit panel toggled on card body click — 2-column grid with all specified fields
- Mode-aware appointment fields: template mode shows offset number inputs, load mode shows datetime-local inputs
- `isDragOverlay` prop to disable interactivity when used as DragOverlay clone

**StopBuilder.tsx** — Fully controlled container component with:
- DndContext + SortableContext (verticalListSortingStrategy)
- PointerSensor (activationConstraint: distance 5) + KeyboardSensor for accessibility
- `onDragEnd` uses `arrayMove` then recomputes 1-based `sequence_order`
- Empty state: dashed-border rounded container with centered Add Stop button
- DragOverlay renders a StopCard clone for smooth visual feedback
- Re-exports `StopBuilderStop` type for consumer imports

**StopBuilderAddModal.tsx** — Two-step dialog with:
- Step 1: Renders `FacilitySearchModal` directly (no wrapper dialog needed — it has its own)
- "Create New Facility" opens `FacilityForm` in a side Sheet
- Step 2: Quick-add form with stop_type Select, BOL/POD Switches, commodity Input, special instructions Textarea
- Auto-sets BOL=true for pickup/delivery, POD=true for delivery on stop_type change
- Generates `crypto.randomUUID()` for stop id, sequence_order=0 (parent resequences on add)
- Resets all state on modal close

## Verification

- `tsc --noEmit` passed with zero errors
- All three files exist at `apps/web/src/components/carrier/stops/`
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` in `apps/web/package.json`
- `StopBuilderStop` exported from `StopBuilder.tsx`
- No auto-sort logic — `grep "sort"` finds only `sortableKeyboardCoordinates` and `arrayMove` from @dnd-kit imports
- `FacilitySearchModal` imported and used in `StopBuilderAddModal`

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Hash | Message |
|------|---------|
| 155197c | feat(quick-166): install @dnd-kit and create StopCard with inline edit |
| 8157571 | feat(quick-166): create StopBuilder and StopBuilderAddModal |

## Self-Check: PASSED

- `apps/web/src/components/carrier/stops/StopBuilder.tsx` — EXISTS
- `apps/web/src/components/carrier/stops/StopCard.tsx` — EXISTS
- `apps/web/src/components/carrier/stops/StopBuilderAddModal.tsx` — EXISTS
- Commit 155197c — EXISTS
- Commit 8157571 — EXISTS
