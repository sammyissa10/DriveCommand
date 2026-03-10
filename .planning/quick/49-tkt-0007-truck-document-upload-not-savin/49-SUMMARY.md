---
phase: quick-49
plan: 49
subsystem: documents
tags: [bug-fix, ux, upload, modal, state-sync]
dependency_graph:
  requires: []
  provides: [document-upload-modal, document-list-rich, document-state-sync-fix]
  affects: [truck-documents-section, document-list, completeUpload-action]
tech_stack:
  added: [shadcn/ui Dialog, shadcn/ui Label, shadcn/ui Textarea, shadcn/ui Alert]
  patterns: [presigned-S3-upload, link-only-document, useEffect-state-sync]
key_files:
  created:
    - src/components/documents/document-upload-modal.tsx
    - src/components/ui/dialog.tsx
    - src/components/ui/label.tsx
    - src/components/ui/textarea.tsx
    - src/components/ui/alert.tsx
  modified:
    - prisma/schema.prisma
    - src/lib/validations/document.schemas.ts
    - src/app/(owner)/actions/documents.ts
    - src/lib/db/repositories/document.repository.ts
    - src/components/documents/document-list.tsx
    - src/app/(owner)/trucks/[id]/truck-documents-section.tsx
decisions:
  - "Used prisma db push instead of prisma migrate dev due to pre-existing schema drift in the development database"
  - "Relaxed s3Key/contentType/sizeBytes to optional with empty-string defaults to support link-only documents without breaking file-upload path"
  - "Fixed getDownloadUrl and deleteDocument to guard against empty s3Key for link-only documents"
metrics:
  duration: 268s
  completed: "2026-03-10"
  tasks: 2
  files: 11
---

# Phase Quick-49: TKT-0007 Truck Document Upload Not Saving — Summary

**One-liner:** Fixed stale useState state sync bug and replaced inline drop-zone with a Dialog modal collecting name, description, link, file, and expiry; extended schema with description/externalUrl columns.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Extend Document schema and server action for new fields | c2caa19 | prisma/schema.prisma, document.schemas.ts, documents.ts, document.repository.ts |
| 2 | Build upload modal and fix state sync bug | acb0f10 | document-upload-modal.tsx, document-list.tsx, truck-documents-section.tsx, documents.ts, 4 shadcn/ui components |

## What Was Built

### State Sync Bug Fix
The root cause of TKT-0007: `TruckDocumentsSection` initialized `documents` state from `initialDocuments` prop via `useState` but never re-synced when the prop changed after `router.refresh()`. Added a `useEffect` that calls `setDocuments(initialDocuments)` whenever `initialDocuments` changes, ensuring the list updates after the server re-fetches.

### Document Upload Modal
Replaced the inline drag-and-drop zone with a `Dialog`-based modal triggered by an "Upload Document" button. Fields:
- Document Name (required)
- Description (optional Textarea)
- Online Link (optional URL input)
- File Upload (optional, .pdf/.jpg/.jpeg/.png, max 10MB)
- Expiry Date (optional date input)

Supports two paths: file upload (requestUploadUrl → S3 PUT → completeUpload) and link-only (completeUpload directly with empty s3Key).

### Schema Extensions
Added `description String? @db.Text` and `externalUrl String?` to the Document model. Applied via `prisma db push`.

### Document List Enhancements
- Extended Document interface to include description, externalUrl, expiryDate, notes
- Renders description as gray subtext, externalUrl as "View online" anchor, expiryDate as "Expires: ..." label
- Hides Download button for link-only documents (empty contentType)
- Shows "LINK" badge for link-only documents

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing shadcn/ui components**
- **Found during:** Task 2
- **Issue:** document-upload-modal.tsx imported Dialog, Label, Textarea, Alert which weren't installed in the project
- **Fix:** Ran `npx shadcn@latest add dialog label textarea alert --yes` to install the four missing components
- **Files modified:** src/components/ui/dialog.tsx, label.tsx, textarea.tsx, alert.tsx (created)
- **Commits:** acb0f10

**2. [Rule 1 - Bug] deleteDocument crashes for link-only documents**
- **Found during:** Task 2 code review
- **Issue:** `deleteDocument` action checked `doc.s3Key.startsWith(...)` unconditionally — empty string would fail the guard and return "Invalid document" error, blocking deletion of link-only documents
- **Fix:** Added `if (doc.s3Key && ...)` guard; skips S3 deletion entirely when s3Key is empty
- **Files modified:** src/app/(owner)/actions/documents.ts
- **Commit:** acb0f10

**3. [Rule 1 - Bug] getDownloadUrl crashes for link-only documents**
- **Found during:** Task 2 code review
- **Issue:** `getDownloadUrl` would attempt to generate a presigned URL for an empty s3Key, which would result in an S3 error
- **Fix:** Added early return with a user-friendly error message when s3Key is empty; Download button is already hidden in the UI for link-only docs
- **Files modified:** src/app/(owner)/actions/documents.ts
- **Commit:** acb0f10

**4. [Rule 3 - Blocking] prisma migrate dev blocked by schema drift**
- **Found during:** Task 1
- **Issue:** Multiple existing migrations had been modified after apply and the database had drifted significantly from migration history — `prisma migrate dev` wanted to reset the entire database
- **Fix:** Used `prisma db push` to directly sync the new columns without touching migration history; followed by `prisma generate` to regenerate client
- **Files modified:** prisma/schema.prisma
- **Commit:** c2caa19

## Self-Check: PASSED

- FOUND: src/components/documents/document-upload-modal.tsx
- FOUND: src/components/ui/dialog.tsx
- FOUND: prisma/schema.prisma (with description + externalUrl fields)
- FOUND: commit c2caa19 (Task 1)
- FOUND: commit acb0f10 (Task 2)
