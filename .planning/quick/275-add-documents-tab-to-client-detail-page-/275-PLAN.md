---
phase: quick-275
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/api/v1/carrier/clients/[id]/documents/route.ts
  - apps/web/src/app/api/v1/carrier/contracts/[id]/documents/route.ts
  - apps/web/src/app/(owner)/carrier/clients/[id]/ClientDetail.tsx
  - apps/web/src/app/(owner)/carrier/contracts/[id]/ContractDetail.tsx
autonomous: true
must_haves:
  truths:
    - "Client detail page shows a Documents tab alongside Overview, Contracts, Loads, Financials"
    - "Documents tab lists all CarrierDocument records linked to that client via clientId"
    - "Contract detail page shows a Documents section at the bottom"
    - "Documents section lists all CarrierDocument records linked to that contract via contractId"
    - "View button generates a fresh signed URL and opens in new tab"
    - "Download button generates a fresh signed URL and triggers file download"
    - "Empty states show descriptive messages"
    - "All queries enforce tenant isolation via orgId on CarrierClient/CarrierContract"
  artifacts:
    - path: "apps/web/src/app/api/v1/carrier/clients/[id]/documents/route.ts"
      provides: "GET endpoint for client documents"
      exports: ["GET"]
    - path: "apps/web/src/app/api/v1/carrier/contracts/[id]/documents/route.ts"
      provides: "GET endpoint for contract documents"
      exports: ["GET"]
  key_links:
    - from: "ClientDetail.tsx"
      to: "/api/v1/carrier/clients/[id]/documents"
      via: "fetch in useEffect when documents tab active"
      pattern: "fetch.*carrier/clients.*documents"
    - from: "ContractDetail.tsx"
      to: "/api/v1/carrier/contracts/[id]/documents"
      via: "fetch on mount"
      pattern: "fetch.*carrier/contracts.*documents"
    - from: "ClientDetail.tsx / ContractDetail.tsx"
      to: "/api/v1/carrier/documents/[id]/signed-url"
      via: "fetch on View/Download button click"
      pattern: "signed-url"
---

<objective>
Add a Documents tab to the client detail page and a Documents section to the contract detail page, backed by two new API endpoints that query CarrierDocument by clientId/contractId with tenant isolation.

Purpose: Owners need visibility into all documents associated with a client or contract without navigating to individual loads/dispatches.
Output: Two new API routes + updated ClientDetail.tsx + updated ContractDetail.tsx
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/(owner)/carrier/clients/[id]/ClientDetail.tsx
@apps/web/src/app/(owner)/carrier/contracts/[id]/ContractDetail.tsx
@apps/web/src/app/api/v1/carrier/documents/[id]/signed-url/route.ts
@apps/web/src/app/api/v1/carrier/clients/[id]/route.ts
@apps/web/src/app/api/v1/carrier/contracts/[id]/route.ts
@apps/web/prisma/schema.prisma (CarrierDocument model at line 1659, CarrierClient at 1274, CarrierContract at 1315)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create client and contract document API endpoints</name>
  <files>
    apps/web/src/app/api/v1/carrier/clients/[id]/documents/route.ts
    apps/web/src/app/api/v1/carrier/contracts/[id]/documents/route.ts
  </files>
  <action>
Create two new GET endpoints following the existing pattern in `apps/web/src/app/api/v1/carrier/clients/[id]/route.ts`.

**GET /api/v1/carrier/clients/[id]/documents:**
1. Get session via `getSession()`, extract `tenantId` as orgId. Return 401/403 if missing.
2. Extract `id` from `await params`.
3. Verify the client belongs to the org: `prisma.carrierClient.findFirst({ where: { id, orgId } })`. Return 404 if not found.
4. Query documents: `prisma.carrierDocument.findMany({ where: { clientId: id }, orderBy: { createdAt: 'desc' }, include: { documentTypeRef: { select: { name: true } }, uploader: { select: { firstName: true, lastName: true } }, stop: { select: { id: true, stopName: true } }, load: { select: { id: true, referenceNumber: true } }, dispatch: { select: { id: true, dispatchNumber: true } } } })`
5. Map results to shape: `{ id, documentType, documentTypeName (from documentTypeRef.name), filename, fileSizeBytes, uploadedByName (firstName + lastName), uploadedAt (ISO string), verified, notes, stopId, stopName, loadId, loadReferenceNumber, dispatchId, dispatchNumber }`
6. Return `{ data: [...] }`

**GET /api/v1/carrier/contracts/[id]/documents:**
Same pattern but:
- Verify contract: `prisma.carrierContract.findFirst({ where: { id, orgId } })`. Return 404 if not found.
- Query: `prisma.carrierDocument.findMany({ where: { contractId: id }, ... })` with same includes and response shape.

Both endpoints use `@/lib/auth/supabase` for getSession, `@/lib/db/prisma` for prisma, and `@/lib/logger` for error logging. Do NOT generate signed URLs in the list response (they are generated on-demand per the signed-url endpoint).
  </action>
  <verify>
Run `npx tsc --noEmit` from apps/web to confirm no type errors. Manually confirm both route files export a GET function.
  </verify>
  <done>
