---
phase: quick-92
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/documents/driver-document-upload.tsx
  - src/lib/storage/validate.ts
autonomous: true
must_haves:
  truths:
    - "Document upload on mobile succeeds for PDF, JPEG, and PNG files"
    - "Photos taken with iOS camera (HEIC auto-converted to JPEG) upload without error"
    - "Files selected from Android gallery upload without error"
    - "Desktop upload behavior is unchanged"
  artifacts:
    - path: "src/components/documents/driver-document-upload.tsx"
      provides: "Mobile-compatible file type validation"
    - path: "src/lib/storage/validate.ts"
      provides: "Relaxed MIME mismatch check for mobile browsers"
  key_links:
    - from: "src/components/documents/driver-document-upload.tsx"
      to: "src/app/(owner)/actions/driver-documents.ts"
      via: "requestDriverUploadUrl server action with FormData"
      pattern: "requestDriverUploadUrl"
---

<objective>
Fix TKT-0042: Driver page document upload fails on mobile.

Purpose: Mobile browsers (especially iOS Safari) handle file MIME types differently than desktop. When a user picks a photo from their gallery or takes a camera photo, the reported `file.type` can be empty, `image/heic`, or mismatched from the actual file bytes. This causes two failures:
1. Client-side: `ALLOWED_TYPES.includes(file.type)` rejects files with empty or non-standard MIME types
2. Server-side: `validateFileType` strict equality check `detected.mime !== claimedType` rejects files where the browser-reported type differs from magic-bytes-detected type

Output: Working document upload on mobile devices for all supported file types.
</objective>

<context>
@.planning/STATE.md
@src/components/documents/driver-document-upload.tsx
@src/lib/storage/validate.ts
@src/app/(owner)/actions/driver-documents.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix client-side file type validation for mobile browsers</name>
  <files>src/components/documents/driver-document-upload.tsx</files>
  <action>
Fix the `handleFileChange` function (line 77-95) to handle mobile browser MIME type quirks:

1. **Relax the MIME type check**: Instead of only checking `file.type` against `ALLOWED_TYPES`, also check the file extension as a fallback. On mobile, `file.type` is often empty string `""` or a non-standard type like `image/heic`. Extract extension from `file.name` and check against `ALLOWED_EXTENSIONS` when `file.type` is empty or not in `ALLOWED_TYPES`.

2. **Add `image/heic` and `image/heif` handling**: iOS camera photos may report as HEIC. When the file type is `image/heic` or `image/heif`, allow the file through client-side validation — the server-side magic bytes check will detect the actual format (iOS auto-converts to JPEG when selecting for web upload in most cases).

3. **Update the `accept` attribute on the file input** (line 492): Add `image/heic,image/heif,.heic,.heif` to ensure iOS shows camera roll photos. Also add `capture` attribute support — but do NOT add `capture` as a required attribute since that forces camera-only on some devices. The current `accept={ALLOWED_EXTENSIONS.join(',')}` approach is fine but expand `ALLOWED_EXTENSIONS` to include `.heic` and `.heif`.

The updated validation logic should be:
```
const isAllowedByType = ALLOWED_TYPES.includes(file.type) || MOBILE_EXTRA_TYPES.includes(file.type);
const extension = '.' + file.name.split('.').pop()?.toLowerCase();
const isAllowedByExtension = ALLOWED_EXTENSIONS.includes(extension);

if (!isAllowedByType && !isAllowedByExtension) {
  setError('File type not allowed...');
  return;
}
```

Where `MOBILE_EXTRA_TYPES = ['image/heic', 'image/heif', '']` (empty string = unknown type, let server validate).

IMPORTANT: When file.type is empty, we still let it through to the server. The server-side magic bytes validation is the real security gate. Client-side validation is purely UX.
  </action>
  <verify>Run `npx tsc --noEmit` to confirm no type errors. Visually inspect the code to confirm the relaxed validation logic.</verify>
  <done>Client-side file validation accepts files with empty MIME type or HEIC type, falling back to extension check. File input accept attribute includes HEIC extensions.</done>
</task>

<task type="auto">
  <name>Task 2: Fix server-side MIME type mismatch rejection</name>
  <files>src/lib/storage/validate.ts</files>
  <action>
Fix `validateFileType` function (line 35-82) to handle the MIME mismatch that occurs on mobile:

1. **Remove or relax the strict `detected.mime !== claimedType` check** on line 65. Currently if the browser says `image/heic` but the actual bytes are `image/jpeg` (iOS auto-conversion), the upload is rejected with "File type mismatch". Instead:
   - If `claimedType` is empty string `""`, skip the mismatch check entirely — just validate that `detected.mime` is in `ALLOWED_TYPES`.
   - If `claimedType` is `image/heic` or `image/heif` and `detected.mime` is `image/jpeg` or `image/png`, allow it. This is the iOS auto-conversion case.
   - If `claimedType` is a known allowed type and matches `detected.mime`, allow it (current behavior, unchanged).
   - If `claimedType` is a known allowed type but does NOT match `detected.mime`, still reject (actual spoofing attempt).

2. **The key insight**: The magic bytes detection is the SOURCE OF TRUTH. The `claimedType` from the browser is unreliable on mobile. The security model should be: "Is the actual file content an allowed type?" NOT "Does the browser's claim match the actual content?"

Updated logic:
```typescript
// Check if detected type is in allowed list (this is the real security check)
if (!ALLOWED_TYPES[detected.mime]) {
  return { valid: false, error: `File type ${detected.mime} is not allowed...` };
}

// Relaxed mismatch check: only reject if claimed type is a known allowed type
// that doesn't match detected type (actual spoofing). Skip check for empty,
// HEIC/HEIF, or other non-standard mobile types.
const MOBILE_PASSTHROUGH_TYPES = ['', 'image/heic', 'image/heif', 'application/octet-stream'];
if (
  claimedType &&
  !MOBILE_PASSTHROUGH_TYPES.includes(claimedType) &&
  detected.mime !== claimedType
) {
  return { valid: false, error: `File type mismatch...` };
}

return { valid: true, detectedType: detected.mime };
```

This preserves security (magic bytes validation ensures only PDF/JPEG/PNG content is accepted) while fixing the mobile MIME mismatch issue.
  </action>
  <verify>Run `npx tsc --noEmit` to confirm no type errors. Run `npm test -- --testPathPattern="validate|document|upload"` if any relevant tests exist. Grep for any other callers of `validateFileType` to ensure they are not affected.</verify>
  <done>Server-side validation accepts files where the browser-reported type is empty, HEIC/HEIF, or application/octet-stream, as long as the magic-bytes-detected type is in the allowed list. Desktop behavior with matching types is unchanged. Actual spoofing (e.g., claiming PDF but bytes are JPEG) is still rejected.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with no errors
2. `npm run build` succeeds
3. Grep all callers of `validateFileType` to confirm no regressions: should only be called from `driver-documents.ts` and potentially `request-upload-url/route.ts`
4. The fix preserves the security model: magic bytes detection remains the source of truth for allowed file types
</verification>

<success_criteria>
- Mobile document upload on /drivers/[id] page works for JPEG, PNG, and PDF files
- iOS camera photos (HEIC auto-converted) upload without "File type mismatch" error
- Android gallery photos with empty MIME type upload successfully
- Desktop uploads with correct MIME types continue to work as before
- Files with disallowed content (e.g., executable disguised as PDF) are still rejected by magic bytes validation
</success_criteria>

<output>
After completion, create `.planning/quick/92-tkt-0042-fix-driver-page-document-upload/92-SUMMARY.md`
</output>
