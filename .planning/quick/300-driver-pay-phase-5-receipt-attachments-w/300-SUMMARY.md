---
phase: quick-300
plan: "01"
subsystem: driver-pay
tags: [attachments, receipts, s3, reimbursement, mobile, upload]
dependency_graph:
  requires: [quick-299 (driver pay phase 4 pay components)]
  provides: [receipt attachments for reimbursement components, mobile ReceiptCapture component]
  affects: [pay-components-list.tsx, driver pay API routes]
tech_stack:
  added: []
  patterns:
    - Storage abstraction facade pattern (getAttachmentUploadUrl/getAttachmentDownloadUrl/deleteAttachmentObject) over existing s3-client.ts
    - Two-step presign + confirm upload flow (matches existing documents pattern)
    - React.Fragment with key for table row pairs
    - XHR-based upload for web progress events
    - FileSystem.uploadAsync for mobile large-file uploads
key_files:
  created:
    - apps/web/src/lib/storage/attachments.ts
    - apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/attachments/route.ts
    - apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/attachments/[attachmentId]/route.ts
    - apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/attachments/[attachmentId]/download-url/route.ts
    - apps/web/src/components/driver-pay/attachment-uploader.tsx
    - apps/web/src/components/driver-pay/attachment-list.tsx
    - apps/web/src/app/api/driver-pay/__tests__/attachments-api.test.ts
    - apps/mobile/components/driver-pay/ReceiptCapture.tsx
    - apps/mobile/lib/driver-pay/uploadReceipt.ts
  modified:
    - apps/web/src/components/driver-pay/pay-components-list.tsx
decisions:
  - Used ImagePicker.launchCameraAsync instead of CameraView — no screen in codebase uses CameraView directly; consistent with IncidentPhotoCapture, DocumentUploadSheet, and 5+ other camera captures
  - expo-image-manipulator not installed — require() used for graceful degradation; compression skipped silently when package absent
  - React.Fragment with key used for table fragment rows to eliminate React key warnings
  - storageKey excluded from all API responses except presign (defense-in-depth; clients only get download URLs)
metrics:
  duration_seconds: 541
  completed_date: "2026-05-13"
  tasks_completed: 3
  tests_added: 5
  files_created: 9
  files_modified: 1
---

# Phase quick-300 Plan 01: Driver Pay Phase 5 — Receipt Attachments Summary

Receipt attachments for reimbursement pay components: S3 storage abstraction + 4 API routes + 2 web UI components (drag-drop uploader + thumbnail list) + 1 mobile capture component + 5 tests.

## What Was Built

### Task 1: Storage abstraction + API routes + tests

**`apps/web/src/lib/storage/attachments.ts`** (~115 LOC)
Storage facade with `getStorageProvider()` (reads `STORAGE_PROVIDER` env, defaults `s3`), `getAttachmentUploadUrl({ tenantId, componentId, ext, contentType })` → `{ uploadUrl, storageKey }`, `getAttachmentDownloadUrl(storageKey)` → presigned GET URL, `deleteAttachmentObject(storageKey)`. Supabase stub throws descriptive error. Storage key format: `{tenantId}/components/{componentId}/{uuid}.{ext}`. Both presign types use 900s (15-minute) expiry.

**API routes** (~400 LOC total across 4 files):
- `attachments/route.ts` — GET list (storageKey excluded from response), POST `?action=presign` (MIME allow-list, 10MB limit, rate-limited, PAID 409), POST `?action=confirm` (storageKey prefix defense check, PAID 409, creates PayComponentAttachment row)
- `attachments/[attachmentId]/route.ts` — DELETE soft-delete (driver own-upload check, cross-tenant 404 not 403, TODO comment for cleanup job)
- `attachments/[attachmentId]/download-url/route.ts` — GET short-lived URL with full ownership chain check, `Cache-Control: no-store, must-revalidate`

**`attachments-api.test.ts`** — 5/5 tests pass:
1. Tenant B gets 404 for tenant A attachment download URL
2. Cross-tenant componentId guess fails with 404 on presign
3. Invalid MIME (`application/x-msdownload`) rejected with 400
4. Soft-deleted attachment returns 404 on download-url
5. PAID assignment returns 409 on presign

### Task 2: Web uploader/list UI + pay-components-list wiring

**`attachment-uploader.tsx`** (~185 LOC) — drag-drop zone with `border-dashed` styling, `data-dragover` visual feedback, hidden file input, multi-file upload, XHR-based PUT for per-file progress bars (0-90% upload, 92% post-XHR, 100% after confirm), 10MB client-side rejection toast, PAID state disables zone with tooltip "Paid — attachments locked", error state per file.

**`attachment-list.tsx`** (~175 LOC) — 80×80 thumbnails lazy-loaded on click (fetches download URL on demand, caches in state), PDF file icon via `lucide-react`, click image → Dialog modal full-size preview, click PDF → new tab, delete with `confirm()` → soft-delete API call → `onChanged`, PAID state disables delete, filename truncated to 30 chars, sizeBytes formatted (KB/MB).

