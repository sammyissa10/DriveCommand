---
phase: quick
plan: 269
subsystem: carrier-documents
tags: [documents, document-types, upload, metadata, catalog, tenant-management]
dependency_graph:
  requires: [prisma-schema, carrier-ops-api-v1, supabase-storage]
  provides: [carrier-document-type-catalog, enriched-document-metadata]
  affects: [DocumentUploadModal, DocumentList, StopTimelineCard, documents-api, document-types-api]
tech_stack:
  added: []
  patterns: [auto-seed-on-first-access, context-FK-auto-derivation, tenant-scoped-catalog]
key_files:
  created:
    - apps/web/prisma/migrations/20260422000001_add_carrier_document_type_catalog/migration.sql
    - apps/web/src/lib/carrier/document-types.ts
    - apps/web/src/app/api/v1/carrier/document-types/route.ts
    - apps/web/src/app/api/v1/carrier/document-types/[id]/route.ts
    - apps/web/src/app/(owner)/carrier/templates/document-types/page.tsx
    - apps/web/src/components/carrier/documents/DocumentTypesManager.tsx
  modified:
    - apps/web/prisma/schema.prisma
    - apps/web/src/lib/carrier/documents.ts
    - apps/web/src/app/api/v1/carrier/documents/route.ts
    - apps/web/src/components/carrier/documents/DocumentUploadModal.tsx
    - apps/web/src/components/carrier/documents/DocumentList.tsx
    - apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx
decisions:
  - documentTypeId is nullable on CarrierDocument for migration safety — existing docs remain valid without backfill
  - Auto-seed 10 default types (BOL, POD, Manifest, Rate Confirmation, etc.) on first GET per tenant
  - Default types are protected from deletion and name-changes; isActive can still be toggled
  - Context FKs (loadId, dispatchId, contractId) auto-derived from parent chain in uploadDocument()
  - document_type (slug) is still sent in upload formData for backward compat during transition
  - listDocuments maps Prisma fields to UI-friendly shape (fileName, fileSize, uploadedByName)
metrics:
  duration_minutes: 45
  completed_date: 2026-04-22
  tasks_completed: 4
  files_changed: 12
---

# Quick Task 269: Document Upload and Storage Enhancements Summary

## One-liner

Per-tenant document type catalog with auto-seed (10 defaults), type-picker in upload modal, context FK linkage (load/dispatch/contract), and enriched document list showing type name, uploader, and timestamp.

## What was built

### Task 1: Schema migration

- Added `CarrierDocumentType` model: tenant-scoped catalog with `id`, `orgId`, `name`, `slug`, `isDefault`, `isActive`. Unique constraint on `(orgId, slug)`.
- Extended `CarrierDocument` with four new nullable columns: `document_type_id` (FK to catalog), `load_id`, `dispatch_id`, `contract_id`.
- Added reverse relations on `CarrierDispatch`, `CarrierLoad`, `CarrierContract`, and `Tenant`.
- Migration applied to Supabase DB: `20260422000001_add_carrier_document_type_catalog`.

### Task 2: Document type CRUD API + auto-seed + settings page

- `lib/carrier/document-types.ts`: `listDocumentTypes` (auto-seeds 10 defaults on first access per tenant), `createDocumentType` (slug auto-generation with uniqueness suffix), `updateDocumentType` (name rename blocked on defaults; any type can toggle isActive), `deleteDocumentType` (blocked on defaults and referenced types).
- `GET /api/v1/carrier/document-types` — returns active or all types, triggers auto-seed.
- `POST /api/v1/carrier/document-types` — create custom type.
- `PATCH /api/v1/carrier/document-types/[id]` — rename or toggle isActive.
- `DELETE /api/v1/carrier/document-types/[id]` — delete non-default, unreferenced types.
- `DocumentTypesManager` component: list with toggle switches, add/edit/delete dialogs.
- Settings page at `/owner/carrier/templates/document-types`.

### Task 3: Wire document type + context FKs into upload flow

- `DocumentUploadModal`: removed hardcoded type options; lazy-fetches active types from catalog on dialog open; pre-selects by slug hint (e.g. `documentType="bol"`) or explicit `documentTypeId` prop; upload button disabled until type selected.
- Context FKs (`loadId`, `dispatchId`, `contractId`) accepted as optional props and appended to formData.
- `StopTimelineCard`: passes `dispatchId` and `loadId` as new optional props to both `DocumentUploadModal` usages.
- `uploadDocument()`: validates `documentTypeId` ownership against org; auto-derives context FKs from parent chain (stop → gets dispatchId + loadId; load → gets dispatchId + contractId; dispatch/contract → sets self).
- Documents API POST: reads and passes `document_type_id`, `load_id`, `dispatch_id`, `contract_id` from formData.

### Task 4: Update document list UI

- `DocumentList`: added `documentTypeName` and `uploadedAt` fields to `DocumentItem`.
- Shows catalog type name with generic blue badge; falls back to legacy color-coded badges for old docs.
- Subtitle line extended: file size · uploader name · upload date (e.g. "Apr 21, 2026").
- `listDocuments()`: includes `documentTypeRef` and `uploader` (firstName + lastName) in Prisma query; maps to UI-friendly shape with `fileName`, `fileSize`, `uploadedByName`, `uploadedAt`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed field name mismatch between Prisma model and DocumentList**
- **Found during:** Task 4
- **Issue:** `DocumentList` used `doc.fileName` and `doc.fileSize` but Prisma returns `doc.filename` and `doc.fileSizeBytes`. The component was likely silently broken.
- **Fix:** `listDocuments()` now maps Prisma fields to UI-friendly names: `filename → fileName`, `fileSizeBytes → fileSize`.
- **Files modified:** `apps/web/src/lib/carrier/documents.ts`
- **Commit:** 5d61949

**2. [Rule 1 - Bug] Fixed User model select — no `name` field**
- **Found during:** Task 4 (TypeScript check)
- **Issue:** Plan called for `uploader: { select: { name: true } }` but User has `firstName` + `lastName`, not `name`.
- **Fix:** Select `{ firstName: true, lastName: true }` and join with a space filter.
- **Files modified:** `apps/web/src/lib/carrier/documents.ts`
- **Commit:** 5d61949

**3. [Rule 1 - Bug] Migration idempotency — partial first run**
- **Found during:** Task 1
- **Issue:** First migration attempt created the table before the FK constraint failed (wrong table name `tenants` instead of `"Tenant"`). The second run hit "relation already exists".
- **Fix:** Rewrote migration to use `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and `DO $$ ... IF NOT EXISTS` FK guards. Also corrected Tenant FK to `"Tenant"` (PascalCase, no @@map).
- **Files modified:** migration.sql
- **Commit:** 67c9677

## Self-Check: PASSED

All created files verified on disk. All task commits verified in git history.
