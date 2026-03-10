---
phase: quick-49
plan: 49
type: execute
wave: 1
depends_on: []
files_modified:
  - prisma/schema.prisma
  - src/lib/validations/document.schemas.ts
  - src/app/(owner)/actions/documents.ts
  - src/components/documents/document-upload-modal.tsx
  - src/components/documents/document-list.tsx
  - src/app/(owner)/trucks/[id]/truck-documents-section.tsx
autonomous: true

must_haves:
  truths:
    - "After uploading a document the list refreshes and shows the new document without requiring a manual page reload"
    - "Upload modal opens via 'Upload Document' button and has fields for name, description, link, file, and expiry date"
    - "User can submit the modal with a link instead of a file, or with a file and no link"
    - "Uploaded documents with description/externalUrl display those fields in the list"
  artifacts:
    - path: "src/components/documents/document-upload-modal.tsx"
      provides: "Modal dialog for uploading documents with all required fields"
    - path: "prisma/schema.prisma"
      provides: "Document model with description and externalUrl fields"
  key_links:
    - from: "src/app/(owner)/trucks/[id]/truck-documents-section.tsx"
      to: "src/components/documents/document-upload-modal.tsx"
      via: "replaces inline DocumentUpload with modal trigger button"
    - from: "src/app/(owner)/actions/documents.ts"
      to: "prisma.document"
      via: "completeUpload passes description, externalUrl, expiryDate, documentName"
---

<objective>
Fix TKT-0007: two-part fix — state sync bug preventing uploaded documents from appearing, and UX redesign replacing the inline drop-zone with a modal dialog that collects richer metadata.

Purpose: Documents uploaded to trucks silently succeed but never appear in the list due to a stale useState. The upload UX also lacks metadata fields that are now needed (description, external link, expiry).
Output: Bug-free document upload with a modal UI and schema extended for description/externalUrl.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@src/app/(owner)/trucks/[id]/truck-documents-section.tsx
@src/components/documents/document-upload.tsx
@src/components/documents/document-list.tsx
@src/app/(owner)/actions/documents.ts
@src/lib/validations/document.schemas.ts
@prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extend Document schema and server action for new fields</name>
  <files>
    prisma/schema.prisma
    src/lib/validations/document.schemas.ts
    src/app/(owner)/actions/documents.ts
  </files>
  <action>
    1. In prisma/schema.prisma, add two fields to the Document model after the `notes` field:
       ```
       description  String?   @db.Text
       externalUrl  String?
       ```
       Also rename/keep `notes` as-is — do not remove it.

    2. Run migration: `npx prisma migrate dev --name add-document-description-external-url`

    3. In src/lib/validations/document.schemas.ts, add to documentCreateSchema's z.object():
       ```
       description: z.string().max(1000, 'Description cannot exceed 1000 characters').optional(),
       externalUrl: z.string().url('Must be a valid URL').optional(),
       documentName: z.string().min(1).max(255).optional(),
       ```
       Also relax the entity refine — when externalUrl is provided without a file, truckId/routeId/driverId still must be present but s3Key/contentType/sizeBytes can be empty strings. Add a new refine:
       ```
       .refine(
         (data) => data.s3Key || data.externalUrl,
         { message: 'Either a file or a link is required', path: ['s3Key'] }
       )
       ```
       Update the existing s3Key/contentType/sizeBytes fields to be optional when externalUrl is set — change them to:
       - `s3Key: z.string().optional().default('')`
       - `contentType: z.string().optional().default('')` (relax the refine to only validate when contentType is non-empty)
       - `sizeBytes: z.number().nonnegative().optional().default(0)`

    4. In src/app/(owner)/actions/documents.ts, update `completeUpload` to accept and pass through the new fields. Change the function signature to also accept:
       ```typescript
       description?: string;
       externalUrl?: string;
       expiryDate?: string; // ISO string
       documentName?: string;
       ```
       In the documentData object construction, add:
       ```typescript
       if (data.description) documentData.description = data.description;
       if (data.externalUrl) documentData.externalUrl = data.externalUrl;
       if (data.expiryDate) documentData.expiryDate = new Date(data.expiryDate);
       if (data.documentName) documentData.fileName = data.documentName;
       ```
       Note: when externalUrl is provided without a file, set s3Key to '', contentType to '', sizeBytes to 0 in documentData before passing to schema.
  </action>
  <verify>npx prisma migrate status — shows migration applied. npx tsc --noEmit — no type errors in action/schema files.</verify>
  <done>Document model has description and externalUrl columns. documentCreateSchema and completeUpload accept all new fields without TypeScript errors.</done>
</task>

