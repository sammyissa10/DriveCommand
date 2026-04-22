---
phase: quick-272
plan: "01"
subsystem: carrier-documents
tags: [storage, supabase, r2-migration, carrier]
dependency_graph:
  requires: []
  provides: [carrier-document-supabase-storage]
  affects: [apps/web/src/lib/carrier/documents.ts]
tech_stack:
  added: []
  patterns: [supabase-admin-storage, signed-urls]
key_files:
  modified:
    - apps/web/src/lib/carrier/documents.ts
decisions:
  - "Reuse createAdminClient from @/lib/supabase/admin — no new client utility"
  - "Generate 1-hour signed URLs in listDocuments instead of returning raw storage paths"
  - "Delete continues even if Supabase Storage remove fails — DB record still cleaned up"
metrics:
  duration: "5 minutes"
  completed: "2026-04-21"
  tasks_completed: 1
  files_modified: 1
---

# Phase quick-272 Plan 01: Fix Carrier Document Upload to Use Supabase Storage Summary

Carrier document operations now use Supabase Storage bucket `drivecommand-files` via service-role admin client instead of Cloudflare R2.

## What Was Built

Single file change to `apps/web/src/lib/carrier/documents.ts`:

- **uploadDocument** — replaced `PutObjectCommand` + `s3Client.send()` with `supabaseAdmin.storage.from(BUCKET).upload()`
- **listDocuments** — replaced raw `fileUrl` passthrough with `createSignedUrl(path, 3600)` to generate 1-hour expiring URLs
- **deleteDocument** — replaced `DeleteObjectCommand` + `s3Client.send()` with `supabaseAdmin.storage.from(BUCKET).remove([path])`
- Removed imports: `PutObjectCommand`, `DeleteObjectCommand` from `@aws-sdk/client-s3`; `s3Client`, `getBucketName` from `@/lib/storage/s3-client`
- Added import: `createAdminClient` from `@/lib/supabase/admin`
- Added constant: `const BUCKET = 'drivecommand-files'`

## Verification

- `grep` for R2 identifiers (`s3Client`, `PutObjectCommand`, `DeleteObjectCommand`, `getBucketName`) returns no matches
- `grep` for Supabase identifiers (`createAdminClient`, `drivecommand-files`, `createSignedUrl`) returns matches at lines 3, 9, 114, 201, 211, 265
- `npx tsc --noEmit` passes with no errors

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Hash | Message |
|------|---------|
| 39e9e25 | fix(quick-272): replace R2 with Supabase Storage in carrier documents |

## Self-Check: PASSED

- `apps/web/src/lib/carrier/documents.ts` — modified and committed
- Commit `39e9e25` — verified in git log
- No R2 references remain
- Supabase Storage references present at all three operation points
