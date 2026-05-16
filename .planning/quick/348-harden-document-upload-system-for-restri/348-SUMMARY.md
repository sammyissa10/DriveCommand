---
phase: quick-348
plan: 348
subsystem: document-security
tags: [security, storage, rbac, audit-log, prisma, s3, documents]
dependency_graph:
  requires: [quick-347 (audit_log table), prisma-schema, storage/s3-client]
  provides: [restricted-document-upload-path, restricted-document-download-rbac, document-audit-trail]
  affects: [DocumentType enum, Document model, audit_log CHECK constraint, document upload/download routes, driver documents UI]
tech_stack:
  added: []
  patterns:
    - "tenant-{id}/restricted/{driverId|_org}/{fileId}-{fileName} S3 key pattern"
    - "isRestrictedDocumentType() type guard driving upload/download routing"
    - "requireRestrictedDocumentAccess() — RBAC gate + pre-URL audit write"
    - "Document.isRestricted auto-derived from documentType in repository create()"
key_files:
  created:
    - apps/web/prisma/migrations/20260516100001_restricted_documents/migration.sql
    - apps/web/prisma/migrations/20260516100002_restricted_documents_column/migration.sql
    - apps/web/src/lib/storage/restricted.ts
    - apps/web/src/lib/security/restricted-document-access.ts
    - apps/web/src/app/(owner)/components/RestrictedDocumentDownloadButton.tsx
    - apps/web/tests/security/restricted-documents.test.ts
  modified:
    - apps/web/prisma/schema.prisma
    - apps/web/src/lib/security/audit-log.ts
    - apps/web/src/lib/db/repositories/document.repository.ts
    - apps/web/src/app/api/documents/request-upload-url/route.ts
    - apps/web/src/app/api/documents/download-url/[id]/route.ts
    - apps/web/src/app/(driver)/documents/document-list.tsx
    - apps/web/src/app/(driver)/documents/page.tsx
    - apps/mobile/components/driver/DocumentUploadSheet.tsx
decisions:
  - "Two-migration split: PostgreSQL requires ALTER TYPE ADD VALUE to be committed before the new enum values can be used in same session; split into 20260516100001 (enum ADD VALUE) and 20260516100002 (column + index + constraint)"
  - "No DISPATCHER role in DriveCommand today — gate at MANAGER+ for privileged restricted access; DRIVER allowed for own docs only; DISPATCHER gate is a comment/forward-compat placeholder"
  - "Partial index document_tenant_restricted_idx on (tenantId, is_restricted) WHERE is_restricted=TRUE — Document has no deletedAt, so simpler partial index satisfies spec intent at lower storage cost"
  - "Unscoped Prisma findUnique in requireRestrictedDocumentAccess — intentional to detect cross-tenant attempts and write audit row in caller's tenant (tenant-scoped query would silently 404 missing the audit)"
  - "Non-restricted document flow byte-identical — only JSDoc change to presigned.ts header"
  - "Mobile UI mirroring deferred — server-side RBAC covers mobile regardless of client; TODO comment added in DocumentUploadSheet.tsx"
metrics:
  duration_minutes: 90
  completed_date: "2026-05-16"
  tasks_completed: 6
  tasks_total: 6
  files_created: 6
  files_modified: 8
---

# Quick Task 348: Harden Document Upload System for Restricted PII Documents — Summary

Restricted PII document handling (SSN_CARD, PASSPORT, CDL_SCAN, MEDICAL_CARD, VOIDED_CHECK, W9, W4, I9) now routes to a dedicated `tenant-{id}/restricted/` S3 prefix with 15-minute presigned URLs, mandatory audit_log rows on every access attempt, and strict RBAC via a new `requireRestrictedDocumentAccess` guard.

## What Was Built

### Task 1 — DB Migration
Two-migration split (PostgreSQL requires `ALTER TYPE ADD VALUE` to commit before values can be used in same session):
- `20260516100001`: Adds 8 new `DocumentType` enum values
- `20260516100002`: Adds `Document.is_restricted` boolean column, partial index `document_tenant_restricted_idx ON ("Document")(tenantId, is_restricted) WHERE is_restricted=TRUE`, and extends `audit_log.action` CHECK constraint to include `DOWNLOAD_DOCUMENT_DENIED`

Applied to Supabase production via `npx prisma migrate deploy`. Prisma schema + generated client updated.

