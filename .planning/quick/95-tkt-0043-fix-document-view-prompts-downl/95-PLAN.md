---
phase: quick-95
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/storage/presigned.ts
  - src/components/driver/document-list-readonly.tsx
  - src/components/documents/driver-document-list.tsx
  - src/components/documents/document-list.tsx
autonomous: true
must_haves:
  truths:
    - "Tapping View/Download on mobile opens the document inline in a new tab (PDF renders in browser, images display directly) instead of prompting a file download"
    - "All document consumers (driver portal, owner portal, support tickets) benefit from the fix via the shared presigned URL function"
  artifacts:
    - path: "src/lib/storage/presigned.ts"
      provides: "Presigned GET URLs with Content-Disposition: inline"
      contains: "ResponseContentDisposition"
    - path: "src/components/driver/document-list-readonly.tsx"
      provides: "Driver portal document list with View button"
    - path: "src/components/documents/driver-document-list.tsx"
      provides: "Owner driver-documents list with View button"
    - path: "src/components/documents/document-list.tsx"
      provides: "General document list with View button"
  key_links:
    - from: "src/lib/storage/presigned.ts"
      to: "R2/S3 GetObjectCommand"
      via: "ResponseContentDisposition: inline"
      pattern: "ResponseContentDisposition.*inline"
---

<objective>
Fix TKT-0043: Document view on mobile prompts download instead of previewing inline.

Purpose: When a driver or owner taps "Download" on a document (PDF or image), the browser downloads the file instead of rendering it in a new tab. This is because the presigned URL's GetObjectCommand has no Content-Disposition override, so R2/S3 defaults to `attachment`. Fix the presigned URL to serve with `Content-Disposition: inline` and rename the button from "Download" to "View" to match the new behavior.

Output: Inline document preview in new tabs across all portals.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/lib/storage/presigned.ts
@src/components/driver/document-list-readonly.tsx
@src/components/documents/driver-document-list.tsx
@src/components/documents/document-list.tsx
@src/app/api/documents/download-url/[id]/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix presigned URL to serve inline Content-Disposition</name>
  <files>src/lib/storage/presigned.ts</files>
  <action>
In `generateDownloadUrl`, add `ResponseContentDisposition: 'inline'` to the `GetObjectCommand` params. This tells R2/S3 to override the default `attachment` disposition, allowing browsers to render PDFs and images inline instead of forcing download.

Change from:
```ts
const command = new GetObjectCommand({
  Bucket: getBucketName(),
  Key: s3Key,
});
```

To:
```ts
const command = new GetObjectCommand({
  Bucket: getBucketName(),
  Key: s3Key,
  ResponseContentDisposition: 'inline',
});
```

Also update the JSDoc comment for the function from "download URL" to "view URL" to reflect the new inline behavior. Keep the function name as `generateDownloadUrl` to avoid a large rename across the codebase.
  </action>
  <verify>Run `npx tsc --noEmit` to confirm no type errors. Grep for `ResponseContentDisposition` in presigned.ts to confirm it exists.</verify>
  <done>GetObjectCommand includes `ResponseContentDisposition: 'inline'`. All 6 callers of `generateDownloadUrl` (owner documents action, driver documents action, download-url API route, support ticket page) automatically benefit from the fix with zero changes.</done>
</task>

<task type="auto">
  <name>Task 2: Rename Download buttons to View across all document list components</name>
  <files>
    src/components/driver/document-list-readonly.tsx
    src/components/documents/driver-document-list.tsx
    src/components/documents/document-list.tsx
  </files>
  <action>
Since documents now open inline rather than downloading, update button labels and state variable names to reflect "View" instead of "Download" in all three document list components:

**src/components/driver/document-list-readonly.tsx** (driver portal):
- Rename `downloading` state to `viewing`, `setDownloading` to `setViewing`, `isDownloading` to `isViewing`
- Rename `handleDownload` to `handleView`
- Change button text from `'Downloading...'` to `'Opening...'` and `'Download'` to `'View'`
- Update the comment "Open download URL in new tab" to "Open document in new tab for inline viewing"

**src/components/documents/driver-document-list.tsx** (owner portal, driver docs tab):
- Rename `downloading` state to `viewing`, `setDownloading` to `setViewing`, `isDownloading` to `isViewing`
- Rename `handleDownload` to `handleView`
- Change button text from `'Downloading...'` to `'Opening...'` and `'Download'` to `'View'`
- Update the onClick from `handleDownload` to `handleView`

**src/components/documents/document-list.tsx** (owner portal, truck/route docs):
- Rename `downloading` state to `viewing`, `setDownloading` to `setViewing`, `isDownloading` to `isViewing`
- Rename `handleDownload` to `handleView`
- Change button text from `'Downloading...'` to `'Opening...'` and `'Download'` to `'View'`
- Update the onClick from `handleDownload` to `handleView`

Do NOT rename the `downloadAction` prop in `DocumentListReadOnly` or the `getDownloadUrl` server action -- those are API-level names that don't need to change for this UI fix.
  </action>
  <verify>Run `npx tsc --noEmit` to confirm no type errors. Grep for `'Download'` in all three files to confirm no remaining "Download" button labels (there should be zero matches for button text, though `downloadAction` prop name is fine to keep).</verify>
  <done>All three document list components show "View" button instead of "Download". Loading state shows "Opening..." instead of "Downloading...".</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with zero errors
2. `grep -r "ResponseContentDisposition" src/lib/storage/presigned.ts` shows the inline disposition
3. All three document list components use "View" button text
4. No `download` HTML attribute on any anchor/button in document list components
</verification>

<success_criteria>
- Presigned URLs include `Content-Disposition: inline` header override
- PDFs and images open inline in browser tab on mobile and desktop
- All document list buttons say "View" instead of "Download"
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/95-tkt-0043-fix-document-view-prompts-downl/95-SUMMARY.md`
</output>
