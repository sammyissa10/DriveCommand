---
phase: quick-94
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(owner)/actions/driver-documents.ts
  - src/components/documents/driver-document-upload.tsx
autonomous: true
must_haves:
  truths:
    - "Small file uploads (<5MB) never make a client-side PUT to S3/R2"
    - "File bytes are sent to the server action via FormData and uploaded server-side"
    - "Upload still creates DB record and revalidates the driver page"
    - "Large file uploads (>=5MB) are unaffected and continue using multipart"
  artifacts:
    - path: "src/app/(owner)/actions/driver-documents.ts"
      provides: "uploadDriverDocument server action that uploads directly to R2"
      exports: ["uploadDriverDocument"]
    - path: "src/components/documents/driver-document-upload.tsx"
      provides: "Rewritten uploadSmallFile using server-side upload"
  key_links:
    - from: "src/components/documents/driver-document-upload.tsx"
      to: "src/app/(owner)/actions/driver-documents.ts"
      via: "uploadDriverDocument server action call"
      pattern: "uploadDriverDocument\\(formData\\)"
    - from: "src/app/(owner)/actions/driver-documents.ts"
      to: "src/lib/storage/s3-client.ts"
      via: "PutObjectCommand with s3Client"
      pattern: "s3Client\\.send\\(new PutObjectCommand"
---

<objective>
Fix TKT-0042 root cause: iOS Safari "Load failed" on driver document upload is a CORS error because R2 blocks cross-origin PUT from the browser. Eliminate the client-to-S3 PUT entirely for small files by uploading server-side via a new server action.

Purpose: Make document uploads work reliably on all browsers including iOS Safari
Output: Server-side upload path for small files, no CORS dependency
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/app/(owner)/actions/driver-documents.ts
@src/components/documents/driver-document-upload.tsx
@src/lib/storage/s3-client.ts
@src/lib/storage/validate.ts
@src/lib/storage/presigned.ts
@src/lib/db/repositories/document.repository.ts
@src/lib/validations/document.schemas.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add uploadDriverDocument server action</name>
  <files>src/app/(owner)/actions/driver-documents.ts</files>
  <action>
Add a new exported server action `uploadDriverDocument(formData: FormData)` to driver-documents.ts. This action handles the entire small-file upload server-side (no presigned URL, no client PUT).

Add imports at the top:
- `PutObjectCommand` from `@aws-sdk/client-s3`
- `s3Client, getBucketName` from `@/lib/storage/s3-client`

Implementation (place after `requestDriverUploadUrl`, before `completeDriverDocumentUpload`):

1. `await requireRole([UserRole.OWNER, UserRole.MANAGER])` — auth first
2. Extract from formData: `file` (as File), `driverId`, `documentType`, `expiryDate`, `notes`
3. Validate required fields (file, driverId, documentType) — return `{ error }` if missing
4. Validate `file.size <= MAX_FILE_SIZE` — return `{ error }` if too large
5. Read first 4100 bytes: `const buffer = await file.slice(0, 4100).arrayBuffer()`
6. Validate file type: `const validation = await validateFileType(buffer, file.type)` — return `{ error: validation.error }` if invalid
7. `const tenantId = await requireTenantId()`
8. `const user = await getCurrentUser()` — return `{ error: 'User not found' }` if null
9. `const fileId = nanoid()`
10. `const sanitizedFileName = file.name.replace(/[/\\]/g, '-')`
11. `const s3Key = \`tenant-\${tenantId}/drivers/\${fileId}-\${sanitizedFileName}\``
12. Upload to R2:
```
await s3Client.send(new PutObjectCommand({
  Bucket: getBucketName(),
  Key: s3Key,
  Body: Buffer.from(await file.arrayBuffer()),
  ContentType: validation.detectedType,
  ContentLength: file.size,
}));
```
13. Build documentData object (same shape as completeDriverDocumentUpload): fileName, s3Key, contentType (validation.detectedType), sizeBytes (file.size), driverId, documentType, optional expiryDate (as Date), optional notes
14. Validate with `documentCreateSchema.safeParse(documentData)` — return `{ error }` if invalid
15. Create via `new DocumentRepository(tenantId).create({ ...result.data, tenantId, uploadedBy: user.id })`
16. `revalidatePath(\`/drivers/\${driverId}\`)`
17. Return `{ success: true, document }`

Wrap everything after auth in try/catch returning `{ error: string }` on failure.

Do NOT remove requestDriverUploadUrl or completeDriverDocumentUpload — they are still used by the large-file multipart flow indirectly and may be referenced elsewhere.
  </action>
  <verify>Run `npx tsc --noEmit` — no type errors in driver-documents.ts</verify>
  <done>New uploadDriverDocument server action exists, compiles, handles file upload entirely server-side with auth, validation, S3 put, DB create, and path revalidation</done>
</task>

<task type="auto">
  <name>Task 2: Rewrite uploadSmallFile to use server-side upload</name>
  <files>src/components/documents/driver-document-upload.tsx</files>
  <action>
Modify the client component to call the new server action instead of doing a client-side S3 PUT for small files.

1. Update the import line (line 10) to add `uploadDriverDocument`:
   ```
   import { uploadDriverDocument, requestDriverUploadUrl, completeDriverDocumentUpload } from '@/app/(owner)/actions/driver-documents';
   ```
   Keep the existing imports — they are still used by uploadLargeFile's complete step.

2. Rewrite the `uploadSmallFile` function (starting at ~line 140) to:
   ```
   const uploadSmallFile = async () => {
     if (!selectedFile) return;

     setUploadState('saving');

     const formData = new FormData();
     formData.append('file', selectedFile);
     formData.append('driverId', driverId);
     formData.append('documentType', documentType);
     if (expiryDate) formData.append('expiryDate', expiryDate);
     if (notes) formData.append('notes', notes);

     const result = await uploadDriverDocument(formData);

     if ('error' in result && result.error) {
       throw new Error(
         typeof result.error === 'string'
           ? result.error
           : 'Failed to upload document'
       );
     }
   };
   ```

   Key changes vs old code:
   - State goes straight to `'saving'` (not `'uploading'` then `'saving'`) since there is no separate S3 PUT step
   - Single server action call replaces the 3-step flow (requestUrl -> fetch PUT -> complete)
   - No AbortController signal needed (server actions are not abortable via signal)
   - No presigned URL, no fetch PUT to S3

3. Do NOT modify uploadLargeFile, handleUpload, handleFileChange, or any other function.
  </action>
  <verify>Run `npx tsc --noEmit` — no type errors. Run `npm run build` to verify both server and client compilation succeeds.</verify>
  <done>Small file uploads go through the server action (no client-to-S3 PUT), large files still use multipart. iOS Safari CORS issue is eliminated for small files.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with no errors
2. `npm run build` succeeds
3. Manual test: upload a small PDF (<5MB) on the driver documents page — should succeed without any CORS/network error
4. Manual test: upload a large file (>5MB) — should still use multipart flow unchanged
</verification>

<success_criteria>
- Small file document uploads bypass client-side S3 PUT entirely
- File bytes are sent to the Next.js server action via FormData
- Server action uploads to R2 using PutObjectCommand (server-to-R2, no CORS)
- DB record created and driver page revalidated
- Large file multipart flow is completely unaffected
- TypeScript compiles, build passes
</success_criteria>

<output>
After completion, create `.planning/quick/94-tkt-0042-root-cause-fix-server-side-s3-u/94-SUMMARY.md`
</output>
