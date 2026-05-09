---
phase: quick-171
plan: "01"
subsystem: carrier-ops
tags: [documents, expenses, upload, carrier, modal, form]
dependency_graph:
  requires: [carrier-ops-dispatch-detail, carrier-ops-stops-api]
  provides: [document-upload-ux, document-list-ux, expense-form-ux, stop-upload-wiring]
  affects: [StopTimelineCard, carrier-documents-api, carrier-expenses-api]
tech_stack:
  added: []
  patterns: [XMLHttpRequest-upload-progress, drag-and-drop-file-input, auto-reimbursable-toggle]
key_files:
  created:
    - apps/web/src/components/carrier/documents/DocumentUploadModal.tsx
    - apps/web/src/components/carrier/documents/DocumentList.tsx
    - apps/web/src/components/carrier/expenses/ExpenseForm.tsx
  modified:
    - apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx
decisions:
  - Used XMLHttpRequest (not fetch) for upload to enable real percentage progress via xhr.upload.onprogress
  - DocumentUploadModal trigger is a small text button rendered inside the modal component, not external
  - onStopUpdated made optional on StopTimelineCard so existing call sites with 7 props continue working
metrics:
  duration: "~15 minutes"
  completed: "2026-04-05"
  tasks_completed: 2
  files_created: 3
  files_modified: 1
---

# Quick Task 171: Carrier Ops Document Upload Modal and Expense Form

**One-liner:** XHR-powered document upload modal with drag-and-drop + progress, document list with verify/delete actions, expense form with auto-reimbursable toggle — all wired into StopTimelineCard replacing disabled stubs.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create DocumentUploadModal and DocumentList | 29ffb94 | DocumentUploadModal.tsx, DocumentList.tsx |
| 2 | Create ExpenseForm + wire StopTimelineCard | b982ca4 | ExpenseForm.tsx, StopTimelineCard.tsx |

## What Was Built

### DocumentUploadModal (`components/carrier/documents/DocumentUploadModal.tsx`)
- Dialog controlled by internal `open` state with small "Upload" trigger button
- File drop zone with `onDragOver`/`onDrop` + hidden `<input type="file">`
- Accepts `.pdf,.jpg,.jpeg,.png,.heic,.webp`, 25MB client-side limit
- File preview row showing filename + formatted size (KB/MB)
- `document_type` select pre-filled from prop but editable (bol/pod/rate_confirmation/other)
- Optional notes textarea
- Upload via `XMLHttpRequest` POST to `/api/v1/carrier/documents` with FormData
- Real percentage progress displayed in button text ("Uploading... 67%")
- Error state with Retry button that re-sends same request
- Disables file input and upload button while uploading

### DocumentList (`components/carrier/documents/DocumentList.tsx`)
- Fetches `GET /api/v1/carrier/documents?parent_type=&parent_id=` on mount
- Loading skeleton (3 rows of animate-pulse)
- Compact stacked rows (no table): type badge + filename + size + uploader + verified checkmark
- Document type badges matching StopTimelineCard color system (indigo/teal/blue/gray)
- View button: opens presigned URL in new tab
- Delete: AlertDialog confirm → `DELETE /api/v1/carrier/documents/{id}`
- Verify: `PATCH /api/v1/carrier/documents/{id}/verify`
- Re-fetches list after delete or verify
- Empty state: "No documents uploaded"
- Action visibility controlled by `userRole` prop (defaults to showing all — API enforces server-side)

### ExpenseForm (`components/carrier/expenses/ExpenseForm.tsx`)
- 6 fields: expense_type, amount, paid_by, driver_id, notes, reimbursable toggle
- Fetches active drivers from `GET /api/v1/carrier/drivers?status=active` on mount
- Auto-reimbursable: sets `true` when `paid_by=driver_cash`, `false` when `company_card`, unchanged for `owner_advance`
- Validation: dispatchId OR loadId must be present, amount > 0, required selects
- POSTs JSON to `/api/v1/carrier/expenses`, resets form on success
- Reimbursable styled as accessible toggle button with `role="switch"`

### StopTimelineCard (modified)
- Added optional `onStopUpdated?: () => void` prop — existing call sites unaffected
- Imported `DocumentUploadModal`
- Replaced two disabled `<button>` stubs with live `<DocumentUploadModal>` instances
  - Pickup stop → `documentType="bol"`
  - Delivery stop → `documentType="pod"`
- Both call `onStopUpdated?.()` via `onSuccess` callback
- All existing behavior preserved (bolUploaded/podUploaded guards, Complete Stop, Skip)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `DocumentUploadModal.tsx` exists: FOUND
- [x] `DocumentList.tsx` exists: FOUND
- [x] `ExpenseForm.tsx` exists: FOUND
- [x] `StopTimelineCard.tsx` modified: FOUND
- [x] `cursor-not-allowed` stubs removed: CONFIRMED (grep returns nothing)
- [x] `DocumentUploadModal` imported + used in StopTimelineCard: CONFIRMED (lines 26, 366, 394)
- [x] `XMLHttpRequest` used in DocumentUploadModal: CONFIRMED (2 occurrences)
- [x] `Must be linked` validation in ExpenseForm: CONFIRMED (line 92)
- [x] TypeScript: PASSED (no errors)
- [x] Commit 29ffb94: FOUND
- [x] Commit b982ca4: FOUND

## Self-Check: PASSED
