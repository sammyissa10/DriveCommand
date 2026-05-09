---
phase: quick-276
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/api/v1/carrier/documents/route.ts
  - apps/web/src/lib/carrier/documents.ts
  - apps/web/src/components/carrier/documents/DocumentUploadModal.tsx
  - apps/web/src/app/(owner)/carrier/clients/[id]/ClientDetail.tsx
  - apps/web/src/app/(owner)/carrier/contracts/[id]/ContractDetail.tsx
autonomous: true
must_haves:
  truths:
    - "Owner can upload a document directly to a client from the client detail Documents tab"
    - "Owner can upload a document directly to a contract from the contract detail Documents section"
    - "Uploaded documents appear in the list immediately without page reload"
    - "Tenant isolation is enforced on all client and contract document uploads"
  artifacts:
    - path: "apps/web/src/lib/carrier/documents.ts"
      provides: "client parent type handling in uploadDocument"
      contains: "parentType === 'client'"
    - path: "apps/web/src/app/(owner)/carrier/clients/[id]/ClientDetail.tsx"
      provides: "Upload Document button on Documents tab"
      contains: "DocumentUploadModal"
    - path: "apps/web/src/app/(owner)/carrier/contracts/[id]/ContractDetail.tsx"
      provides: "Upload Document button on Documents section"
      contains: "DocumentUploadModal"
  key_links:
    - from: "ClientDetail.tsx"
      to: "DocumentUploadModal"
      via: "parentType='client', parentId=client.id"
      pattern: "parentType.*client"
    - from: "ContractDetail.tsx"
      to: "DocumentUploadModal"
      via: "parentType='contract', parentId=contract.id, contractId=contract.id, clientId via prop"
      pattern: "parentType.*contract"
---

<objective>
Add document upload buttons to the client detail Documents tab and contract detail Documents section, using the existing DocumentUploadModal component. Also add 'client' as a valid parent type in the upload pipeline.

Purpose: Users currently can only view documents associated with clients/contracts but cannot upload directly from those pages. This adds that capability.
Output: Upload buttons on both pages, backend support for client parent type.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/carrier/documents.ts
@apps/web/src/components/carrier/documents/DocumentUploadModal.tsx
@apps/web/src/app/(owner)/carrier/clients/[id]/ClientDetail.tsx
@apps/web/src/app/(owner)/carrier/contracts/[id]/ContractDetail.tsx
@apps/web/src/app/api/v1/carrier/documents/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add 'client' parent type support to upload pipeline and DocumentUploadModal</name>
  <files>
    apps/web/src/app/api/v1/carrier/documents/route.ts
    apps/web/src/lib/carrier/documents.ts
    apps/web/src/components/carrier/documents/DocumentUploadModal.tsx
  </files>
  <action>
    Three changes needed in the upload pipeline:

    1. **`apps/web/src/app/api/v1/carrier/documents/route.ts`** (line 30): Add `'client'` to the `validParentTypes` array so the POST endpoint accepts `parent_type=client`. Change:
       `const validParentTypes = ['stop', 'load', 'dispatch', 'contract', 'expense'] as const;`
       to:
       `const validParentTypes = ['stop', 'load', 'dispatch', 'contract', 'client', 'expense'] as const;`

    2. **`apps/web/src/lib/carrier/documents.ts`** `uploadDocument` function: Add a `client` parent type branch between the existing `contract` and `expense` branches (after line 130). The new branch should:
       - Query `prisma.carrierClient.findFirst({ where: { id: parentId, orgId } })` for tenant isolation
       - Set `orgVerified = !!client`
       - Set `clientId = parentId` (the client IS the parent)
       
       Also in `listDocuments` (line 206), add `client` and `contract` branches so that generic listing works:
       - For `client`: verify via `prisma.carrierClient.findFirst({ where: { id: parentId, orgId } })`, set `orgVerified = !!client`
       - For `contract`: verify via `prisma.carrierContract.findFirst({ where: { id: parentId, orgId } })`, set `orgVerified = !!contract`
       
       Similarly in `deleteDocument` and `verifyDocument`, add `client` and `contract` branches for org verification (same pattern as above).

    3. **`apps/web/src/components/carrier/documents/DocumentUploadModal.tsx`** (line 26): Add `'client'` to the `parentType` union type:
       `parentType: 'stop' | 'load' | 'dispatch' | 'contract' | 'client';`
  </action>
  <verify>Run `npx tsc --noEmit` from `apps/web` to confirm no type errors. Grep for `'client'` in documents.ts to confirm the new branch exists.</verify>
  <done>The upload API accepts parent_type=client, uploadDocument correctly sets clientId=parentId for client uploads with tenant isolation, listDocuments/deleteDocument/verifyDocument all handle client and contract parent types, and DocumentUploadModal accepts 'client' as a parentType prop.</done>
