---
phase: quick-435
plan: "01"
subsystem: onboarding
tags: [copy-change, onboarding, checklist, activation]
dependency_graph:
  requires: []
  provides: [corrected-onboarding-checklist-copy]
  affects: [apps/web/src/app/onboarding/welcome/checklist.tsx]
tech_stack:
  added: []
  patterns: [optional-interface-field, conditional-subtext-render]
key_files:
  created: []
  modified:
    - apps/web/src/app/onboarding/welcome/checklist.tsx
decisions:
  - "Added optional description field to ChecklistItem interface rather than hardcoding subtext per item, keeping the pattern extensible for future items"
  - "Subtext only renders when item is not yet complete — avoids visual clutter for already-done steps"
metrics:
  duration: "~3 minutes"
  completed: "2026-06-11T21:19:38Z"
  tasks_completed: 1
  files_changed: 1
---

# Phase quick-435 Plan 01: Fix Dispatch Your First Load Onboarding Summary

Renamed the 5th activation checklist item from "Dispatch your first load" to "Send your first load in transit" with a clarifying subtext, so the label matches the `firstLoadInTransitAt` trigger.

## What Was Built

**Copy-only fix:** The 5th onboarding activation checklist item previously read "Dispatch your first load" but its completion trigger is `firstLoadInTransitAt !== null` (a load reaching In Transit status, not dispatch). This mismatch confused new users. The label now reads "Send your first load in transit" with subtext "Assign a load to a trip and mark it In Transit." shown beneath the label when the step is incomplete.

**Minimal structural change:** Added an optional `description?: string` field to the `ChecklistItem` interface and updated the render block to show a subtext `<span>` below the label when `description` is present and the item is not yet complete.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Update checklist label and add subtext support | 15c1d162 | apps/web/src/app/onboarding/welcome/checklist.tsx |

## Verification

- `Send your first load in transit` present in checklist.tsx (line 47)
- `Dispatch your first load` absent from checklist.tsx
- `complete: firstLoadInTransitAt !== null` unchanged (byte-for-byte identical)
- `href: '/carrier/dispatches'` unchanged
- `npx tsc --noEmit` — zero errors in checklist.tsx
- No other application files modified; planning/spec docs left untouched

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- `apps/web/src/app/onboarding/welcome/checklist.tsx` — confirmed modified with correct strings
- Commit `15c1d162` exists in git log
