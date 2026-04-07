---
phase: quick-194
plan: 01
subsystem: carrier/documents
tags: [bug-fix, storage, supabase, carrier]
dependency_graph:
  requires: []
  provides: [working-carrier-document-uploads]
  affects: [dispatch-detail-stop-timeline, document-upload-modal]
tech_stack:
  added: []
  patterns: [env-var-bucket-reference]
key_files:
  modified:
    - apps/web/src/lib/carrier/documents.ts
decisions:
  - Used S3_BUCKET env var instead of hardcoded bucket name, matching existing pattern in support-tickets.ts
metrics:
  duration: "< 5 minutes"
  completed: "2026-04-07"
  tasks_completed: 1
  files_changed: 1
---

# Quick Task 194: Fix Document Upload on Dispatch Detail Page Summary

One-line: Fixed "Storage upload failed" by swapping hardcoded `carrier-documents` bucket for `process.env.S3_BUCKET || 'driver-documents'`.

## What Was Done

The `BUCKET` constant in `apps/web/src/lib/carrier/documents.ts` was hardcoded to `'carrier-documents'`, a bucket that does not exist in Supabase Storage. The actual bucket used across the app is `driver-documents` (configured via `S3_BUCKET` env var). Changed line 9 to `process.env.S3_BUCKET || 'driver-documents'`, which fixes both the `uploadDocument` and `deleteDocument` functions since they both reference the shared `BUCKET` constant.

## Commits

| Task | Description | Hash |
|------|-------------|------|
| 1 | Fix Supabase Storage bucket name in carrier documents lib | 2095dd3 |

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- TypeScript check passed: `tsc --noEmit` clean
- Fix applies to both upload (line 59) and delete (line 170) operations via the shared constant
- BOL/POD upload indicators on the dispatch detail stop timeline will correctly reflect uploaded documents after the fix

## Self-Check: PASSED

- `apps/web/src/lib/carrier/documents.ts` — modified, confirmed `process.env.S3_BUCKET || 'driver-documents'`
- Commit `2095dd3` exists in git log
