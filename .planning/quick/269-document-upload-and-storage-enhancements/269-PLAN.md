---
phase: quick-269
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/schema.prisma
  - apps/web/prisma/migrations/*
  - apps/web/src/app/api/v1/carrier/document-types/route.ts
  - apps/web/src/lib/carrier/document-types.ts
  - apps/web/src/lib/carrier/documents.ts
  - apps/web/src/app/api/v1/carrier/documents/route.ts
  - apps/web/src/components/carrier/documents/DocumentUploadModal.tsx
  - apps/web/src/components/carrier/documents/DocumentList.tsx
  - apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx
  - apps/web/src/app/(owner)/carrier/templates/document-types/page.tsx
autonomous: true
must_haves:
  truths:
    - "Tenant can manage a catalog of document types (add, toggle active, view defaults)"
    - "Every document upload requires selecting a document type from the tenant catalog"
    - "Uploaded documents show type name, uploader name, and upload timestamp in all list views"
    - "Existing documents are migrated to an Unclassified default type without breaking"
    - "Context FKs (loadId, dispatchId, contractId) are auto-populated on upload"
  artifacts:
    - path: "apps/web/prisma/schema.prisma"
      provides: "CarrierDocumentType model + CarrierDocument FK additions"
      contains: "model CarrierDocumentType"
    - path: "apps/web/src/lib/carrier/document-types.ts"
      provides: "Document type CRUD + auto-seed logic"
    - path: "apps/web/src/app/api/v1/carrier/document-types/route.ts"
      provides: "GET/POST endpoints for document types"
    - path: "apps/web/src/components/carrier/documents/DocumentUploadModal.tsx"
      provides: "Document type dropdown fetched from API"
    - path: "apps/web/src/components/carrier/documents/DocumentList.tsx"
      provides: "Type name, uploader name, timestamp display"
  key_links:
    - from: "DocumentUploadModal.tsx"
      to: "/api/v1/carrier/document-types"
      via: "fetch on mount to populate dropdown"
    - from: "DocumentUploadModal.tsx"
      to: "/api/v1/carrier/documents"
      via: "POST with document_type_id in formData"
    - from: "documents.ts uploadDocument"
      to: "CarrierDocument.create"
      via: "documentTypeId + context FKs in data"
---

<objective>
Add per-tenant document type catalog, rich metadata FKs on CarrierDocument, and update all upload/list UIs to use the new type system.

Purpose: Replace hardcoded document type strings (bol/pod/rate_confirmation/other) with a tenant-managed catalog. Add context FK linkages (loadId, dispatchId, contractId) for better document traceability. Show richer info in document lists.

Output: New CarrierDocumentType model, CRUD API, settings page, updated upload modal with type picker, updated document lists with type name + uploader + timestamp.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/prisma/schema.prisma — CarrierDocument model at line 1655, CarrierLoad at 1561, CarrierStop at 1610
@apps/web/src/lib/carrier/documents.ts — uploadDocument, listDocuments, deleteDocument, verifyDocument
@apps/web/src/app/api/v1/carrier/documents/route.ts — POST/GET endpoints
@apps/web/src/app/api/v1/carrier/documents/[id]/route.ts — DELETE/PATCH endpoints
@apps/web/src/components/carrier/documents/DocumentUploadModal.tsx — Upload dialog with hardcoded type options
@apps/web/src/components/carrier/documents/DocumentList.tsx — Document list with hardcoded DOC_TYPE_BADGE/DOC_TYPE_LABELS
@apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx — Uses DocumentUploadModal at lines 402 and 430
</context>

<tasks>

<task type="auto">
  <name>Task 1: Schema migration — CarrierDocumentType model + CarrierDocument FK additions</name>
  <files>
    apps/web/prisma/schema.prisma
    apps/web/prisma/migrations/[timestamp]_add_carrier_document_type_catalog/migration.sql
  </files>
  <action>
1. Add `CarrierDocumentType` model to schema.prisma:
   ```
   model CarrierDocumentType {
     id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
     orgId     String   @map("org_id") @db.Uuid
     name      String
     slug      String                         // lowercase machine-friendly key, e.g. "bol", "pod"
     isDefault Boolean  @default(false) @map("is_default")
     isActive  Boolean  @default(true) @map("is_active")
     createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz

     tenant    Tenant            @relation(fields: [orgId], references: [id])
     documents CarrierDocument[]

     @@unique([orgId, slug])
     @@index([orgId])
     @@map("carrier_document_types")
   }
   ```

2. Add to `CarrierDocument` model (existing model at line 1655):
   - `documentTypeId String? @map("document_type_id") @db.Uuid` (nullable for migration safety — we will backfill)
   - `loadId String? @map("load_id") @db.Uuid`
   - `dispatchId String? @map("dispatch_id") @db.Uuid`
   - `contractId String? @map("contract_id") @db.Uuid`
   Add relations:
   - `documentTypeRef CarrierDocumentType? @relation(fields: [documentTypeId], references: [id])`
   - `load CarrierLoad? @relation(fields: [loadId], references: [id])`
   - `dispatch CarrierDispatch? @relation(fields: [dispatchId], references: [id])`
   - `contract CarrierContract? @relation(fields: [contractId], references: [id])`
   Add indexes: `@@index([documentTypeId])`, `@@index([loadId])`, `@@index([dispatchId])`, `@@index([contractId])`

3. Add the reverse `documents CarrierDocument[]` relations on CarrierLoad, CarrierDispatch, CarrierContract, and the `documentTypes CarrierDocumentType[]` relation on Tenant.

4. Run `npx prisma migrate dev --name add_carrier_document_type_catalog` from `apps/web/`.

5. The migration SQL should:
   - CREATE TABLE carrier_document_types
   - ALTER TABLE carrier_documents ADD COLUMN document_type_id, load_id, dispatch_id, contract_id (all nullable UUIDs)
   - Add FK constraints and indexes

Note: documentTypeId is nullable in the schema for now. Task 2 handles the auto-seed + backfill pattern at runtime. We do NOT add a sentinel row in the migration itself because orgId scoping means each tenant needs their own Unclassified row.
  </action>
  <verify>
    - `cd apps/web && npx prisma validate` exits 0
    - Migration file exists in prisma/migrations/
    - `cd apps/web && npx prisma generate` succeeds
    - Run `npx tsc --noEmit` from repo root — no type errors
  </verify>
  <done>
    CarrierDocumentType table exists in DB. CarrierDocument has document_type_id, load_id, dispatch_id, contract_id columns (all nullable). All FK constraints and indexes in place.
  </done>
</task>

<task type="auto">
  <name>Task 2: Document type CRUD API + auto-seed + settings page</name>
  <files>
    apps/web/src/lib/carrier/document-types.ts
    apps/web/src/app/api/v1/carrier/document-types/route.ts
    apps/web/src/app/api/v1/carrier/document-types/[id]/route.ts
    apps/web/src/app/(owner)/carrier/templates/document-types/page.tsx
  </files>
  <action>
1. Create `apps/web/src/lib/carrier/document-types.ts`:
   - `listDocumentTypes(orgId: string)` — fetch all types for org, ordered by isDefault DESC, name ASC. If count is 0, call `seedDefaultTypes(orgId)` first, then re-query.
   - `seedDefaultTypes(orgId: string)` — insert defaults in a transaction: Manifest, POD (slug: "pod"), BOL (slug: "bol"), Driver's License, Invoice, Rate Confirmation (slug: "rate_confirmation"), Blank Check, Insurance Certificate, Unclassified, Other (slug: "other"). All with `isDefault: true, isActive: true`.
   - `createDocumentType(orgId: string, name: string)` — create custom type with `isDefault: false`. Auto-generate slug from name (lowercase, spaces to hyphens, strip non-alphanumeric). Check unique constraint; if slug conflict, append "-2", "-3" etc.
   - `updateDocumentType(orgId: string, id: string, data: { name?: string; isActive?: boolean })` — update only non-default types for name changes. Any type can have isActive toggled.
   - `deleteDocumentType(orgId: string, id: string)` — only allowed if `isDefault === false` AND no documents reference it. Return error otherwise.

2. Create `apps/web/src/app/api/v1/carrier/document-types/route.ts`:
   - GET: calls `listDocumentTypes(orgId)`, returns `{ data: types[] }`. This triggers auto-seed on first call.
   - POST: body `{ name: string }`, calls `createDocumentType`, returns 201.
   Auth: `getSession()` check, orgId from `session.tenantId`.

3. Create `apps/web/src/app/api/v1/carrier/document-types/[id]/route.ts`:
   - PATCH: body `{ name?: string, isActive?: boolean }`, calls `updateDocumentType`.
   - DELETE: calls `deleteDocumentType`.

4. Create settings page at `apps/web/src/app/(owner)/carrier/templates/document-types/page.tsx`:
   - Fetch types from `/api/v1/carrier/document-types` on mount.
   - Display as a list/table with columns: Name, Default (badge), Active (toggle switch), Actions (edit name, delete if not default).
   - "Add Custom Type" button at top — inline form or small dialog with name input.
   - Toggle switch for isActive — calls PATCH immediately.
   - Delete button (only shown for non-default types with no documents) — confirm dialog, calls DELETE.
   - Use shadcn/ui components: Switch for toggle, Button, Dialog for add/edit, AlertDialog for delete confirm.
   - Style consistently with other carrier settings pages. Use Tailwind classes matching the existing carrier UI patterns.

Note: Place under `templates/document-types` since there is no `settings` directory — `templates` is the closest existing pattern for configuration-type pages in the carrier section.
  </action>
  <verify>
    - `curl http://localhost:3000/api/v1/carrier/document-types` (with auth cookie) returns seeded defaults on first call
    - POST a custom type, verify it appears in GET response
    - PATCH to toggle isActive, verify change persists
    - DELETE a custom type with no docs succeeds; DELETE a default type returns 400
    - Settings page renders at /owner/carrier/templates/document-types
    - `npx tsc --noEmit` passes
  </verify>
  <done>
    Document type catalog fully functional: auto-seeds on first access, CRUD API works, settings page lets owners manage custom types and toggle active status. Default types are protected from deletion.
  </done>
</task>

<task type="auto">
  <name>Task 3: Wire document type + context FKs into upload flow</name>
  <files>
    apps/web/src/components/carrier/documents/DocumentUploadModal.tsx
    apps/web/src/lib/carrier/documents.ts
    apps/web/src/app/api/v1/carrier/documents/route.ts
    apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx
  </files>
  <action>
1. Update `DocumentUploadModal.tsx`:
   - Remove hardcoded `DOCUMENT_TYPE_OPTIONS` array.
   - Add state for `documentTypes` array, fetched from `/api/v1/carrier/document-types?active_only=true` on dialog open (not on mount — lazy fetch).
   - Replace the static `<select>` with one populated from fetched types. Show type name as label, type id as value.
   - The `documentType` prop changes meaning: it can be a slug hint (e.g. "bol") to pre-select the matching type from the fetched list, but the actual value sent is the type's UUID id.
   - Add a new prop `documentTypeId?: string` for cases where the caller already knows the exact type id.
   - Validation: Upload button disabled if no documentTypeId selected (in addition to existing no-file check).
   - In `doUpload()`: append `document_type_id` to formData (the UUID). Keep sending `document_type` as the slug for backward compat during transition.
   - Add optional props: `loadId?: string`, `dispatchId?: string`, `contractId?: string`. Append these to formData if provided.

2. Update `StopTimelineCard.tsx` (lines 402, 430):
   - The existing `<DocumentUploadModal>` calls pass `documentType="bol"` and `documentType="pod"`. These become slug hints for pre-selection.
   - Also pass context FKs: the stop's `dispatchId` and `loadId` are available from the stop data. Thread `dispatchId` from the parent component. If stop has a `loadId`, pass it.

3. Update `apps/web/src/app/api/v1/carrier/documents/route.ts` POST handler:
   - Read `document_type_id` from formData.
   - Read optional `load_id`, `dispatch_id`, `contract_id` from formData.
   - Pass to `uploadDocument()`.

4. Update `apps/web/src/lib/carrier/documents.ts`:
   - Extend `DocumentUploadInput` interface: add `documentTypeId?: string`, `loadId?: string`, `dispatchId?: string`, `contractId?: string`.
   - In `uploadDocument()`:
     - If `documentTypeId` provided, verify it exists and belongs to the org (query CarrierDocumentType where id + orgId match). Return 400 if invalid.
     - Auto-derive context FKs from parentType/parentId when not explicitly provided:
       - parentType === 'stop': look up stop to get dispatchId and loadId from stop's dispatch/load relations.
       - parentType === 'load': set loadId = parentId. Look up load to get dispatchId and contractId.
       - parentType === 'dispatch': set dispatchId = parentId.
       - parentType === 'contract': set contractId = parentId.
     - Include `documentTypeId`, `loadId`, `dispatchId`, `contractId` in the `prisma.carrierDocument.create()` data.
   - In `listDocuments()`:
     - Add `include: { documentTypeRef: { select: { name: true } }, uploader: { select: { name: true } } }` to the findMany query.
     - Map results to include `documentTypeName`, `uploadedByName`, `uploadedAt` (use `createdAt`).
  </action>
  <verify>
    - Upload a document via the modal — document_type_id is sent and stored
    - Upload from StopTimelineCard — dispatchId and loadId auto-populated
    - GET documents returns documentTypeName and uploadedByName fields
    - Uploading without selecting a type is prevented (button disabled)
    - `npx tsc --noEmit` passes
  </verify>
  <done>
    All uploads require document type selection from tenant catalog. Context FKs (loadId, dispatchId, contractId) are auto-derived or explicitly passed. Upload API validates type ownership. List API returns enriched metadata.
  </done>
</task>

<task type="auto">
  <name>Task 4: Update document list UIs to show type + uploader + timestamp</name>
  <files>
    apps/web/src/components/carrier/documents/DocumentList.tsx
  </files>
  <action>
1. Update `DocumentList.tsx`:
   - The `DocumentItem` interface: add `documentTypeName: string | null`, `uploadedAt: string | null` (ISO string).
   - `uploadedByName` already exists in the interface — good.
   - Remove or deprecate the hardcoded `DOC_TYPE_BADGE` and `DOC_TYPE_LABELS` maps. Instead, display `doc.documentTypeName ?? doc.documentType` as the type badge label. Keep a generic badge color (e.g. blue for all types, or use a hash-to-color function for variety).
   - In each document row, add timestamp display:
     - After the uploader name line, show formatted date: `new Date(doc.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })`.
     - Format: "Apr 21, 2026, 3:45 PM" style.
   - Layout: Keep the existing row structure. The subtitle line under filename currently shows "fileSize . uploaderName". Extend to: "fileSize . uploaderName . Apr 21, 2026".
   - If `documentTypeName` is null (legacy docs), fall back to the old `documentType` string with the old label map as fallback.

2. Verify the list works with both old documents (no documentTypeId, using legacy documentType string) and new documents (with documentTypeId and documentTypeName from the include).
  </action>
  <verify>
    - Document list shows type name badge (from catalog, not hardcoded)
    - Uploader name displayed for each document
    - Upload timestamp displayed in human-readable format
    - Legacy documents without documentTypeId still render correctly with fallback
    - `npx tsc --noEmit` passes
  </verify>
  <done>
    All carrier document list views show document type name (from catalog), uploader name, and formatted upload timestamp. Legacy documents gracefully fall back to old type strings.
  </done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx prisma validate` — schema valid
2. `npx tsc --noEmit` — no TypeScript errors across the monorepo
3. Document type auto-seed triggers on first GET for a tenant
4. Upload modal shows tenant-specific document types, requires selection
5. StopTimelineCard uploads pre-select BOL/POD types and pass context FKs
6. Document lists show type name, uploader, timestamp for both new and legacy docs
7. Default types cannot be deleted; custom types can be managed
8. All queries are tenant-scoped (orgId)
</verification>

<success_criteria>
- CarrierDocumentType model exists with auto-seed of 10 default types per tenant
- CRUD API at /api/v1/carrier/document-types with tenant isolation
- Settings page at /owner/carrier/templates/document-types for managing types
- DocumentUploadModal fetches active types and requires selection before upload
- CarrierDocument records store documentTypeId + context FKs (loadId, dispatchId, contractId)
- DocumentList displays type name, uploader name, and formatted timestamp
- Legacy documents without documentTypeId render with fallback labels
- Zero TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/269-document-upload-and-storage-enhancements/269-SUMMARY.md`
</output>
