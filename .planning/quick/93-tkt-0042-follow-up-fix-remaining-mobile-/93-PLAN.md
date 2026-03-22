---
phase: quick-93
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/api/documents/multipart/initiate/route.ts
  - src/components/documents/driver-document-upload.tsx
  - src/lib/storage/validate.ts
autonomous: true
must_haves:
  truths:
    - "Multipart initiate accepts files with empty or HEIC content type by resolving from file extension"
    - "Large file complete call uses server-resolved content type, not browser-reported type"
    - "Small file S3 PUT failure shows meaningful error on mobile Safari"
    - "HEIC/HEIF files detected by magic bytes get a specific user-friendly rejection message"
  artifacts:
    - path: "src/app/api/documents/multipart/initiate/route.ts"
      provides: "Extension-based content type fallback + resolvedContentType in response"
    - path: "src/components/documents/driver-document-upload.tsx"
      provides: "Uses resolvedContentType from initiate; better S3 PUT error messages"
    - path: "src/lib/storage/validate.ts"
      provides: "HEIC/HEIF-specific error message"
  key_links:
    - from: "src/app/api/documents/multipart/initiate/route.ts"
      to: "src/components/documents/driver-document-upload.tsx"
      via: "resolvedContentType in JSON response"
      pattern: "resolvedContentType"
---

<objective>
Fix 3 remaining mobile upload bugs from TKT-0042: content type resolution for mobile browsers, proper error messages on S3 PUT failure, and HEIC-specific validation message.

Purpose: Mobile browsers report empty or non-standard MIME types (empty string on Android, image/heic on iOS). The multipart initiate endpoint rejects these. Additionally, S3 PUT errors show blank messages on mobile Safari, and HEIC files get a confusing generic error instead of actionable guidance.
Output: All three files patched, mobile upload flow works end-to-end for all supported file types.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/app/api/documents/multipart/initiate/route.ts
@src/components/documents/driver-document-upload.tsx
@src/lib/storage/validate.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Content type resolution in multipart initiate + HEIC validation message</name>
  <files>src/app/api/documents/multipart/initiate/route.ts, src/lib/storage/validate.ts</files>
  <action>
**In `src/app/api/documents/multipart/initiate/route.ts`:**

1. Add an extension-to-MIME mapping constant at the top (after imports):
```ts
const EXTENSION_MIME_MAP: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};
```

2. After the existing content type validation block (lines 45-50), replace the logic. Instead of rejecting outright when `contentType` is not in `ALLOWED_TYPES`, add a fallback:
   - If `contentType` IS in `Object.keys(ALLOWED_TYPES)`, use it as `resolvedContentType`.
   - Otherwise, extract extension from `fileName` (split on `.`, take last segment, lowercase), look it up in `EXTENSION_MIME_MAP`.
   - If extension lookup succeeds, use that as `resolvedContentType`.
   - If extension lookup also fails, THEN return the 400 error.

3. Use `resolvedContentType` (instead of `contentType`) when calling `initiateMultipartUpload()` on line 73.

4. Add `resolvedContentType` to the JSON response object (line 76-81):
```ts
return NextResponse.json({
  uploadId,
  s3Key,
  fileId,
  totalParts: parts,
  resolvedContentType,
});
```

**In `src/lib/storage/validate.ts`:**

5. In the `validateFileType` function, BEFORE the existing `if (!ALLOWED_TYPES[detected.mime])` check (line 58), add a specific check for HEIC/HEIF:
```ts
if (detected.mime === 'image/heic' || detected.mime === 'image/heif') {
  return {
    valid: false,
    error: 'HEIC/HEIF image format is not supported. Please convert your photo to JPEG or PNG before uploading.',
  };
}
```
This must come before the generic ALLOWED_TYPES check so HEIC gets the specific message.
  </action>
  <verify>Run `npx tsc --noEmit` to confirm no type errors. Visually confirm the EXTENSION_MIME_MAP covers pdf, jpg, jpeg, png. Confirm resolvedContentType is in the response JSON.</verify>
  <done>Multipart initiate resolves content type from file extension when browser-reported type is not in ALLOWED_TYPES. HEIC/HEIF detected by magic bytes returns a specific helpful error message.</done>
</task>

<task type="auto">
  <name>Task 2: Use resolvedContentType in large file complete + better S3 PUT error in small file</name>
  <files>src/components/documents/driver-document-upload.tsx</files>
  <action>
**In `uploadLargeFile()` (around line 235):**

1. Change the destructuring of the initiate response to include `resolvedContentType`:
```ts
const { uploadId, s3Key, resolvedContentType } = await initiateResponse.json();
```

2. In the complete call body (line 275), change `contentType: selectedFile.type` to `contentType: resolvedContentType`.

**In `uploadSmallFile()` (around line 173):**

3. Improve the S3 PUT error handling. Replace:
```ts
if (!uploadResponse.ok) {
  throw new Error(`Upload failed: ${uploadResponse.statusText}`);
}
```
With:
```ts
if (!uploadResponse.ok) {
  let detail = uploadResponse.statusText;
  try {
    const bodyText = await uploadResponse.text();
    if (bodyText) detail = bodyText;
  } catch {
    // Cross-origin response may not expose body
  }
  throw new Error(`Upload failed (${uploadResponse.status}): ${detail || 'unknown error'}`);
}
```
This ensures mobile Safari (which returns empty statusText for cross-origin S3 responses) still shows the HTTP status code and any available body text.
  </action>
  <verify>Run `npx tsc --noEmit` to confirm no type errors. Search for `selectedFile.type` in `uploadLargeFile` complete call to confirm it was replaced with `resolvedContentType`. Confirm the S3 PUT error block now reads response body text.</verify>
  <done>Large file complete call sends server-resolved content type. Small file S3 PUT failure shows HTTP status code and body text instead of empty statusText on mobile Safari.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with zero errors
2. In multipart initiate route: `resolvedContentType` is computed from extension fallback and included in response
3. In driver-document-upload: `uploadLargeFile` complete call uses `resolvedContentType`, not `selectedFile.type`
4. In driver-document-upload: `uploadSmallFile` S3 PUT error includes status code and body text
5. In validate.ts: HEIC/HEIF detected mime returns specific conversion guidance message
</verification>

<success_criteria>
- TypeScript compiles without errors
- All 4 bugs from the ticket description are addressed across the 2 tasks
- No behavioral changes to the happy path (valid PDF/JPEG/PNG uploads work identically)
</success_criteria>

<output>
After completion, create `.planning/quick/93-tkt-0042-follow-up-fix-remaining-mobile-/93-SUMMARY.md`
</output>
