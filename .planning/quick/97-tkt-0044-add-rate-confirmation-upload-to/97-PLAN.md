---
phase: quick-97
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - prisma/schema.prisma
  - src/lib/validations/document.schemas.ts
  - src/lib/db/repositories/document.repository.ts
  - src/app/(owner)/actions/load-documents.ts
  - src/components/loads/load-rc-documents-section.tsx
  - src/app/(owner)/loads/[id]/page.tsx
autonomous: true

must_haves:
  truths:
    - "Owner can upload a rate confirmation PDF/image on the load detail page"
    - "Uploaded RC appears in a documents list on the load detail page"
    - "Owner can view/download an uploaded RC document"
    - "Owner can delete an uploaded RC document"
    - "Generate RC button still works alongside uploaded RCs"
  artifacts:
    - path: "prisma/schema.prisma"
      provides: "loadId field on Document model, RATE_CONFIRMATION in DocumentType enum"
      contains: "loadId"
    - path: "src/app/(owner)/actions/load-documents.ts"
      provides: "Server actions for load document upload/list/delete"
      exports: ["uploadLoadDocument", "listLoadDocuments", "deleteLoadDocument"]
    - path: "src/components/loads/load-rc-documents-section.tsx"
      provides: "Client component with upload form and document list for load RCs"
    - path: "src/app/(owner)/loads/[id]/page.tsx"
      provides: "Load detail page rendering the RC documents section"
  key_links:
    - from: "src/components/loads/load-rc-documents-section.tsx"
      to: "src/app/(owner)/actions/load-documents.ts"
      via: "server action calls for upload/list/delete"
      pattern: "uploadLoadDocument|listLoadDocuments|deleteLoadDocument"
    - from: "src/app/(owner)/loads/[id]/page.tsx"
      to: "src/components/loads/load-rc-documents-section.tsx"
      via: "component import and render"
      pattern: "LoadRCDocumentsSection"
---

<objective>
Add rate confirmation upload functionality to the /loads/[id] detail page (TKT-0044).

Purpose: Owner-operators receive rate confirmations externally from brokers and need to upload them alongside the existing "Generate RC" feature. This lets them keep all RC documents — both generated and received — in one place per load.

Output: Schema migration adding loadId to Document + RATE_CONFIRMATION to DocumentType, server actions for load document CRUD, and a client component on the load detail page for uploading/viewing/deleting RC documents.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@prisma/schema.prisma (Document model at line ~309, DocumentType enum at line ~71, Load model at line ~859)
@src/app/(owner)/actions/driver-documents.ts (uploadDriverDocument pattern to follow — server-side S3 PutObjectCommand)
@src/lib/validations/document.schemas.ts (documentCreateSchema — needs loadId added)
@src/lib/db/repositories/document.repository.ts (DocumentRepository — needs findByLoadId and loadId in create input)
@src/components/documents/driver-document-upload.tsx (UI pattern reference for upload form)
@src/app/(owner)/drivers/[id]/driver-documents-section.tsx (section wrapper pattern)
@src/app/(owner)/loads/[id]/page.tsx (load detail page to modify)
@src/components/loads/download-rate-confirmation-button.tsx (existing Generate RC button — keep as-is)
@src/app/(owner)/actions/documents.ts (getDownloadUrl action — reuse for viewing uploaded docs)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Schema migration — add loadId to Document model and RATE_CONFIRMATION to DocumentType</name>
  <files>
    prisma/schema.prisma
    src/lib/validations/document.schemas.ts
    src/lib/db/repositories/document.repository.ts
  </files>
  <action>
  1. In `prisma/schema.prisma`:
     - Add `RATE_CONFIRMATION` to the `DocumentType` enum (after GENERAL)
     - Add `loadId String? @db.Uuid` field to the `Document` model (after `driverId`)
     - Add `load Load? @relation(fields: [loadId], references: [id])` relation to Document
     - Add `@@index([loadId])` to Document
     - Add `documents Document[]` relation field to the `Load` model (alongside `invoices Invoice[]`)
     - Run `npx prisma db push` to apply (this project uses db push, not migrations)

  2. In `src/lib/validations/document.schemas.ts`:
     - Add `'RATE_CONFIRMATION'` to the `documentTypeEnum` z.enum array
     - Add `loadId: z.string().uuid('Invalid load ID').optional()` to the documentCreateSchema object
     - Update the entity count refinement to include `data.loadId` in the filter array: `[data.truckId, data.routeId, data.driverId, data.loadId]`
     - The "exactly one entity" rule stays — a load doc has only loadId set
     - Remove or relax the "driverId requires documentType" refinement so it does NOT require documentType when loadId is set (documentType is optional for load docs since we hardcode RATE_CONFIRMATION in the server action)

  3. In `src/lib/db/repositories/document.repository.ts`:
     - Add `loadId?: string` to `DocumentCreateInput` interface
     - Add `findByLoadId(loadId: string)` method following the same pattern as `findByDriverId` — findMany where loadId, orderBy createdAt desc, include uploader select
  </action>
  <verify>
    Run `npx prisma db push` succeeds without errors. Run `npx tsc --noEmit` to confirm no type errors in modified files.
  </verify>
  <done>
    Document model has loadId field with index. DocumentType enum includes RATE_CONFIRMATION. Validation schema accepts loadId as a valid entity association. Repository has findByLoadId method.
  </done>