</task>

<task type="auto">
  <name>Task 2: Add upload buttons to ClientDetail and ContractDetail</name>
  <files>
    apps/web/src/app/(owner)/carrier/clients/[id]/ClientDetail.tsx
    apps/web/src/app/(owner)/carrier/contracts/[id]/ContractDetail.tsx
  </files>
  <action>
    **ClientDetail.tsx:**
    1. Import `DocumentUploadModal` from `@/components/carrier/documents/DocumentUploadModal`.
    2. Import `Plus` from `lucide-react` (for the button icon).
    3. In the Documents tab section (around line 639-641), add a header row between the `{activeTab === 'documents' && (` and the loading check. The header should have:
       - A flex container with `justify-between items-center` and `mb-4`
       - Left side: nothing (or a subtle "Documents" label if desired, but the tab already says Documents so skip it)
       - Right side: `<DocumentUploadModal parentType="client" parentId={client.id} onSuccess={refreshDocuments} triggerLabel="+ Upload Document" />` 
       
       BUT the DocumentUploadModal's trigger is a small underlined link by default. Instead, wrap it differently: use the DocumentUploadModal as a Dialog with a proper Button as trigger. Looking at the modal, it uses `DialogTrigger asChild` with a button element. The `triggerLabel` prop controls the text. So just pass `triggerLabel="+ Upload Document"`.
       
       Actually, the trigger renders as a small underlined link (`text-xs text-primary underline`). For a more prominent button in the header, we should render the DocumentUploadModal but override the trigger appearance. The simplest approach: the modal accepts `triggerLabel` and renders it in a small link-styled button. This is fine for consistency with how other upload buttons work in the app. Place it in a `<div className="flex justify-end mb-4">` wrapper before the loading/content section.
    
    4. Create a `refreshDocuments` function that re-fetches documents: set `setDocumentsLoading(true)`, fetch from `/api/v1/carrier/clients/${client.id}/documents`, parse JSON, `setDocuments(json.data ?? [])`, handle errors, `setDocumentsLoading(false)`. This replaces the useEffect-based fetch (or can coexist -- simplest is to extract the fetch logic into a named function and call it from both useEffect and onSuccess).

    **ContractDetail.tsx:**
    1. Import `DocumentUploadModal` from `@/components/carrier/documents/DocumentUploadModal`.
    2. In the Documents section (around line 409-412), add the upload button in the header row. Change the `<h3>` Documents header to a flex container:
       ```
       <div className="flex items-center justify-between">
         <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Documents</h3>
         <DocumentUploadModal
           parentType="contract"
           parentId={contract.id}
           contractId={contract.id}
           onSuccess={refreshDocuments}
           triggerLabel="+ Upload Document"
         />
       </div>
       ```
    3. Create a `refreshDocuments` function similar to ClientDetail: fetch from `/api/v1/carrier/contracts/${contract.id}/documents`, update state. Extract from the existing useEffect fetch logic.
  </action>
  <verify>Run `npx tsc --noEmit` from `apps/web`. Visually verify by running `npm run dev` and navigating to a client detail page > Documents tab (should see "+ Upload Document" link), and a contract detail page > Documents section (should see "+ Upload Document" link).</verify>
  <done>Client detail Documents tab shows an "+ Upload Document" button that opens DocumentUploadModal with parentType='client'. Contract detail Documents section shows an "+ Upload Document" button that opens DocumentUploadModal with parentType='contract' and contractId set. Both refresh the document list on successful upload without page reload.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes in apps/web with no type errors
2. Client detail > Documents tab shows upload button, clicking opens modal, uploading a file creates a CarrierDocument with parentType='client' and clientId=client.id
3. Contract detail > Documents section shows upload button, clicking opens modal, uploading a file creates a CarrierDocument with parentType='contract', contractId=contract.id, and clientId derived from contract
4. After upload, document list refreshes automatically showing the new document
5. Tenant isolation verified: uploadDocument checks orgId ownership for client parent type
</verification>

<success_criteria>
- Upload buttons visible on both client detail Documents tab and contract detail Documents section
- Uploads create correctly-linked CarrierDocument records with proper parent type and FK linkage
- Document lists refresh after upload without full page reload
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/276-add-document-upload-capability-to-client/276-SUMMARY.md`
</output>