Both endpoints return document arrays with tenant isolation. No signed URLs are pre-generated in the list response.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add Documents tab to ClientDetail and Documents section to ContractDetail</name>
  <files>
    apps/web/src/app/(owner)/carrier/clients/[id]/ClientDetail.tsx
    apps/web/src/app/(owner)/carrier/contracts/[id]/ContractDetail.tsx
  </files>
  <action>
**ClientDetail.tsx changes:**

1. Add `'documents'` to the `Tab` union type: `type Tab = 'overview' | 'contracts' | 'loads' | 'financials' | 'documents';`
2. Add to `TABS` array: `{ key: 'documents', label: 'Documents' }`
3. Add state: `documents` array, `documentsLoading` boolean, `documentsError` string|null.
4. Add useEffect: when `activeTab === 'documents'`, fetch `/api/v1/carrier/clients/${client.id}/documents`, parse response JSON, set documents from `json.data ?? []`. Handle errors gracefully.
5. Add imports at top: `FileText, Download, ExternalLink` from lucide-react.
6. Add a `DocumentRow` interface matching the API response shape (id, documentType, documentTypeName, filename, fileSizeBytes, uploadedByName, uploadedAt, stopName, loadReferenceNumber, dispatchNumber).
7. Create a helper function `formatRelativeDate(isoString: string): string` that returns relative time (e.g., "2 hours ago", "3 days ago", "Jan 15, 2026"). Use simple logic: <1h = "X min ago", <24h = "X hours ago", <7d = "X days ago", else formatted date.
8. Create an async helper `handleViewDocument(docId: string)` that fetches `/api/v1/carrier/documents/${docId}/signed-url`, extracts signedUrl, calls `window.open(signedUrl, '_blank')`. Show toast on error.
9. Create an async helper `handleDownloadDocument(docId: string, filename: string)` that fetches the same signed-url endpoint, creates a temporary `<a>` element with `href=signedUrl`, `download=filename`, `target='_blank'`, appends to body, clicks it, removes it. Show toast on error.
10. Add the Documents tab panel (render when `activeTab === 'documents'`):
    - Loading state: 3 skeleton pulse rows (same pattern as contracts tab)
    - Empty state: card with text "No documents uploaded for this client yet. Documents will appear here automatically when uploaded on loads and dispatches linked to this client."
    - Data state: responsive table with columns: Type (badge using documentTypeName or documentType), Filename, Linked To (show stop/load/dispatch name with prefix like "Stop: name" or "Load: #ref"), Uploaded By, Date (relative), Actions (View and Download icon buttons)
    - Table follows exact same styling as contracts table (rounded-lg border, bg-muted/50 header, divide-y body, hover:bg-muted/30)
    - View button: `ExternalLink` icon, onClick calls handleViewDocument
    - Download button: `Download` icon, onClick calls handleDownloadDocument

**ContractDetail.tsx changes:**

1. Add state: `documents` array, `documentsLoading` boolean.
2. Add useEffect: on mount (when NOT editing), fetch `/api/v1/carrier/contracts/${contract.id}/documents`, set documents. Always fetch (not lazy like tabs).
3. Import same lucide icons. Reuse same DocumentRow interface, formatRelativeDate, handleViewDocument, handleDownloadDocument helpers (duplicate in this file since they are small).
4. Add a new section at the bottom of the non-editing view (after "Loads Summary" section), inside the existing `<div className="space-y-6">`:
    - Section card with same styling pattern (rounded-lg border border-border bg-card p-6 space-y-4)
    - Header: "Documents" (same uppercase tracking-wider style as other section headers)
    - Empty state: "No documents uploaded under this contract yet."
    - Data state: same table layout as client documents tab
    - Same View/Download button behavior

For both files, do NOT pre-generate signed URLs in the list fetch. Generate fresh signed URLs only on View/Download button click via the existing `/api/v1/carrier/documents/[id]/signed-url` endpoint.
  </action>
  <verify>
Run `npx tsc --noEmit` from apps/web. Run `npm run build` from apps/web to confirm no build errors. Visually confirm the Documents tab appears on the client detail page and the Documents section appears at the bottom of the contract detail page.
  </verify>
  <done>
Client detail page has a Documents tab that lists all client-linked documents with View/Download actions. Contract detail page has a Documents section at the bottom with the same functionality. Signed URLs are generated fresh on each click. Empty states show descriptive messages. All queries are tenant-isolated.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with no errors from apps/web
2. GET /api/v1/carrier/clients/[id]/documents returns document array (or empty) with proper tenant check
3. GET /api/v1/carrier/contracts/[id]/documents returns document array (or empty) with proper tenant check
4. Client detail page shows Documents tab with correct content
5. Contract detail page shows Documents section at bottom
6. View button opens signed URL in new tab
7. Download button triggers file download
8. Empty states display correct messages
</verification>

<success_criteria>
- Two new API routes created and type-safe
- ClientDetail.tsx has 5 tabs: Overview, Contracts, Loads, Financials, Documents
- ContractDetail.tsx has Documents section after Loads Summary
- All document queries enforce tenant isolation via orgId on parent entity
- Signed URLs generated fresh on each View/Download click (never cached in list response)
- Empty states match specified copy exactly
</success_criteria>

<output>
After completion, create `.planning/quick/275-add-documents-tab-to-client-detail-page-/275-SUMMARY.md`
</output>