</task>

<task type="auto">
  <name>Task 2: Server actions for load document upload, list, and delete</name>
  <files>
    src/app/(owner)/actions/load-documents.ts
  </files>
  <action>
  Create `src/app/(owner)/actions/load-documents.ts` with three server actions, following the `uploadDriverDocument` pattern from `driver-documents.ts`:

  **`uploadLoadDocument(formData: FormData)`**
  - Mark `'use server'` at top of file
  - `requireRole([UserRole.OWNER, UserRole.MANAGER])` auth check first
  - Extract from formData: `file` (File), `loadId` (string), `notes` (optional string)
  - Validate file size against MAX_FILE_SIZE
  - Read first 4100 bytes, validate with `validateFileType(buffer, file.type)`
  - Get tenantId via `requireTenantId()`, get user via `getCurrentUser()`
  - Generate fileId with `nanoid()`
  - Build s3Key: `tenant-${tenantId}/loads/${fileId}-${sanitizedFileName}`
  - Upload to R2 server-side using `s3Client.send(new PutObjectCommand(...))` — same as driver-documents.ts pattern, NO presigned URL
  - Build document data with `loadId`, `documentType: 'RATE_CONFIRMATION'`, fileName, s3Key, contentType, sizeBytes
  - Validate with `documentCreateSchema.safeParse()`
  - Create via `DocumentRepository.create()` with tenantId and uploadedBy
  - `revalidatePath(/loads/${loadId})`
  - Return `{ success: true, document }` or `{ error: string }`

  **`listLoadDocuments(loadId: string)`**
  - `requireRole([UserRole.OWNER, UserRole.MANAGER])`
  - Get tenantId, use `DocumentRepository.findByLoadId(loadId)`
  - Return documents array

  **`deleteLoadDocument(documentId: string)`**
  - `requireRole([UserRole.OWNER, UserRole.MANAGER])`
  - Get tenantId, find doc via `repo.findById(documentId)`
  - Verify s3Key starts with `tenant-${tenantId}/loads/` (defense-in-depth)
  - Delete from S3 via `deleteS3Object(doc.s3Key)`
  - Delete from DB via `repo.delete(documentId)`
  - Revalidate path if doc.loadId exists
  - Return `{ success: true }` or `{ error: string }`

  Import the same utilities as driver-documents.ts: `requireRole`, `getCurrentUser`, `requireTenantId`, `DocumentRepository`, `validateFileType`, `MAX_FILE_SIZE`, `deleteS3Object`, `nanoid`, `revalidatePath`, `PutObjectCommand`, `s3Client`, `getBucketName`, `documentCreateSchema`.
  </action>
  <verify>
    `npx tsc --noEmit` passes with no errors in the new file. All three exported functions exist.
  </verify>
  <done>
    Three server actions (uploadLoadDocument, listLoadDocuments, deleteLoadDocument) exist and compile cleanly, following the same server-side S3 upload pattern as driver-documents.ts.
  </done>
</task>

