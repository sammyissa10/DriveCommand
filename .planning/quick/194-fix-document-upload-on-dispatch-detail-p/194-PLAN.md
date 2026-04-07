---
phase: quick-194
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/carrier/documents.ts
autonomous: true
must_haves:
  truths:
    - "Document upload from dispatch detail stop timeline succeeds (no 'Storage upload failed' error)"
    - "BOL upload on a pickup stop causes bolUploaded to show as true (green check) on page refresh"
    - "POD upload on a delivery stop causes podUploaded to show as true (green check) on page refresh"
  artifacts:
    - path: "apps/web/src/lib/carrier/documents.ts"
      provides: "Document upload/delete using correct Supabase Storage bucket"
  key_links:
    - from: "apps/web/src/lib/carrier/documents.ts"
      to: "Supabase Storage"
      via: "createAdminClient().storage.from(BUCKET)"
      pattern: "storage\\.from\\("
---

<objective>
Fix the "Storage upload failed" error when uploading documents (BOL/POD) from the dispatch detail page stop timeline.

Purpose: The `carrier-documents` bucket hardcoded in `lib/carrier/documents.ts` does not exist in Supabase Storage. The existing bucket is `driver-documents` (configured via `S3_BUCKET` env var). The upload code needs to use the correct bucket. Once uploads succeed, the existing `bolUploaded`/`podUploaded` logic (which counts CarrierDocument rows by type) will automatically work — no schema changes needed since there is no `bol_uploaded` column; the UI already derives upload status from document counts.

Output: Working document uploads from dispatch detail page.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/carrier/documents.ts
@apps/web/src/app/api/v1/carrier/documents/route.ts
@apps/web/src/components/carrier/documents/DocumentUploadModal.tsx
@apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx
@apps/web/.env.local (S3_BUCKET=driver-documents)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix Supabase Storage bucket name in carrier documents lib</name>
  <files>apps/web/src/lib/carrier/documents.ts</files>
  <action>
In `apps/web/src/lib/carrier/documents.ts`, the `BUCKET` constant is hardcoded to `'carrier-documents'` (line 9). This bucket does not exist in Supabase Storage. The existing bucket used by the rest of the app is `driver-documents` (set via `S3_BUCKET` env var in `.env.local`).

Two options — choose the SIMPLEST:

**Option A (preferred): Use S3_BUCKET env var** — Change line 9 from:
```ts
const BUCKET = 'carrier-documents';
```
to:
```ts
const BUCKET = process.env.S3_BUCKET || 'driver-documents';
```
This aligns with how `support-tickets.ts` and `upload-screenshot/route.ts` already reference the bucket.

**Option B: Create the bucket in Supabase** — If Option A is chosen, skip this. Only create a separate `carrier-documents` bucket if there's a strong reason to isolate carrier docs from driver docs in storage. There isn't — they're all in the same Supabase project.

Go with Option A. This is a one-line fix.

Additionally, verify the upload and delete functions both reference `BUCKET` (they do — lines 59 and 170), so fixing the constant fixes both operations.
  </action>
  <verify>
1. Run `cd apps/web && npx tsc --noEmit` — should pass with no errors
2. Start dev server, navigate to a dispatch detail page, open a stop's BOL upload modal, upload a small PDF or image — should succeed with "Document uploaded successfully" toast
3. After upload, refresh the page — the BOL indicator should show green check with "(uploaded)" text
  </verify>
  <done>
Document uploads to Supabase Storage succeed. BOL/POD upload indicators on the dispatch detail stop timeline correctly reflect uploaded documents. No "Storage upload failed" error.
  </done>
</task>

</tasks>

<verification>
- Upload a BOL document on a pickup stop — succeeds, no error
- Upload a POD document on a delivery stop — succeeds, no error
- After uploading BOL on a stop where bolRequired=true, the "Complete Stop" button becomes enabled (no longer blocked by missing docs)
- Page refresh shows correct uploaded status for both BOL and POD
- Delete a document (if delete UI exists) — also succeeds since it uses the same BUCKET constant
</verification>

<success_criteria>
- Zero "Storage upload failed" errors when uploading documents from dispatch detail page
- BOL/POD upload indicators correctly show uploaded status after document upload
- Complete Stop button is unblocked after required documents are uploaded
</success_criteria>

<output>
After completion, create `.planning/quick/194-fix-document-upload-on-dispatch-detail-p/194-SUMMARY.md`
</output>
