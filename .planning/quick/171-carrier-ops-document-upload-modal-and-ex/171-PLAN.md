---
phase: quick-171
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/carrier/documents/DocumentUploadModal.tsx
  - apps/web/src/components/carrier/documents/DocumentList.tsx
  - apps/web/src/components/carrier/expenses/ExpenseForm.tsx
  - apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx
autonomous: true
must_haves:
  truths:
    - "User can upload a document (PDF/JPG/PNG/HEIC/WEBP, max 25MB) via drag-and-drop or file picker with real percentage progress"
    - "User sees existing documents for a stop/load/dispatch with view, delete, and verify actions"
    - "User can log an expense linked to a dispatch or load with validation"
    - "StopTimelineCard upload buttons are wired — pickup opens BOL upload, delivery opens POD upload"
  artifacts:
    - path: "apps/web/src/components/carrier/documents/DocumentUploadModal.tsx"
      provides: "Modal with file drop zone, type select, notes, XHR upload with progress"
    - path: "apps/web/src/components/carrier/documents/DocumentList.tsx"
      provides: "Compact document list with view/delete/verify actions"
    - path: "apps/web/src/components/carrier/expenses/ExpenseForm.tsx"
      provides: "Expense form with type, amount, paid_by, driver select, reimbursable toggle"
    - path: "apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx"
      provides: "Wired upload buttons replacing disabled stubs"
  key_links:
    - from: "DocumentUploadModal.tsx"
      to: "/api/v1/carrier/documents"
      via: "XMLHttpRequest POST with FormData"
      pattern: "XMLHttpRequest.*api/v1/carrier/documents"
    - from: "DocumentList.tsx"
      to: "/api/v1/carrier/documents"
      via: "fetch GET with query params"
      pattern: "fetch.*api/v1/carrier/documents"
    - from: "ExpenseForm.tsx"
      to: "/api/v1/carrier/expenses"
      via: "fetch POST"
      pattern: "fetch.*api/v1/carrier/expenses"
    - from: "StopTimelineCard.tsx"
      to: "DocumentUploadModal.tsx"
      via: "import and render with stopType-based documentType"
      pattern: "DocumentUploadModal"
---

<objective>
Create the DocumentUploadModal, DocumentList, and ExpenseForm components for the Carrier Ops module, then wire the upload modal into the existing StopTimelineCard.

Purpose: These are core operational components — drivers/dispatchers need to upload BOL/POD documents at stops, view existing documents, and log trip expenses.
Output: Three new components + StopTimelineCard wired with real upload functionality.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx
@apps/web/src/components/ui/dialog.tsx
@apps/web/src/components/ui/button.tsx
@apps/web/src/components/ui/alert-dialog.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create DocumentUploadModal and DocumentList components</name>
  <files>
    apps/web/src/components/carrier/documents/DocumentUploadModal.tsx
    apps/web/src/components/carrier/documents/DocumentList.tsx
  </files>
  <action>
Create directory `apps/web/src/components/carrier/documents/`.

**DocumentUploadModal.tsx** — 'use client' component:

Props interface:
```
parentType: 'stop' | 'load' | 'dispatch' | 'contract'
parentId: string
stopId?: string
documentType: 'bol' | 'pod' | 'rate_confirmation' | 'other'
onSuccess: () => void
```

Implementation:
- Use shadcn Dialog (from `@/components/ui/dialog`) controlled by internal `open` state. Expose a trigger button (or accept `trigger` as render prop / children).
- File drop zone: a div with `onDragOver`/`onDrop` handlers + a hidden `<input type="file">` triggered on click. Accept: `.pdf,.jpg,.jpeg,.png,.heic,.webp`. Show dashed border area with upload icon and "Drag file here or click to browse" text.
- On file selection: validate file size <= 25MB (25 * 1024 * 1024 bytes). If exceeded, set error state: "File exceeds 25MB limit" in red text. Do NOT proceed with upload.
- After valid file selected: show file name + formatted size (KB if <1MB, MB otherwise) in a preview row.
- `document_type` select pre-filled from prop but editable. Options: bol, pod, rate_confirmation, other. Use a native `<select>` styled with Tailwind (consistent with other carrier forms).
- `notes` textarea, optional.
- Upload button: uses `XMLHttpRequest` (NOT fetch) to POST to `/api/v1/carrier/documents`. Build `FormData` with fields: `file`, `parent_type`, `parent_id`, `stop_id` (if provided), `document_type`, `notes`. Track `xhr.upload.onprogress` to show percentage in the button text (e.g., "Uploading... 67%"). On `xhr.onload` with status 2xx: call `onSuccess()`, close dialog, toast success. On error: show error message with a "Retry" button that re-sends the same request.
- While uploading, disable the upload button and file input.

**DocumentList.tsx** — 'use client' component:

Props interface:
```
parentType: 'stop' | 'load' | 'dispatch' | 'contract'
parentId: string
```

Implementation:
- On mount, fetch `GET /api/v1/carrier/documents?parent_type={parentType}&parent_id={parentId}`. Store in state. Show loading skeleton (2-3 rows of h-4 bg-muted animate-pulse).
- Render compact list (no table — just stacked rows with flex layout). Each row shows:
  - Document type badge (small colored pill, similar to stop type badges in StopTimelineCard)
  - Filename (truncated with `truncate` class if long)
  - File size formatted (KB/MB)
  - Uploaded by name (text-muted-foreground)
  - Green checkmark icon if `verified === true`
  - Action buttons row: "View" (opens presigned URL from response in new tab via `window.open`), "Delete" (shows confirm AlertDialog, then calls `DELETE /api/v1/carrier/documents/{id}`), "Verify" (calls `PATCH /api/v1/carrier/documents/{id}/verify`).
  - Delete and Verify buttons only visible when `userRole` context indicates dispatcher/owner (accept `userRole` as optional prop, default to showing all actions — the API enforces permissions server-side).