<task type="auto">
  <name>Task 3: RC documents section component and integration into load detail page</name>
  <files>
    src/components/loads/load-rc-documents-section.tsx
    src/app/(owner)/loads/[id]/page.tsx
  </files>
  <action>
  **Create `src/components/loads/load-rc-documents-section.tsx`** — a client component combining upload and document list:

  Structure: Follow the `driver-documents-section.tsx` pattern — manage documents state, refresh after mutations.

  Props: `loadId: string`, `initialDocuments: LoadDocument[]` where LoadDocument has: id, fileName, contentType, sizeBytes, documentType, notes, createdAt.

  **Upload UI:**
  - A collapsible upload area (button toggles open/close) labeled "Upload Rate Confirmation"
  - Use the Upload icon from lucide-react
  - File input accepting `.pdf,.jpg,.jpeg,.png` (same as driver upload)
  - Optional notes textarea
  - Submit button that creates FormData with file, loadId, notes and calls `uploadLoadDocument`
  - Show loading spinner during upload
  - On success: reset form, call refreshDocuments
  - On error: show error message

  **Document list UI:**
  - If no documents: show subtle "No uploaded rate confirmations" message
  - Each document as a compact card (rounded border, p-3) showing:
    - Row 1: File icon + fileName (truncated) + file size formatted (KB/MB)
    - Row 2: Upload date + action buttons (View, Delete)
  - View button: calls `getDownloadUrl(docId)` from `@/app/(owner)/actions/documents` and opens in new tab (same pattern as driver-document-list.tsx handleView)
  - Delete button: calls `deleteLoadDocument(docId)`, uses optimistic UI to remove from list immediately, then refreshDocuments
  - Mobile-friendly: stack nicely on small screens, touch-friendly button sizes (min 44px tap targets)

  **Integrate into `src/app/(owner)/loads/[id]/page.tsx`:**
  - Import `LoadRCDocumentsSection` from the new component
  - Import `DocumentRepository` and `requireTenantId` (already have getTenantPrisma but need repo for docs)
  - After fetching linkedInvoices (around line 86), fetch load documents:
    ```
    const tenantId = await requireTenantId();
    const docRepo = new DocumentRepository(tenantId);
    const loadDocuments = await docRepo.findByLoadId(id);
    ```
  - Add a new section AFTER the existing action buttons area and BEFORE the info grid (or after the Invoices section — place it between the info grid and the Invoices section for logical grouping). Actually, place it right after the Invoices section and before the Audit Trail, as a "Rate Confirmations" card section.
  - The section heading: "Rate Confirmations" with FileText icon
  - Show both the existing DownloadRateConfirmationButton ("Generate RC") and the new upload section together. Keep the Generate RC button in the header action bar where it already is. The new section is purely for uploaded RCs.
  - Render: `<LoadRCDocumentsSection loadId={id} initialDocuments={loadDocuments} />`
  - The section should only appear for loads in statuses that make sense: DISPATCHED, PICKED_UP, IN_TRANSIT, DELIVERED, INVOICED (basically not PENDING or CANCELLED — same logic area where Generate RC shows, but also include INVOICED since you might upload an RC after invoicing)

  Style notes:
  - Match existing card styling: `rounded-lg border border-border bg-card p-5`
  - Use same text sizes and color patterns as the rest of the page
  - Upload button style: match the existing action button styles (border, bg-card, hover:bg-accent)
  </action>
  <verify>
    Run `npx tsc --noEmit` — no type errors. Run `npm run build` to confirm page compiles. Manually verify by visiting /loads/[id] that the RC section appears for dispatched+ loads, upload works, documents list renders, view and delete function correctly.
  </verify>
  <done>
    Load detail page shows a "Rate Confirmations" section for dispatched+ loads. Users can upload PDF/image RC files which are stored in S3 and listed with view/delete actions. The existing "Generate RC" button in the header remains unchanged.
  </done>
</task>

</tasks>

<verification>
1. `npx prisma db push` applies cleanly — Document model has loadId field, DocumentType has RATE_CONFIRMATION
2. `npx tsc --noEmit` passes with zero errors
3. `npm run build` succeeds
4. Navigate to /loads/[id] for a dispatched load — "Rate Confirmations" section visible
5. Upload a PDF — file appears in the list, stored in S3 under tenant-{id}/loads/
6. Click View on uploaded doc — opens in new tab
7. Click Delete on uploaded doc — removed from list and S3
8. "Generate RC" button in header still works independently
9. Section does NOT appear for PENDING or CANCELLED loads
</verification>

<success_criteria>
- Owner can upload rate confirmation documents (PDF, JPG, PNG) on any load detail page for dispatched+ loads
- Uploaded documents are stored in S3 with proper tenant isolation (tenant-{id}/loads/ prefix)
- Documents are associated with the load via loadId in the Document model
- Upload, view, and delete all function correctly
- Existing "Generate RC" feature is unaffected
- Mobile-friendly layout with proper touch targets
</success_criteria>

<output>
After completion, create `.planning/quick/97-tkt-0044-add-rate-confirmation-upload-to/97-SUMMARY.md`
</output>
