---
phase: quick-96
plan: "01"
subsystem: documents
tags:
  - ios-safari
  - mobile-ux
  - driver-documents
dependency_graph:
  requires: []
  provides:
    - ios-safe-view-button
    - redesigned-mobile-document-card
  affects:
    - src/components/documents/driver-document-list.tsx
tech_stack:
  added: []
  patterns:
    - synchronous-window-open-before-async
key_files:
  modified:
    - src/components/documents/driver-document-list.tsx
decisions:
  - Open blank window synchronously in user gesture handler, set location.href after async fetch resolves — required pattern for iOS Safari popup blocker bypass
  - Edit form (isEditing branch) left entirely untouched per plan constraint
metrics:
  duration: "~5 minutes"
  completed: "2026-03-22T18:33:18Z"
  tasks_completed: 1
  files_modified: 1
---

# Quick-96: TKT-0043 — Fix iOS View Button and Redesign Mobile Document Card Summary

One-liner: iOS-safe synchronous window.open before async fetch + 2-row compact mobile card replacing cramped 3-button row in driver-document-list.

## What Was Done

### Task 1: Fix iOS Safari handleView and redesign mobile document card

**Change 1 — handleView iOS fix:**
The original `handleView` called `window.open()` after awaiting `getDownloadUrl()`. iOS Safari treats `window.open()` called from an async callback as an untrusted popup and blocks it. The fix opens a blank window synchronously at the top of the function (within the user gesture), then sets `win.location.href` after the fetch resolves. If the fetch fails, `win.close()` is called to clean up the orphaned tab.

**Change 2 — formatShortDate helper:**
Added `formatShortDate` alongside the existing `formatDate`. The short version omits hour/minute for the compact row-2 display.

**Change 3 — 2-row card layout:**
Replaced the previous layout (left column: badges + filename + size + date + notes; right column: Edit, View, Delete buttons stacked) with a cleaner 2-row design:
- Row 1: file-type badge + truncated filename + blue View button (flex-shrink-0, right-aligned)
- Row 2: doc-type badge + file size + dot separator + short date (left) / Edit and Delete text links (right)
- Below row 2 (conditional): expiry badge, notes

The edit form (isEditing branch) was not touched.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `src/components/documents/driver-document-list.tsx` exists and contains `window.open('', '_blank')` before any await
- [x] `npx tsc --noEmit` passes with zero errors
- [x] Edit form (isEditing branch) unchanged
- [x] Commit e40f787 exists

## Self-Check: PASSED