- After delete or verify: re-fetch the list.
- Empty state: "No documents uploaded" with muted text.
  </action>
  <verify>
Run `npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | head -30` to confirm no type errors in the new files. Visually inspect that both files exist and export their components.
  </verify>
  <done>
DocumentUploadModal renders a dialog with file drop zone, 25MB validation, XHR upload with progress percentage, and error/retry. DocumentList fetches and renders documents with view/delete/verify actions.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create ExpenseForm and wire DocumentUploadModal into StopTimelineCard</name>
  <files>
    apps/web/src/components/carrier/expenses/ExpenseForm.tsx
    apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx
  </files>
  <action>
Create directory `apps/web/src/components/carrier/expenses/`.

**ExpenseForm.tsx** — 'use client' component:

Props interface:
```
dispatchId?: string
loadId?: string
stopId?: string
onSuccess: () => void
```

Implementation:
- Form with the following fields:
  - `expense_type` select: fuel, toll, repair, driver_cash, lumper, detention, parking, other (required)
  - `amount` number input with step="0.01" (required, must be > 0)
  - `paid_by` select: driver_cash, company_card, owner_advance (required)
  - `driver_id` select: fetch active carrier drivers from `GET /api/v1/carrier/drivers?status=active` on mount. Show driver name in options. Required field.
  - `notes` textarea (optional)
  - `reimbursable` toggle (checkbox styled as toggle). Auto-set to `true` when `paid_by` changes to `driver_cash`, auto-set to `false` when `company_card`. User can still override manually after auto-set.
- Validation before submit:
  - `dispatchId` OR `loadId` must be non-empty. If both are undefined/empty, show inline error: "Must be linked to a dispatch or load."
  - `amount` must be > 0
  - `expense_type`, `paid_by`, `driver_id` must be selected
- Submit: POST to `/api/v1/carrier/expenses` with JSON body containing all fields. On success: toast success, call `onSuccess()`, reset form. On error: toast error message from response.
- Use standard Tailwind form styling consistent with other carrier forms (labels above inputs, gap-4 spacing, Button from shadcn for submit).

**StopTimelineCard.tsx modifications:**

1. Add `onStopUpdated?: () => void` to `StopTimelineCardProps` interface. This is an optional callback so existing usage without it does not break.
2. Import `DocumentUploadModal` from `@/components/carrier/documents/DocumentUploadModal`.
3. In the document compliance section (lines ~342-401), replace the two disabled `<button>` stubs (the ones with `disabled`, `cursor-not-allowed`, and title "Document upload coming soon") with:
   - For pickup: `<DocumentUploadModal parentType="stop" parentId={stop.id} documentType="bol" onSuccess={() => onStopUpdated?.()} />` — the modal's trigger should be styled as a small text link/button matching the current "Upload" text style but enabled (text-xs, underline, text-brand or text-primary).
   - For delivery: same pattern but `documentType="pod"`.
4. Do NOT change any other behavior, props, or layout in StopTimelineCard. The existing `bolUploaded`/`podUploaded`/`bolRequired`/`podRequired` logic and Complete Stop guard remain unchanged.
5. The DocumentUploadModal should render its own trigger button internally (a small "Upload" text button). If the current DocumentUploadModal design uses a controlled open state, add a simple trigger element inside the modal component that opens it.
  </action>
  <verify>
Run `npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | head -30` to confirm no type errors. Verify StopTimelineCard still exports correctly and the new optional prop does not break existing imports. Check that the disabled stub buttons are gone by grepping: `grep -n "cursor-not-allowed" apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx` should return no results.
  </verify>
  <done>
ExpenseForm validates and submits expenses with auto-reimbursable logic. StopTimelineCard stub upload buttons replaced with functional DocumentUploadModal — pickup opens BOL upload, delivery opens POD upload, and onStopUpdated callback fires on successful upload.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit -p apps/web/tsconfig.json` passes with no errors in the 4 modified/created files
- `grep -r "cursor-not-allowed" apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx` returns nothing (stubs removed)
- `grep -r "DocumentUploadModal" apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx` returns import + usage lines
- All 3 new files exist and export named components
- DocumentUploadModal uses XMLHttpRequest (not fetch) for upload: `grep "XMLHttpRequest" apps/web/src/components/carrier/documents/DocumentUploadModal.tsx`
- ExpenseForm validates dispatch/load linkage: `grep "Must be linked" apps/web/src/components/carrier/expenses/ExpenseForm.tsx`
</verification>

<success_criteria>
- DocumentUploadModal: file drop zone, 25MB client-side validation, XHR upload with real percentage progress, error+retry, calls onSuccess on completion
- DocumentList: fetches documents by parent, shows type badge + filename + size + uploader + verified badge, view/delete/verify actions with confirm dialog on delete
- ExpenseForm: 6-field form with auto-reimbursable toggle, validates dispatchId OR loadId required, POSTs to carrier expenses API
- StopTimelineCard: stub buttons replaced with live DocumentUploadModal, pickup=bol / delivery=pod, onStopUpdated callback on success, no other behavior changed
</success_criteria>

<output>
After completion, create `.planning/quick/171-carrier-ops-document-upload-modal-and-ex/171-SUMMARY.md`
</output>
