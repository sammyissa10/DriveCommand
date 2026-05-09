---
phase: quick-277
plan: 01
subsystem: carrier-ops / auth
tags: [carrier-documents, check-constraint, migration, auth-caching, ui-consistency]
dependency_graph:
  requires: [carrier_documents table, DocumentUploadModal component, /api/auth/me route]
  provides: [constraint-free carrier_documents, primary-styled upload trigger, cached auth endpoint]
  affects: [carrier client/contract detail pages, all web pages calling /api/auth/me]
tech_stack:
  added: []
  patterns: [module-level Map cache with TTL, Supabase User type import]
key_files:
  created:
    - apps/web/prisma/migrations/20260422100001_drop_carrier_documents_type_check/migration.sql
  modified:
    - apps/web/src/components/carrier/documents/DocumentUploadModal.tsx
    - apps/web/src/app/api/auth/me/route.ts
decisions:
  - Cache key is the full cookie header string — partitions naturally per user session
  - Null sessions are cached to prevent retry loops for unauthenticated requests
  - Mobile Bearer token path is excluded from caching (different rate limit profile)
  - CHECK constraint dropped at DB level; validation moved to application layer via CarrierDocumentType catalog
metrics:
  duration: "~2 minutes"
  completed: "2026-04-22"
  tasks_completed: 2
  files_modified: 3
---

# Phase quick-277 Plan 01: Fix Carrier Documents CHECK Constraint, Upload Button Style, Auth Caching Summary

One-liner: Dropped carrier_documents_document_type_check DB constraint, restyled upload trigger to primary button with icon, and added 5-minute Map-based session cache to /api/auth/me to prevent Supabase Auth 429 rate limits.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Drop CHECK constraint and restyle upload button | 7c97cca | migration.sql, DocumentUploadModal.tsx |
| 2 | Add session caching to /api/auth/me to prevent 429 | 3ab0735 | route.ts |

## What Was Built

### Task 1: CHECK Constraint Removal + Button Restyle

**Migration** (`20260422100001_drop_carrier_documents_type_check/migration.sql`): Single `ALTER TABLE carrier_documents DROP CONSTRAINT carrier_documents_document_type_check` statement. The original constraint hardcoded 9 document type slugs (`bol`, `pod`, `rate_confirmation`, etc.) but the CarrierDocumentType catalog (added in a prior migration) supports arbitrary catalog-managed types. The constraint blocked any upload using a catalog-defined slug not in the hardcoded list.

**DocumentUploadModal trigger button**: Changed from `text-xs text-primary underline hover:text-primary/80` (inline text link) to `inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90` (solid primary action button). Added `<Upload className="h-4 w-4" />` icon before the label. `Upload` was already imported from lucide-react.

### Task 2: Auth Session Caching

**`/api/auth/me`**: Added module-level `sessionCache: Map<string, { user: User | null; expiry: number }>` with 5-minute TTL. On each web (cookie-based) request:
1. Extracts cache key from `cookie` header
2. Returns cached user if hit and not expired
3. On miss: calls `supabase.auth.getUser()`, stores result (including `null` for unauthenticated)
4. Prunes expired entries when map exceeds 100 entries

Mobile Bearer token path is not touched.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript type error on sessionCache Map value type**
- **Found during:** Task 2 (tsc --noEmit verification)
- **Issue:** Initial attempt used a complex `typeof` conditional type for the `user` variable which resolved to `never`; second attempt used `(typeof cachedSession)['user']` which TS couldn't resolve when `cachedSession` could be `undefined`
- **Fix:** Imported Supabase's `User` type directly (`import type { User } from '@supabase/supabase-js'`) and typed the Map as `Map<string, { user: User | null; expiry: number }>` and the local variable as `User | null | undefined`
- **Files modified:** `apps/web/src/app/api/auth/me/route.ts`
- **Commit:** 3ab0735

## Self-Check: PASSED

- migration.sql: FOUND
- DocumentUploadModal.tsx: FOUND
- route.ts: FOUND
- Commit 7c97cca: FOUND
- Commit 3ab0735: FOUND
- `npx prisma migrate deploy`: succeeded — migration applied to Supabase
- `npx tsc --noEmit`: zero errors
