---
phase: quick-270
plan: 01
subsystem: carrier-documents
tags: [logging, bug-fix, error-serialization]
dependency_graph:
  requires: []
  provides: [proper-storage-error-logging]
  affects: [apps/web/src/lib/carrier/documents.ts, apps/web/src/app/api/v1/carrier/documents/route.ts]
tech_stack:
  added: []
  patterns: [logger.error(message, error, context)]
key_files:
  modified:
    - apps/web/src/lib/carrier/documents.ts
    - apps/web/src/app/api/v1/carrier/documents/route.ts
decisions:
  - "Pass error object as 2nd arg to logger.error, not wrapped in a plain object"
metrics:
  duration: "< 5 minutes"
  completed: "2026-04-21"
  tasks: 1
  files: 2
---

# Quick 270: Fix Document Upload Error Logging Summary

Fixed incorrect logger.error() call signatures in the carrier documents module that were swallowing real Supabase StorageError details.

## What Was Fixed

Storage upload failures were logging `[object Object]` instead of the actual Supabase error message and statusCode. The root cause was passing error objects wrapped in a plain object `{ err: uploadError }` as the second argument to `logger.error()`, instead of passing the error directly.

The logger.error signature is `(message: string, error?: unknown, context?: Record<string, unknown>)`. When a plain object is passed as the error arg, the logger calls `new Error(String(object))` which produces `[object Object]`.

**4 fixes applied:**

1. `uploadDocument` (line 120): `{ orgId, storagePath, err: uploadError }` → `uploadError, { orgId, storagePath }`
2. `deleteDocument` (line 264): `{ orgId, docId, err: storageError }` → `storageError, { orgId, docId }`
3. Route POST catch: added `{ userId: session?.userId }` context
4. Route GET catch: added `{ userId: session?.userId }` context

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- `apps/web/src/lib/carrier/documents.ts` — modified, exists
- `apps/web/src/app/api/v1/carrier/documents/route.ts` — modified, exists
- Commit `2ddda98` — exists
- No instances of `err: uploadError` or `err: storageError` remain in documents.ts
- TypeScript check passed with zero errors
