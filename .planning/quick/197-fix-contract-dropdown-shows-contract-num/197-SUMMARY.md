---
phase: quick-197
plan: "01"
subsystem: carrier-ops
tags: [carrier, contracts, dispatches, ui-display]
dependency_graph:
  requires: []
  provides:
    - contract-dropdown-name-display
    - dispatch-preview-human-readable
  affects:
    - apps/web/src/components/carrier/templates/RouteTemplateForm.tsx
    - apps/web/src/components/carrier/loads/LoadForm.tsx
    - apps/web/src/components/carrier/templates/DispatchPreview.tsx
    - apps/web/src/lib/carrier/dispatches.ts
tech_stack:
  added: []
  patterns:
    - Prisma include for relation joins (driver, truck) in listDispatches
    - Regex extraction of embedded dispatch number from notes field
key_files:
  modified:
    - apps/web/src/components/carrier/templates/RouteTemplateForm.tsx
    - apps/web/src/components/carrier/loads/LoadForm.tsx
    - apps/web/src/components/carrier/templates/DispatchPreview.tsx
    - apps/web/src/lib/carrier/dispatches.ts
decisions:
  - Used notes-field regex pattern (existing codebase convention) to extract dispatch number in frontend rather than adding a dedicated column
metrics:
  duration: "~10 minutes"
  completed: "2026-04-07"
  tasks_completed: 2
  files_modified: 4
---

# Quick-197: Fix Contract Dropdown Shows Contract Number and Dispatch Preview UUIDs

**One-liner:** Contract dropdowns now show contractName as primary label with number as subtitle; dispatch preview table shows DC-YYYY-NNNNN numbers, driver full names, and truck unit numbers instead of truncated UUIDs.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix contract dropdowns to show name with number subtitle | 4382d4a | RouteTemplateForm.tsx, LoadForm.tsx |
| 2 | Fix dispatch preview table to show human-readable values | 14a8241 | DispatchPreview.tsx, dispatches.ts |

## What Was Done

### Task 1 — Contract Dropdowns

**RouteTemplateForm.tsx:**
- Added `contractName: string | null` to `ContractItem` interface
- Updated `<SelectItem>` rendering to show `contractName` as primary label with `contractNumber` as a smaller mono subtitle below it (only shown when name exists)

**LoadForm.tsx:**
- Added `contractName: string | null` to `Contract` interface
- Updated `<option>` to display `contractName || contractNumber || fallback` — no structural change needed since it's a plain HTML select

### Task 2 — Dispatch Preview

**dispatches.ts:**
- Added `primaryDriver: { select: { firstName, lastName } }` and `truck: { select: { unitNumber } }` includes to the `listDispatches` Prisma query
- Relation names `primaryDriver` (name: "PrimaryDriver") and `truck` (name: "PrimaryTruck") confirmed from schema

**DispatchPreview.tsx:**
- Expanded `DispatchItem` interface with `notes`, `primaryDriver`, and `truck` fields
- Added `extractDispatchNumber()` helper using the existing `[DISPATCH_NUMBER=DC-YYYY-NNNNN]` regex pattern
- Updated table cells: dispatch ID column shows extracted number (falls back to truncated UUID in mono), driver column shows full name, truck column shows unit number

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

### Files exist:
- `apps/web/src/components/carrier/templates/RouteTemplateForm.tsx` — FOUND
- `apps/web/src/components/carrier/loads/LoadForm.tsx` — FOUND
- `apps/web/src/components/carrier/templates/DispatchPreview.tsx` — FOUND
- `apps/web/src/lib/carrier/dispatches.ts` — FOUND

### Commits exist:
- `4382d4a` feat(quick-197): fix contract dropdowns — FOUND
- `14a8241` feat(quick-197): fix dispatch preview — FOUND

### TypeScript: PASSED (zero errors)

## Self-Check: PASSED
