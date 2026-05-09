---
phase: quick-273
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/api/v1/carrier/documents/[id]/signed-url/route.ts
  - apps/web/src/components/carrier/dispatches/StopDocumentList.tsx
  - apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx
autonomous: true
must_haves:
  truths:
    - "Each stop card on dispatch detail shows uploaded documents below the upload button"
    - "Each document row shows type badge, filename, uploader name, relative upload time, and View/Delete buttons"
    - "View button opens a fresh signed URL in a new tab without navigating away"
    - "Delete button (owner only) shows confirmation dialog, then removes the document"
    - "Document list refreshes after a new upload without full page reload"
  artifacts:
    - path: "apps/web/src/app/api/v1/carrier/documents/[id]/signed-url/route.ts"
      provides: "GET endpoint returning fresh 1-hour signed URL for a document"
      exports: ["GET"]
    - path: "apps/web/src/components/carrier/dispatches/StopDocumentList.tsx"
      provides: "Client component that fetches and displays documents for a stop"
      min_lines: 80
  key_links:
    - from: "StopDocumentList.tsx"
      to: "GET /api/v1/carrier/documents?parent_type=stop&parent_id=X"
      via: "fetch on mount + after upload callback"
      pattern: "fetch.*api/v1/carrier/documents"
    - from: "StopDocumentList.tsx View button"
      to: "GET /api/v1/carrier/documents/[id]/signed-url"
      via: "fetch on click then window.open"
      pattern: "signed-url"
    - from: "StopDocumentList.tsx Delete button"
      to: "DELETE /api/v1/carrier/documents/[id]"
      via: "fetch after confirmation"
      pattern: "DELETE.*documents"
---

<objective>
Add a document list with View and Delete actions to each stop card on the dispatch detail page.

Purpose: After uploading BOL/POD documents on a stop, users currently have no way to view or manage them. This adds a document list with View (opens signed URL in new tab) and Delete (owner-only with confirmation) actions.

Output: New signed-url API endpoint, new StopDocumentList component, updated StopTimelineCard to render it.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx
@apps/web/src/lib/carrier/documents.ts
@apps/web/src/app/api/v1/carrier/documents/[id]/route.ts
@apps/web/src/app/api/v1/carrier/documents/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create signed-url API endpoint</name>
  <files>apps/web/src/app/api/v1/carrier/documents/[id]/signed-url/route.ts</files>
  <action>
Create GET handler at `apps/web/src/app/api/v1/carrier/documents/[id]/signed-url/route.ts`:

1. Import `getSession` from `@/lib/auth/supabase`, `prisma` from `@/lib/db/prisma`, `createAdminClient` from `@/lib/supabase/admin`, `logger` from `@/lib/logger`.
2. Validate session and orgId (same pattern as existing `[id]/route.ts`).
3. Fetch `CarrierDocument` by `id` using `prisma.carrierDocument.findFirst({ where: { id } })`.
4. If not found, return 404.
5. Verify tenant isolation: check parent chain ownership exactly like `deleteDocument` in `lib/carrier/documents.ts` — if `doc.parentType === 'stop'`, verify via `carrierStop.findFirst({ where: { id: doc.parentId, dispatch: { orgId } } })`. Same pattern for 'load' (check `orgId` on load), 'dispatch' (check `orgId` on dispatch). If not verified, return 403.
6. Call `createAdminClient().storage.from('drivecommand-files').createSignedUrl(doc.fileUrl, 3600)` (1 hour expiry).
7. If signed URL generation fails, log error and return 500.
8. Return `{ signedUrl }` as JSON 200.
  </action>
  <verify>Run `npx tsc --noEmit` from `apps/web` — no type errors in the new file.</verify>
  <done>GET /api/v1/carrier/documents/[id]/signed-url returns a fresh 1-hour signed URL with tenant isolation.</done>
</task>

<task type="auto">
  <name>Task 2: Create StopDocumentList component and wire into StopTimelineCard</name>
  <files>apps/web/src/components/carrier/dispatches/StopDocumentList.tsx, apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx</files>
  <action>
**StopDocumentList.tsx** — New client component:

Props: `{ stopId: string; userRole: string; refreshKey?: number }` where refreshKey is incremented after uploads to trigger re-fetch.

