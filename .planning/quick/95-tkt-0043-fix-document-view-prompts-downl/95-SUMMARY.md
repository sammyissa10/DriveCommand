---
phase: quick-95
plan: "01"
subsystem: documents
tags: [bug-fix, storage, ux, mobile]
dependency_graph:
  requires: []
  provides: [inline-document-preview]
  affects: [driver-portal, owner-portal, support-tickets]
tech_stack:
  added: []
  patterns: [ResponseContentDisposition-inline, presigned-url]
key_files:
  created: []
  modified:
    - src/lib/storage/presigned.ts
    - src/components/driver/document-list-readonly.tsx
    - src/components/documents/driver-document-list.tsx
    - src/components/documents/document-list.tsx
decisions:
  - Keep generateDownloadUrl function name to avoid large rename; update JSDoc only
  - Keep downloadAction prop name in DocumentListReadOnly (API-level, not UI)
metrics:
  duration: "2 minutes"
  completed: "2026-03-22"
  tasks_completed: 2
  files_modified: 4
---

# Phase quick-95 Plan 01: TKT-0043 Fix Document View Prompts Download Summary

**One-liner:** Fixed mobile document preview by adding `ResponseContentDisposition: inline` to R2/S3 GetObjectCommand, then renamed "Download" buttons to "View" across all three document list components.

## What Was Built

TKT-0043 was caused by Cloudflare R2 (and S3) defaulting to `Content-Disposition: attachment` when no override is specified in the GetObjectCommand. This caused browsers — especially mobile — to prompt a file download instead of rendering the PDF or image inline in a new tab.

The fix is a one-line change to `generateDownloadUrl` in `src/lib/storage/presigned.ts`. Because all document viewing flows (driver portal, owner portal truck/route docs, owner portal driver docs, support ticket attachments) call through this single function, all consumers benefit with zero additional changes.

The button label rename from "Download" to "View" (with loading state "Opening...") aligns the UI with the new behavior across all three document list components.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Fix presigned URL to serve inline Content-Disposition | e8b00be | src/lib/storage/presigned.ts |
| 2 | Rename Download buttons to View across all document list components | f4e9259 | src/components/driver/document-list-readonly.tsx, src/components/documents/driver-document-list.tsx, src/components/documents/document-list.tsx |

## Decisions Made

- **Keep `generateDownloadUrl` function name** — Renaming it to `generateViewUrl` would require changes in ~6 call sites across server actions and API routes. The JSDoc was updated instead to reflect inline behavior, avoiding a noisy diff.
- **Keep `downloadAction` prop name in `DocumentListReadOnly`** — This is an API boundary prop name, not displayed UI text. Renaming it is unnecessary for this bug fix.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npx tsc --noEmit` passes with zero errors
- `ResponseContentDisposition: 'inline'` confirmed in `src/lib/storage/presigned.ts` line 69
- All three document list components use "View" / "Opening..." button text
- No `'Download'` button text remains in any of the three components

## Self-Check: PASSED

Files confirmed present:
- src/lib/storage/presigned.ts — FOUND
- src/components/driver/document-list-readonly.tsx — FOUND
- src/components/documents/driver-document-list.tsx — FOUND
- src/components/documents/document-list.tsx — FOUND

Commits confirmed:
- e8b00be — FOUND
- f4e9259 — FOUND
