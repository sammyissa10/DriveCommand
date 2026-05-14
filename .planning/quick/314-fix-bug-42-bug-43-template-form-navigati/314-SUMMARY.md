---
phase: quick-314
plan: "01"
subsystem: carrier/templates, carrier/facilities
tags: [bug-fix, navigation, facility-form, template-form]
dependency_graph:
  requires: []
  provides: [FacilityForm.onCancel, RouteTemplateForm.post-save-redirect]
  affects: [StopBuilderAddModal, carrier-templates-create, carrier-templates-edit]
tech_stack:
  added: []
  patterns: [optional-callback-escape-hatch, unified-post-save-redirect]
key_files:
  modified:
    - apps/web/src/components/carrier/facilities/FacilityForm.tsx
    - apps/web/src/components/carrier/stops/StopBuilderAddModal.tsx
    - apps/web/src/components/carrier/templates/RouteTemplateForm.tsx
decisions:
  - "Cancel fallback uses ternary (onCancel ? onCancel() : router.push) so standalone /carrier/facilities/new page retains its original navigation with zero regression risk"
  - "Both create and edit template success paths unified to /carrier/templates — router.push on App Router client components automatically re-fetches the destination list, no separate router.refresh() needed"
metrics:
  duration_minutes: 8
  tasks_completed: 2
  files_modified: 3
  completed_date: "2026-05-14"
---

# Quick 314: Fix Bug 42 + Bug 43 — Template Form Navigation Summary

Fix two template form navigation bugs: FacilityForm Cancel context-awareness via optional `onCancel` prop, and RouteTemplateForm unified post-save redirect to `/carrier/templates`.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Bug 42 — FacilityForm onCancel prop + StopBuilderAddModal wire-up | 77e9f86 | FacilityForm.tsx, StopBuilderAddModal.tsx |
| 2 | Bug 43 — RouteTemplateForm unified redirect to /carrier/templates | cd9f823 | RouteTemplateForm.tsx |

## What Was Built

### Bug 42 — FacilityForm Cancel destroys template state

**Root cause:** `FacilityForm`'s Cancel button hard-called `router.push('/carrier/facilities')`, triggering a full page navigation away from the template form when the component was embedded inside a Sheet.

**Fix:** Added optional `onCancel?: () => void` to `FacilityFormProps`. Cancel button now uses `onCancel ? onCancel() : router.push('/carrier/facilities')`. `StopBuilderAddModal` passes `onCancel={() => setShowFacilitySheet(false)}` to close only the sheet, leaving the template form state intact.

**Regression safety:** Standalone `/carrier/facilities/new` page does not pass `onCancel`, so the fallback `router.push('/carrier/facilities')` fires exactly as before.

### Bug 43 — Template edit save doesn't redirect

**Root cause:** `handleSubmit` in `RouteTemplateForm` had a conditional: create-mode pushed to `/carrier/templates/${result.templateId}`, edit-mode only called `router.refresh()`, leaving the user stranded on the edit page.

**Fix:** Replaced the entire conditional block with a single `router.push('/carrier/templates')`. Both create and edit now land on the template list after save.

## Verification

```
grep -n "onCancel" apps/web/src/components/carrier/facilities/FacilityForm.tsx
# 85:  onCancel?: () => void;
# 133:export function FacilityForm({ initialData, onSuccess, onCancel }: FacilityFormProps) {
# 552:          onClick={() => onCancel ? onCancel() : router.push('/carrier/facilities')}

grep -n "onCancel" apps/web/src/components/carrier/stops/StopBuilderAddModal.tsx
# 150:                onCancel={() => setShowFacilitySheet(false)}

grep -n "router.push\|router.refresh" apps/web/src/components/carrier/templates/RouteTemplateForm.tsx
# 317:      router.push('/carrier/templates');  ← handleSubmit success (only match in submit path)
# 762:          onClick={() => router.push('/carrier/templates')}  ← Cancel button (unchanged)
```

`tsc --noEmit` exits clean.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `apps/web/src/components/carrier/facilities/FacilityForm.tsx` — modified, onCancel present
- `apps/web/src/components/carrier/stops/StopBuilderAddModal.tsx` — modified, onCancel wired
- `apps/web/src/components/carrier/templates/RouteTemplateForm.tsx` — modified, unified redirect present
- Commit 77e9f86 — verified in git log
- Commit cd9f823 — verified in git log
- TypeScript clean