**`pay-components-list.tsx`** (modified, +80 LOC net) — added `expandedComponentId` state, `attachmentsByComponent` record (lazy-fetched on first expand), `loadAttachments()` helper, `toggleExpand()`. REIMBURSEMENT rows now have: chevron toggle button at row end, "No receipt" yellow warning chip when empty (clickable to expand), expandable `<tr>` panel rendering `<AttachmentList>` + `<AttachmentUploader>`. Also fixed: all `<>` fragments in table body replaced with `React.Fragment key={...}` to eliminate React key warnings.

### Task 3: Mobile receipt capture + upload helper

**`apps/mobile/lib/driver-pay/uploadReceipt.ts`** (~135 LOC) — `uploadReceipt({ assignmentId, componentId, uri, filename, contentType, token })` → `{ id, filename }`. Flow: `FileSystem.getInfoAsync` for size, `require('expo-image-manipulator')` compression (gracefully skips if not installed), presign API call, `FileSystem.uploadAsync` PUT (binary content, more reliable than fetch+blob on RN 0.76 for large files), confirm API call.

**`apps/mobile/components/driver-pay/ReceiptCapture.tsx`** (~255 LOC) — 4-mode state machine (`choose` / `camera` / `preview` / `uploading`). Choose mode: two big buttons (Take Photo, Choose from Library) + Cancel, all ≥54px height. Camera mode: calls `ImagePicker.launchCameraAsync` (consistent with all other camera uses in codebase). Preview mode: full-screen `expo-image` with Retake + Use buttons. Uploading mode: dimmed preview + ActivityIndicator + "Uploading receipt…" text. USAGE JSDoc block at top for follow-up wiring task.

## Storage Key Format

```
{tenantId}/components/{componentId}/{uuid}.{ext}
```

Example: `a1b2c3d4-e5f6-7890-abcd-ef1234567890/components/9f8e7d6c-5b4a-3c2d-1e0f-fedcba987654/550e8400-e29b-41d4-a716-446655440000.jpg`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Pattern Consistency] Used ImagePicker.launchCameraAsync instead of CameraView**
- **Found during:** Task 3
- **Issue:** Plan specified direct `CameraView` from `expo-camera`. No existing screen in the codebase uses `CameraView` directly — all camera capture uses `ImagePicker.launchCameraAsync` (IncidentPhotoCapture.tsx, DocumentUploadSheet.tsx, StopDocumentUpload.tsx, etc.)
- **Fix:** Implemented `ReceiptCapture` with `ImagePicker.launchCameraAsync` for the camera mode, which provides the same user experience (native camera UI with shutter) while being consistent with the rest of the codebase
- **Files modified:** `apps/mobile/components/driver-pay/ReceiptCapture.tsx`

**2. [Rule 2 - Missing Critical Functionality] expo-image-manipulator not installed**
- **Found during:** Task 3
- **Issue:** `expo-image-manipulator` is not in `apps/mobile/package.json`
- **Fix:** Used `require()` instead of dynamic `import()` for graceful degradation — if package absent, compression silently skips and upload proceeds with original file (still bounded by 10MB limit). TypeScript error avoided by typing the require result inline.
- **Action needed:** `cd apps/mobile && npx expo install expo-image-manipulator` to enable compression for images > 2MB

**3. [Rule 1 - Bug] React Fragment key warnings in pay-components-list.tsx**
- **Found during:** Task 2
- **Issue:** Existing `<>` fragments in the category and component rows maps (added by Task 2 edits) lacked `key` props, causing React warnings
- **Fix:** Replaced `<>` with `React.Fragment key={cat}` (category) and `React.Fragment key={c.id}` (component rows), removed redundant `key` props from child `<tr>` elements
- **Files modified:** `apps/web/src/components/driver-pay/pay-components-list.tsx`

## Tests Added

**`apps/web/src/app/api/driver-pay/__tests__/attachments-api.test.ts`**
1. `Tenant isolation > Tenant B gets 404 for tenant A attachment download URL (not 403)`
2. `Cross-tenant component guess > POST presign returns 404 when component belongs to another tenant`
3. `File type validation > POST presign rejects invalid MIME type with 400`
4. `Soft-deleted attachment > GET download-url returns 404 for a soft-deleted attachment`
5. `PAID guard > POST presign returns 409 when assignment is PAID`

All 5 tests pass.

## Follow-up Required

**Wiring `ReceiptCapture` into the driver portal:** A follow-up quick task is needed to create the "add reimbursement" flow on mobile (a screen or bottom sheet where drivers select/create a REIMBURSEMENT component and then optionally capture a receipt). The `ReceiptCapture.tsx` component has a `// USAGE:` JSDoc block showing the integration pattern.

**Install expo-image-manipulator:** `cd apps/mobile && npx expo install expo-image-manipulator` — enables auto-compression of JPEG receipts > 2MB. Without it, images up to 10MB upload uncompressed (functional but slower on slow connections).

## Commits

- `3dada74` feat(quick-300): storage abstraction + attachment API routes + tests
- `7c73565` feat(quick-300): web attachment uploader/list UI + reimbursement row expander
- `74faa59` feat(quick-300): mobile receipt capture + upload helper
