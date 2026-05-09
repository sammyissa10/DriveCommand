---
phase: quick-188
plan: "01"
subsystem: carrier/templates
tags: [bug-fix, forms, dropdowns, db-constraints]
dependency_graph:
  requires: []
  provides: [route-template-form-works]
  affects: [carrier-templates]
tech_stack:
  added: []
  patterns: [form-value-db-alignment]
key_files:
  modified:
    - apps/web/src/components/carrier/templates/RouteTemplateForm.tsx
    - apps/web/src/components/carrier/templates/RouteTemplateList.tsx
decisions:
  - "Both fixed_days and frequency are recurring types that need recurrence fields; on_call is the only non-recurring type"
metrics:
  duration: "5m"
  completed: "2026-04-06"
  tasks_completed: 2
  files_modified: 2
---

# Phase quick-188 Plan 01: Fix Route Template Form Dropdowns Summary

Fixed route template form dropdowns so values match DB check constraints — removing invalid values (intermodal, power_only, recurring, on_demand, seasonal) and replacing with the exact allowed values (dry_van, flatbed, reefer, tanker, step_deck, other / fixed_days, frequency, on_call).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Update dropdown constants and conditional logic in RouteTemplateForm.tsx | 56f4781 | RouteTemplateForm.tsx |
| 2 | Update schedule type display logic in RouteTemplateList.tsx | 56f4781 | RouteTemplateList.tsx |

## What Was Built

- `EQUIPMENT_TYPES` constant updated: removed `intermodal` and `power_only`, added `other`, reordered to match DB constraint (dry_van, flatbed, reefer, tanker, step_deck, other)
- `SCHEDULE_TYPES` constant updated: replaced `recurring/on_demand/seasonal` with `fixed_days/frequency/on_call`
- Default `scheduleType` state changed from `'recurring'` to `'fixed_days'`
- Recurrence fields conditional updated from `scheduleType === 'recurring'` to `scheduleType === 'fixed_days' || scheduleType === 'frequency'`
- `RouteTemplateList.tsx` display logic updated to format recurrence rules for `fixed_days` and `frequency`, fallback capitalized label for `on_call`

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- `apps/web/src/components/carrier/templates/RouteTemplateForm.tsx` — exists, modified
- `apps/web/src/components/carrier/templates/RouteTemplateList.tsx` — exists, modified
- Commit `56f4781` — exists
- `tsc --noEmit` — passed with no errors