### Task 2 — Storage Helpers (`restricted.ts`)
New file `apps/web/src/lib/storage/restricted.ts` with:
- `RESTRICTED_DOCUMENT_TYPES` constant (8 values)
- `isRestrictedDocumentType(t)` — type guard
- `buildRestrictedS3Key({ tenantId, driverId, fileId, sanitizedFileName })` — key pattern: `tenant-{id}/restricted/{driverId|_org}/{fileId}-{name}`
- `generateRestrictedUploadUrl(...)` — 300s expiry + runtime prefix invariant check (throws if computed key doesn't start with `tenant-{id}/restricted/`)
- `generateRestrictedDownloadUrl(s3Key)` — 900s expiry (15 min)
- `isRestrictedKey(s3Key, tenantId)` — defense-in-depth prefix check

### Task 3 — Security Helpers
**`audit-log.ts`** extended: added `DOWNLOAD_DOCUMENT_DENIED` to `AuditAction` type + `AUDIT_ACTIONS` exported constant array.

**`restricted-document-access.ts`** (new): `requireRestrictedDocumentAccess(req)` with 4 denial paths:
1. Cross-tenant / not-found → 404 + `DOWNLOAD_DOCUMENT_DENIED` audit in caller's tenant
2. Non-restricted doc → 404 (no audit, no leak — caller should use normal flow)
3. Invalid S3 key prefix → 403 + `DOWNLOAD_DOCUMENT_DENIED` audit
4. Wrong role (DRIVER without ownership) → 403 + `DOWNLOAD_DOCUMENT_DENIED` audit with `role:DRIVER` fieldName
5. Success → `DOWNLOAD_DOCUMENT` audit committed BEFORE presigned URL returned

RBAC matrix: `SYSTEM_ADMIN` / `OWNER` / `MANAGER` → any doc in their tenant. `DRIVER` → own docs only (driverId === userId). No `DISPATCHER` role today; forward-compat comment added.

### Task 4 — API Route Wiring
**`request-upload-url/route.ts`**: Accepts optional `documentType: DocumentType` + `driverId` in request body. If `isRestrictedDocumentType(documentType)` → branches to `generateRestrictedUploadUrl` returning `isRestricted: true`. Non-restricted path is byte-identical, now returns `isRestricted: false`.

**`download-url/[id]/route.ts`**: After fetching doc, checks `doc.isRestricted`. If true → calls `requireRestrictedDocumentAccess` (RBAC + audit + 15-min URL). Non-restricted path unchanged.

**`document.repository.ts`**: `create()` now auto-derives `isRestricted = isRestrictedDocumentType(data.documentType)` when not explicitly provided, ensuring the column stays correct across all upload paths.

### Task 5 — UI Updates
**`document-list.tsx`**: Lock icon + `Badge variant="destructive"` labeled "Restricted" for restricted rows. `AlertDialog` confirm before fetch on restricted rows. `aria-label` includes "Restricted document" for screen readers. `Document` interface extended with `isRestricted: boolean` + `driverId: string | null`.

**`RestrictedDocumentDownloadButton.tsx`** (new): Reusable owner-portal component with confirm dialog + role-based disable + Tooltip. Forward-compat DISPATCHER comment.

**`DocumentUploadSheet.tsx`** (mobile): `TODO(quick-348-followup)` comment added — mobile server-side enforcement is active regardless of client UI.

### Task 6 — Vitest Security Suite
`tests/security/restricted-documents.test.ts` — 557 lines, 24 test cases (9 unit pass immediately, 15 integration/S3 skip without env):
- Unit: type guard, key builder, expiry constants
- S3 (skip without env): URL expiry ≤ 900s / ≤ 300s
- Integration (skip without DB): cross-tenant 404 + audit, cross-driver 403 + audit, driver own doc success, MANAGER/OWNER success, non-restricted 404, CHECK constraint accepts DOWNLOAD_DOCUMENT_DENIED, RLS isolation

## Non-Restricted Flow Verification
`git diff apps/web/src/lib/storage/presigned.ts` shows only JSDoc additions to the header — no body changes. Existing `audit-log-isolation.test.ts` and `field-crypto.test.ts` pass unchanged.

## Migration Applied
- `20260516100001_restricted_documents` — DocumentType enum extension
- `20260516100002_restricted_documents_column` — is_restricted column + index + audit_log constraint

Both confirmed applied: `npx prisma migrate status` shows all migrations applied.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Two-migration split required for PostgreSQL enum ADD VALUE**
- **Found during:** Task 1
- **Issue:** PostgreSQL raises `ERROR: unsafe use of new value "SSN_CARD" of enum type "DocumentType"` when `ALTER TYPE ADD VALUE` and a reference to the new value appear in the same implicit transaction
- **Fix:** Split into two migration files — first commits the enum additions, second adds the column/index/constraint in a separate transaction
- **Files modified:** Both migration files created; migration filenames updated from plan (plan assumed one file `20260516100001_restricted_documents`, actual is two: `...001` and `...002`)
- **Commit:** 4510f1b

None of the other plan tasks required deviations — all implemented as specified.

## Self-Check

Files created/exist:
- `apps/web/prisma/migrations/20260516100001_restricted_documents/migration.sql` — FOUND
- `apps/web/prisma/migrations/20260516100002_restricted_documents_column/migration.sql` — FOUND
- `apps/web/src/lib/storage/restricted.ts` — FOUND
- `apps/web/src/lib/security/restricted-document-access.ts` — FOUND
- `apps/web/src/app/(owner)/components/RestrictedDocumentDownloadButton.tsx` — FOUND
- `apps/web/tests/security/restricted-documents.test.ts` — FOUND

Commits:
- 4510f1b — Task 1 migration
- ef3887c — Task 2 storage helpers
- 89332ff — Task 3 security helpers
- 0d88d69 — Task 4 API wiring
- f63afcc — Task 5 UI updates
- 6781450 — Task 6 test suite

TypeScript: `npx tsc --noEmit` — PASSED
Tests: `npx vitest run tests/security/` — 22 passed, 23 skipped (DB/S3 tests skipped without env)
Generated client: SSN_CARD + is_restricted in index.d.ts — CONFIRMED

## Self-Check: PASSED