<task type="auto">
  <name>Task 2: Build upload modal and fix state sync bug</name>
  <files>
    src/components/documents/document-upload-modal.tsx
    src/components/documents/document-list.tsx
    src/app/(owner)/trucks/[id]/truck-documents-section.tsx
  </files>
  <action>
    1. Create src/components/documents/document-upload-modal.tsx — a shadcn/ui Dialog-based modal:
       - Trigger: a Button labeled "Upload Document" (variant="default", with Upload icon from lucide-react)
       - Dialog content title: "Upload Document"
       - Form fields inside the dialog (using shadcn/ui Label + Input/Textarea where appropriate):
         a. Document Name (required text input) — placeholder "e.g. Insurance Certificate 2026"
         b. Description (optional Textarea, 3 rows) — placeholder "Optional notes about this document"
         c. External Link (optional Input type="url") — placeholder "https://..." — label "Online Link (optional)"
         d. File Upload (optional Input type="file", accept=".pdf,.jpg,.jpeg,.png") — below the link field, show helper text: "Required if no link provided. Max 10MB. PDF, JPEG, PNG."
         e. Expiry Date (optional Input type="date") — label "Expiry Date (optional)"
       - Validation before submit: document name required; either file or link must be provided; show inline error text (text-red-500 text-sm) if violated
       - Submit button: "Upload" — disabled and shows spinner while submitting
       - On submit:
         - If file provided: follow the existing requestUploadUrl → S3 PUT → completeUpload flow (same as current document-upload.tsx), passing description, externalUrl, expiryDate, documentName through completeUpload
         - If only link: call completeUpload directly with externalUrl, description, expiryDate, documentName, s3Key='', contentType='', sizeBytes=0, entityType, entityId
       - On success: close dialog (reset open state to false), call onUploadComplete()
       - On error: show error in a red Alert below the form (do not close modal)
       - Props interface: `{ entityType: 'truck' | 'route'; entityId: string; onUploadComplete: () => void }`

    2. In src/app/(owner)/trucks/[id]/truck-documents-section.tsx:
       - Add `useEffect` to sync state when initialDocuments changes (fixes the state sync bug):
         ```typescript
         useEffect(() => {
           setDocuments(initialDocuments);
         }, [initialDocuments]);
         ```
       - Replace `<DocumentUpload ... />` with `<DocumentUploadModal entityType="truck" entityId={truckId} onUploadComplete={handleRefresh} />`
       - Import DocumentUploadModal instead of DocumentUpload
       - Import useEffect from react (add to existing import)

    3. In src/components/documents/document-list.tsx:
       - Extend the Document interface to include optional fields:
         ```typescript
         description?: string;
         externalUrl?: string;
         expiryDate?: Date | null;
         notes?: string;
         ```
       - In each list item, below the file name/size/date row, conditionally render:
         - If doc.description: `<p className="mt-1 text-xs text-gray-500">{doc.description}</p>`
         - If doc.externalUrl: an anchor tag `<a href={doc.externalUrl} target="_blank" rel="noopener noreferrer" className="mt-1 text-xs text-blue-600 hover:underline">View online</a>`
         - If doc.expiryDate: `<span className="text-xs text-gray-500">Expires: {formatDate(doc.expiryDate)}</span>` (use existing formatDate but only show date not time for expiry)
       - For link-only documents (s3Key is empty string), hide the Download button and show only the "View online" link from externalUrl
  </action>
  <verify>
    1. Visit /trucks/[any-truck-id] — "Upload Document" button visible, clicking opens the modal
    2. Submit with no name → inline error shown, modal stays open
    3. Submit with name + file → modal closes, document appears in list without page reload
    4. Submit with name + link only → modal closes, document appears with "View online" link, no Download button
    5. npx tsc --noEmit — no type errors
  </verify>
  <done>
    Upload modal opens/closes correctly. State sync useEffect causes the document list to update after router.refresh() completes without requiring manual reload. Link-only documents display correctly without a Download button. Description and expiry date render in the list when present.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` — zero errors
2. `npx prisma migrate status` — all migrations applied
3. Manual smoke test: upload a file-based document → appears in list immediately after modal closes
4. Manual smoke test: upload a link-only document → appears in list with "View online" anchor, no Download button
5. Hard-refresh the truck page — documents persist (were saved to DB)
</verification>

<success_criteria>
- Document upload state sync bug resolved (useEffect syncs local state with initialDocuments after router.refresh())
- Modal replaces inline drop-zone; opens on button click, closes on success
- All five modal fields (name, description, link, file, expiry) functional
- Link-only documents saved with externalUrl, no s3Key required
- description and externalUrl visible in document list when present
- Zero TypeScript errors, migration applied cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/49-tkt-0007-truck-document-upload-not-savin/49-SUMMARY.md`
</output>
