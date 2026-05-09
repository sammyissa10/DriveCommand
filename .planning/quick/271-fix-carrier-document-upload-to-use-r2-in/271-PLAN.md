---
phase: quick-271
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/carrier/documents.ts
autonomous: true
must_haves:
  truths:
    - "Carrier document upload writes files to R2 via PutObjectCommand, not Supabase Storage"
    - "Carrier document delete removes files from R2 via DeleteObjectCommand, not Supabase Storage"
    - "No Supabase Storage imports remain in documents.ts"
  artifacts:
    - path: "apps/web/src/lib/carrier/documents.ts"
      provides: "Carrier document CRUD using R2 storage"
      contains: "PutObjectCommand"
  key_links:
    - from: "apps/web/src/lib/carrier/documents.ts"
      to: "@/lib/storage/s3-client"
      via: "s3Client.send(PutObjectCommand) and DeleteObjectCommand"
      pattern: "s3Client\\.send"
---

<objective>
Replace Supabase Storage calls in carrier document upload/delete with Cloudflare R2 via the existing s3Client, matching the pattern used by every other upload in the app.

Purpose: The Supabase Storage bucket referenced does not exist. R2 is the real storage backend.
Output: Updated `apps/web/src/lib/carrier/documents.ts` using R2 for upload and delete.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/storage/s3-client.ts
@apps/web/src/lib/storage/presigned.ts
@apps/web/src/app/api/documents/upload/route.ts
@apps/web/src/lib/carrier/documents.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace Supabase Storage with R2 in carrier documents.ts</name>
  <files>apps/web/src/lib/carrier/documents.ts</files>
  <action>
In `apps/web/src/lib/carrier/documents.ts`:

1. **Remove imports**: Delete `import { createAdminClient } from '@/lib/supabase/admin';`

2. **Add imports**: Add at the top:
   ```ts
   import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
   import { s3Client, getBucketName } from '@/lib/storage/s3-client';
   ```

3. **Remove BUCKET constant**: Delete `const BUCKET = process.env.S3_BUCKET || 'driver-documents';` — `getBucketName()` from s3-client handles this.

4. **Replace upload in `uploadDocument`** (lines 114-118): Replace the Supabase Storage upload block:
   ```ts
   // Upload to R2
   const buffer = Buffer.from(await file.arrayBuffer());
   try {
     await s3Client.send(
       new PutObjectCommand({
         Bucket: getBucketName(),
         Key: storagePath,
         Body: buffer,
         ContentType: file.type,
         ContentLength: file.size,
       })
     );
   } catch (uploadError) {
     logger.error('uploadDocument: R2 upload failed', uploadError, { orgId, storagePath });
     return { error: 'Storage upload failed', status: 500 };
   }
   ```
   Remove the old `const { error: uploadError } = await createAdminClient()...` block and its `if (uploadError)` check.

5. **Replace delete in `deleteDocument`** (lines 258-265): Replace the Supabase Storage delete block:
   ```ts
   // Remove from R2
   try {
     await s3Client.send(
       new DeleteObjectCommand({
         Bucket: getBucketName(),
         Key: doc.fileUrl,
       })
     );
   } catch (storageError) {
     logger.error('deleteDocument: R2 delete failed', storageError, { orgId, docId });
     // Continue — still delete the DB record even if storage fails
   }
   ```
   Remove the old `const { error: storageError } = await createAdminClient()...` block and its `if (storageError)` check.

6. **Keep everything else unchanged**: Storage path format (`{orgId}/{parentType}/{parentId}/{documentType}/{uuid}.{ext}`), all validation, all org verification, all DB operations, listDocuments, verifyDocument.
  </action>
  <verify>
Run `npx tsc --noEmit` from apps/web — no TypeScript errors in carrier/documents.ts.
Run `grep -c "createAdminClient\|supabase/admin" apps/web/src/lib/carrier/documents.ts` — should return 0.
Run `grep -c "PutObjectCommand\|DeleteObjectCommand\|s3Client" apps/web/src/lib/carrier/documents.ts` — should return >0.
  </verify>
  <done>
Carrier document upload uses `s3Client.send(new PutObjectCommand(...))` to write to R2. Carrier document delete uses `s3Client.send(new DeleteObjectCommand(...))` to remove from R2. Zero Supabase Storage references remain. No TypeScript errors.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no errors in carrier/documents.ts
- No Supabase Storage imports remain in the file
- Upload and delete both use the s3Client from `@/lib/storage/s3-client`
</verification>

<success_criteria>
- Carrier document upload writes to R2 via PutObjectCommand
- Carrier document delete removes from R2 via DeleteObjectCommand
- Storage path format unchanged: {orgId}/{parentType}/{parentId}/{documentType}/{uuid}.{ext}
- All other logic (validation, org verification, DB operations) unchanged
- Zero TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/271-fix-carrier-document-upload-to-use-r2-in/271-SUMMARY.md`
</output>
