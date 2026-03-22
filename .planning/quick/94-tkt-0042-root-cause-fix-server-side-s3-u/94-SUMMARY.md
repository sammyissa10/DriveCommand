---
phase: quick-94
plan: "01"
subsystem: documents
tags: [upload, s3, r2, cors, ios-safari, server-action]
dependency_graph:
  requires: []
  provides: [server-side-small-file-upload]
  affects: [driver-documents-page]
tech_stack:
  added: []
  patterns: [server-action-file-upload, PutObjectCommand-server-side]
key_files:
  created: []
  modified:
    - src/app/(owner)/actions/driver-documents.ts
    - src/components/documents/driver-document-upload.tsx
decisions:
  - Upload small files entirely server-side via PutObjectCommand instead of presigned URL + client PUT
  - Keep requestDriverUploadUrl and completeDriverDocumentUpload for potential multipart reuse
metrics:
  duration: "~2 minutes"
  completed: "2026-03-22"
  tasks_completed: 2
  files_modified: 2
---

# Phase quick-94 Plan 01: TKT-0042 Root Cause Fix — Server-Side S3 Upload Summary

**One-liner:** Eliminated client-to-S3 PUT for small files by routing file bytes through a new `uploadDriverDocument` server action that uses `PutObjectCommand` directly, removing the CORS dependency that caused iOS Safari "Load failed" errors.

## What Was Built

The iOS Safari upload failure (TKT-0042) was a CORS error: the browser blocked the client-side `fetch PUT` to Cloudflare R2 because R2 does not allow cross-origin PUT requests from the browser. The fix eliminates the cross-origin PUT entirely.

### New server action: `uploadDriverDocument`

Added to `src/app/(owner)/actions/driver-documents.ts`:
- Auth check first (`requireRole OWNER | MANAGER`)
- Extracts file + metadata from `FormData`
- Validates file size against `MAX_FILE_SIZE`
- Reads first 4100 bytes for magic-bytes type validation
- Gets `tenantId` + `currentUser`
- Builds `s3Key = tenant-{tenantId}/drivers/{fileId}-{sanitizedFileName}`
- Uploads using `PutObjectCommand` (server → R2, no CORS involved)
- Validates document data with `documentCreateSchema`
- Creates DB record via `DocumentRepository`
- Calls `revalidatePath(/drivers/{driverId})`
- Returns `{ success, document }` or `{ error }`

### Rewritten `uploadSmallFile` in client component

Changed `src/components/documents/driver-document-upload.tsx`:
- Replaces 3-step flow (requestPresignedUrl → fetch PUT to S3 → completeDriverDocumentUpload) with a single `uploadDriverDocument(formData)` call
- Upload state goes directly to `'saving'` (no `'uploading'` progress bar step for small files — there is no observable S3 PUT to track)
- No `AbortController` signal passed (server actions are not abortable via signal)
- `uploadLargeFile`, `handleUpload`, `handleFileChange`, and all other functions are untouched

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Add uploadDriverDocument server action | 7f8ed63 | src/app/(owner)/actions/driver-documents.ts |
| 2 | Rewrite uploadSmallFile to use server-side upload | 0abbdc8 | src/components/documents/driver-document-upload.tsx |

## Verification

- `npx tsc --noEmit` — passed, no type errors
- `npm run build` — passed, no errors
- Manual test required: upload a small PDF (<5MB) on the driver documents page — should succeed without CORS/network error on iOS Safari

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

Files verified:
- FOUND: src/app/(owner)/actions/driver-documents.ts
- FOUND: src/components/documents/driver-document-upload.tsx

Commits verified:
- FOUND: 7f8ed63
- FOUND: 0abbdc8
