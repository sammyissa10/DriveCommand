---
phase: quick-272
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/carrier/documents.ts
autonomous: true
must_haves:
  truths:
    - "Carrier document upload uses Supabase Storage bucket drivecommand-files instead of R2"
    - "Carrier document delete uses Supabase Storage instead of R2"
    - "Carrier document list returns signed URLs (1hr expiry) instead of raw storage paths"
  artifacts:
    - path: "apps/web/src/lib/carrier/documents.ts"
      provides: "Carrier document CRUD with Supabase Storage"
      contains: "createAdminClient"
  key_links:
    - from: "apps/web/src/lib/carrier/documents.ts"
      to: "apps/web/src/lib/supabase/admin.ts"
      via: "import createAdminClient"
      pattern: "createAdminClient"
---

<objective>
Replace R2 (S3) storage with Supabase Storage in carrier document operations.

Purpose: Carrier documents should use the Supabase Storage bucket `drivecommand-files` with service role auth instead of R2/S3.
Output: Updated `apps/web/src/lib/carrier/documents.ts` using Supabase Storage for upload, delete, and signed URL generation.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/carrier/documents.ts
@apps/web/src/lib/supabase/admin.ts
@apps/web/src/app/api/v1/carrier/documents/route.ts
@apps/web/src/app/api/v1/carrier/documents/[id]/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace R2 with Supabase Storage in carrier documents</name>
  <files>apps/web/src/lib/carrier/documents.ts</files>
  <action>
Modify `apps/web/src/lib/carrier/documents.ts` to use Supabase Storage instead of R2. Specific changes:

1. **Remove R2 imports** -- delete the imports of `PutObjectCommand`, `DeleteObjectCommand` from `@aws-sdk/client-s3` and `s3Client`, `getBucketName` from `@/lib/storage/s3-client`.

2. **Add Supabase admin import** -- add `import { createAdminClient } from '@/lib/supabase/admin'` (reuse existing admin client per user constraint).

3. **Define bucket constant** at top of file:
   ```
   const BUCKET = 'drivecommand-files';
   ```

4. **Update `uploadDocument`** (lines 112-127) -- replace the R2 PutObjectCommand block:
   ```typescript
   const buffer = Buffer.from(await file.arrayBuffer());
   const supabaseAdmin = createAdminClient();
   const { error: uploadError } = await supabaseAdmin.storage
     .from(BUCKET)
     .upload(storagePath, buffer, { contentType: file.type, upsert: false });
   if (uploadError) {
     logger.error('uploadDocument: Supabase Storage upload failed', uploadError, { orgId, storagePath });
     return { error: 'Storage upload failed', status: 500 };
   }
   ```

5. **Update `deleteDocument`** (lines 264-274) -- replace the R2 DeleteObjectCommand block:
   ```typescript
   try {
     const supabaseAdmin = createAdminClient();
     const { error: storageError } = await supabaseAdmin.storage
       .from(BUCKET)
       .remove([doc.fileUrl]);
     if (storageError) throw storageError;
   } catch (storageError) {
     logger.error('deleteDocument: Supabase Storage delete failed', storageError, { orgId, docId });
     // Continue -- still delete the DB record even if storage fails
   }
   ```

6. **Update `listDocuments`** -- after fetching documents from DB, generate signed URLs for each document. Replace the mapping of `url: doc.fileUrl` (line 223) with a signed URL:
   ```typescript
   const supabaseAdmin = createAdminClient();
   const docsWithUrls = await Promise.all(
     documents.map(async (doc) => {
       const uploaderName = doc.uploader
         ? [doc.uploader.firstName, doc.uploader.lastName].filter(Boolean).join(' ') || null
         : null;
       let url: string | null = null;
       if (doc.fileUrl) {
         const { data: signedData } = await supabaseAdmin.storage
           .from(BUCKET)
           .createSignedUrl(doc.fileUrl, 3600);
         url = signedData?.signedUrl ?? null;
       }
       return {
         id: doc.id,
         documentType: doc.documentType,
         documentTypeName: doc.documentTypeRef?.name ?? null,
         fileName: doc.filename,
         fileSize: doc.fileSizeBytes ?? 0,
         uploadedByName: uploaderName,
         uploadedAt: doc.createdAt.toISOString(),
         verified: doc.verified,
         url,
         notes: doc.notes,
         documentTypeId: doc.documentTypeId,
         loadId: doc.loadId,
         dispatchId: doc.dispatchId,
         contractId: doc.contractId,
       };
     })
   );
   return { data: docsWithUrls };
   ```

7. **Do NOT touch** any other files -- no changes to R2 client, no changes to non-carrier document uploads, no changes to API route files.

8. **Do NOT create** a new Supabase client utility -- reuse `createAdminClient` from `@/lib/supabase/admin`.
  </action>
  <verify>
Run `npx tsc --noEmit` from `apps/web/` to confirm no TypeScript errors in the modified file. Grep `documents.ts` for any remaining references to `s3Client`, `PutObjectCommand`, `DeleteObjectCommand`, `getBucketName` -- there should be none.
  </verify>
  <done>
`apps/web/src/lib/carrier/documents.ts` uses Supabase Storage bucket `drivecommand-files` via `createAdminClient` for all storage operations (upload, delete, signed URL). No R2/S3 imports remain. TypeScript compiles cleanly. No other files modified.
  </done>
</task>

</tasks>

<verification>
- `grep -n "s3Client\|PutObjectCommand\|DeleteObjectCommand\|getBucketName" apps/web/src/lib/carrier/documents.ts` returns nothing
- `grep -n "createAdminClient\|drivecommand-files\|createSignedUrl" apps/web/src/lib/carrier/documents.ts` returns matches
- `npx tsc --noEmit` passes from `apps/web/`
</verification>

<success_criteria>
- Carrier document upload writes to Supabase Storage bucket `drivecommand-files`
- Carrier document delete removes from Supabase Storage
- Carrier document list returns 1-hour signed URLs for viewing/downloading
- No R2/S3 references remain in carrier documents module
- No other files outside `apps/web/src/lib/carrier/documents.ts` are modified
</success_criteria>

<output>
After completion, create `.planning/quick/272-fix-carrier-document-upload-to-use-supab/272-SUMMARY.md`
</output>
