---
phase: quick-271
plan: "01"
subsystem: carrier-documents
tags: [storage, r2, bug-fix, carrier]
dependency_graph:
  requires: ["@/lib/storage/s3-client"]
  provides: ["carrier document upload to R2", "carrier document delete from R2"]
  affects: ["apps/web/src/lib/carrier/documents.ts"]
tech_stack:
  added: []
  patterns: ["s3Client.send(PutObjectCommand)", "s3Client.send(DeleteObjectCommand)"]
key_files:
  modified:
    - apps/web/src/lib/carrier/documents.ts
decisions:
  - "Use getBucketName() from s3-client instead of hardcoded BUCKET constant — consistent with rest of app"
  - "Keep DB record deletion even if R2 delete fails — matches existing intent in original code"
metrics:
  duration: "~5 minutes"
  completed: "2026-04-22T02:52:40Z"
  tasks_completed: 1
  files_modified: 1
---

# Phase quick-271 Plan 01: Fix Carrier Document Upload to Use R2 Summary

**One-liner:** Replaced non-existent Supabase Storage bucket calls with Cloudflare R2 via `s3Client.send(PutObjectCommand/DeleteObjectCommand)` in carrier documents module.

## What Was Built

Carrier document upload and delete in `apps/web/src/lib/carrier/documents.ts` were calling Supabase Storage with a bucket that does not exist. The fix replaces both operations with the existing R2 pattern (`s3Client` + `@aws-sdk/client-s3` commands) already used by every other file upload in the app.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Replace Supabase Storage with R2 in carrier documents.ts | 29e49a8 | apps/web/src/lib/carrier/documents.ts |

## Changes Made

**`apps/web/src/lib/carrier/documents.ts`**
- Removed: `import { createAdminClient } from '@/lib/supabase/admin'`
- Removed: `const BUCKET = process.env.S3_BUCKET || 'driver-documents'`
- Added: `import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'`
- Added: `import { s3Client, getBucketName } from '@/lib/storage/s3-client'`
- `uploadDocument`: replaced `createAdminClient().storage.from(BUCKET).upload(...)` with `s3Client.send(new PutObjectCommand(...))`
- `deleteDocument`: replaced `createAdminClient().storage.from(BUCKET).remove(...)` with `s3Client.send(new DeleteObjectCommand(...))`
- Storage path format unchanged: `{orgId}/{parentType}/{parentId}/{documentType}/{uuid}.{ext}`
- All validation, org verification, and DB operations unchanged

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `tsc --noEmit`: passed with zero errors
- `grep -c "createAdminClient|supabase/admin"`: 0 (no Supabase Storage references remain)
- `grep -c "PutObjectCommand|DeleteObjectCommand|s3Client"`: 6 (R2 references present)

## Self-Check: PASSED

- [x] `apps/web/src/lib/carrier/documents.ts` modified correctly
- [x] Commit 29e49a8 exists and contains the change
- [x] Zero TypeScript errors
- [x] Zero Supabase Storage references in file