1. State: `documents` array, `loading` boolean, `deletingId` string | null.
2. `useEffect` on `[stopId, refreshKey]`: fetch `GET /api/v1/carrier/documents?parent_type=stop&parent_id=${stopId}`. Parse response as `{ data: DocItem[] }` where DocItem has: `id, documentType, documentTypeName, fileName, fileSize, uploadedByName, uploadedAt, url, verified`.
3. Render: If loading, show a small skeleton (single line shimmer). If no documents, render nothing (return null — do not show empty state to keep card clean).
4. For each document, render a compact row inside a `div` with `space-y-1.5`:
   - Left side: Document type badge (use uppercase `documentType` like "BOL", "POD" — small colored badge similar to existing stop type badges), truncated filename (text-sm), uploader name (text-xs muted), relative time using a simple helper: "Xm ago", "Xh ago", "Xd ago" (compute from `uploadedAt`).
   - Right side: "View" button (Eye icon + text, text-xs) and "Delete" button (Trash2 icon, text-xs, only visible if `isOwnerOrManager` — check `userRole` same way as StopTimelineCard does).
5. **View handler**: On click, fetch `GET /api/v1/carrier/documents/${doc.id}/signed-url`, parse `{ signedUrl }`, call `window.open(signedUrl, '_blank')`. Show toast on error. Disable button while fetching (use local loading state per doc).
6. **Delete handler**: Show `window.confirm('Delete this document? This cannot be undone.')`. If confirmed, `DELETE /api/v1/carrier/documents/${doc.id}`. On success, remove from local state and call `onDeleted?.()` callback (optional prop). Show toast on success/error.
7. Import icons from lucide-react: `Eye`, `Trash2`, `FileText`.

**StopTimelineCard.tsx** — Modifications:

1. Import `StopDocumentList` from `./StopDocumentList`.
2. Add state: `const [docRefreshKey, setDocRefreshKey] = useState(0)`.
3. In the existing `DocumentUploadModal` `onSuccess` callbacks (lines ~412 and ~443), add `setDocRefreshKey(k => k + 1)` alongside the existing `router.refresh()`.
4. Inside the document compliance section (`isPickupOrDelivery` block, after the existing BOL/POD upload rows), add:
   ```
   <StopDocumentList stopId={stop.id} userRole={userRole} refreshKey={docRefreshKey} />
   ```
   This renders below the upload buttons, inside the same border-t section.
5. Pass `userRole` prop — it is already available as a prop on StopTimelineCard.

Use shadcn Button component for View/Delete with variant="ghost" size="sm" and small icon sizing (h-3.5 w-3.5). Follow existing dark mode patterns (dark: prefixed classes).
  </action>
  <verify>
1. `npx tsc --noEmit` from `apps/web` — no type errors.
2. `npm run build` from `apps/web` — builds without errors.
3. Visually: Navigate to a dispatch detail page with stops that have uploaded documents. Confirm document list appears below upload buttons. Click View — new tab opens with the document. Click Delete (as owner) — confirmation dialog appears, document removed on confirm.
  </verify>
  <done>
- Stop cards on dispatch detail show uploaded documents with type badge, filename, uploader, relative time
- View button opens fresh signed URL in new tab
- Delete button (owner/manager only) removes document after confirmation
- Document list auto-refreshes after new upload
  </done>
</task>

</tasks>

<verification>
1. TypeScript compiles: `cd apps/web && npx tsc --noEmit`
2. Build succeeds: `cd apps/web && npm run build`
3. Signed URL endpoint returns valid URL: `curl` or browser test against `/api/v1/carrier/documents/[id]/signed-url`
4. Document list renders on stop cards with uploaded documents
5. View opens document in new tab
6. Delete works with confirmation (owner only)
7. Upload + list refresh works without page reload
</verification>

<success_criteria>
- GET /api/v1/carrier/documents/[id]/signed-url endpoint exists with tenant isolation
- StopTimelineCard shows document list below upload buttons
- Each document shows type badge, filename, uploader name, relative upload time
- View button fetches fresh signed URL and opens in new tab
- Delete button is owner/manager-only with confirmation dialog
- Document list refreshes after upload without full page reload
</success_criteria>

<output>
After completion, create `.planning/quick/273-add-view-download-button-to-uploaded-doc/273-SUMMARY.md`
</output>
