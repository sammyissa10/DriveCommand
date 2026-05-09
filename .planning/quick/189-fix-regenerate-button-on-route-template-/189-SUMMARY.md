---
phase: quick-189
plan: "01"
subsystem: carrier/templates
tags: [bug-fix, ui, dispatch, route-templates]
dependency_graph:
  requires: []
  provides: [working-regenerate-button-with-error-feedback]
  affects: [DispatchPreview]
tech_stack:
  added: []
  patterns: [type-safe-api-contract, comprehensive-toast-feedback]
key_files:
  created: []
  modified:
    - apps/web/src/components/carrier/templates/DispatchPreview.tsx
decisions:
  - "Errors toast takes priority over skipped-existing toast when dispatches_created is 0"
  - "Error messages are shown both in toast (first error) and in summary banner list (all errors)"
metrics:
  duration: "5 minutes"
  completed: "2026-04-06"
  tasks_completed: 1
  files_changed: 1
---

# Quick-189: Fix Regenerate Button on Route Template Summary

Fixed three bugs in DispatchPreview.tsx so the Regenerate button provides complete user feedback: type mismatch (`errors: number` → `errors: string[]`), missing error-path toast, and broken `.length` check in summary banner.

## What Was Done

### Task 1: Fix DispatchPreview type mismatch and add comprehensive error feedback

**Bug 1 - Type mismatch:** `GenerateResult.errors` was typed as `number` but the API at `/api/v1/carrier/route-templates/[id]/generate` returns `string[]` from `dispatch-generator.ts`. Changed to `errors: string[]`.

**Bug 2 - Silent failure on errors-only outcome:** When generation produced only errors (e.g., missing driver, missing truck, no recurrence rule), `dispatches_created` and `skipped_existing` were both 0, so no toast was shown. Added an `errors.length > 0` branch (with priority over skipped) and a final fallback for the zero-result case.

**Bug 3 - Broken error count in summary banner:** `generateResult.errors > 0` was comparing a `string[]` to a number (always truthy). Fixed to `generateResult.errors.length > 0`, with the count and each error message rendered as a list below the summary line.

**Commit:** 85fe9f9

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `apps/web/src/components/carrier/templates/DispatchPreview.tsx` — exists and modified
- Commit 85fe9f9 — verified
- `npx tsc --noEmit` — no errors
