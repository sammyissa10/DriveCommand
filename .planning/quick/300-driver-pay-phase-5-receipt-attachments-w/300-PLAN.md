---
phase: quick-300
plan: "01"
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/storage/attachments.ts
  - apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/attachments/route.ts
  - apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/attachments/[attachmentId]/route.ts
  - apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/attachments/[attachmentId]/download-url/route.ts
  - apps/web/src/components/driver-pay/attachment-uploader.tsx
  - apps/web/src/components/driver-pay/attachment-list.tsx
  - apps/web/src/components/driver-pay/pay-components-list.tsx
  - apps/web/src/components/driver-pay/add-component-modal.tsx
  - apps/mobile/components/driver-pay/ReceiptCapture.tsx
  - apps/mobile/lib/driver-pay/uploadReceipt.ts
  - apps/web/src/app/api/driver-pay/__tests__/attachments-api.test.ts
autonomous: true
user_setup: []

must_haves:
  truths:
    - "Owner can upload receipt images/PDFs to a reimbursement pay component via drag-drop or file picker"
    - "Driver can capture and upload a receipt photo from the mobile app when adding a reimbursement"
    - "Each receipt is stored at {tenant_id}/components/{component_id}/{uuid}.{ext} in S3"
    - "Receipts are only viewable by users in the same tenant — cross-tenant access returns 404 (not 403)"
    - "Soft-deleted attachments return 404 on subsequent fetches"
    - "Reimbursement components with no attachments still save but display a warning chip linking to the uploader"
    - "Upload URL expires in 15 minutes; download URL expires in 15 minutes and is not cacheable"
  artifacts:
    - path: "apps/web/src/lib/storage/attachments.ts"
      provides: "Storage abstraction layer (getUploadUrl/getDownloadUrl/delete) routing to S3 today; Supabase Storage stub for later"
    - path: "apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/attachments/route.ts"
      provides: "POST presign-upload + confirm in one route via ?action=presign|confirm OR sub-routes; GET list"
    - path: "apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/attachments/[attachmentId]/route.ts"
      provides: "DELETE attachment (soft-delete)"
    - path: "apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/attachments/[attachmentId]/download-url/route.ts"
      provides: "GET short-lived download URL (re-checks access every request)"
    - path: "apps/web/src/components/driver-pay/attachment-uploader.tsx"
      provides: "Drag-drop zone + file picker UI with per-file progress and thumbnails"
    - path: "apps/web/src/components/driver-pay/attachment-list.tsx"
      provides: "Receipt thumbnail/file list with click-to-expand image preview + delete button"
    - path: "apps/mobile/components/driver-pay/ReceiptCapture.tsx"
      provides: "expo-camera + expo-image-picker capture flow with retake/use-preview UI"
    - path: "apps/mobile/lib/driver-pay/uploadReceipt.ts"
      provides: "Mobile two-step upload helper (presign + PUT + confirm)"
    - path: "apps/web/src/app/api/driver-pay/__tests__/attachments-api.test.ts"
      provides: "Tenant isolation, MIME validation, soft-delete 404, cross-tenant 404 tests"
  key_links:
    - from: "apps/web/src/components/driver-pay/pay-components-list.tsx"
      to: "apps/web/src/components/driver-pay/attachment-uploader.tsx"
      via: "Row expander on REIMBURSEMENT category renders <AttachmentUploader componentId=... />"
      pattern: "AttachmentUploader|attachment-uploader"
    - from: "apps/web/src/app/api/driver-pay/.../attachments/route.ts"
      to: "apps/web/src/lib/storage/attachments.ts"
      via: "Calls getUploadUrl({ tenantId, componentId, ext })"
      pattern: "getUploadUrl|attachments\\.ts"
    - from: "apps/mobile/components/driver-pay/ReceiptCapture.tsx"
      to: "apps/web/src/app/api/driver-pay/.../attachments/route.ts"
      via: "Bearer-token POST via api-client to presign + confirm endpoints"
      pattern: "attachments.*presign|attachments.*confirm"
---

<objective>
Driver Pay Phase 5 — Receipt Attachments. Add the full upload, view, and delete flow for receipts attached to reimbursement pay components, on both web (owner portal) and mobile (driver portal).

Purpose: Reimbursement components (lumper, scale, fuel) are currently created without receipts — Phase 4 left a "no attachment" warning chip placeholder. This phase wires that placeholder to a real attachment system backed by S3 (via existing s3-client + presigned helpers), with a storage abstraction so we can swap to Supabase Storage later without touching API/UI code.

Output: Storage abstraction + 4 API routes (presign, confirm, list+delete, download-url) + 2 web UI components (uploader + list) + 1 mobile capture component + tests.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Phase 4 components API — pattern to mirror for auth/role guards, PAID 409, soft-delete
@apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/route.ts
@apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/route.ts

# Storage primitives — wrap these, don't replace them
@apps/web/src/lib/storage/s3-client.ts
@apps/web/src/lib/storage/presigned.ts

# Auth + tenancy + rate limit primitives
@apps/web/src/lib/auth/supabase.ts
@apps/web/src/lib/context/tenant-context.ts
@apps/web/src/lib/rate-limit.ts

# UI to extend — reimbursement rows render the warning chip placeholder
@apps/web/src/components/driver-pay/pay-components-list.tsx
@apps/web/src/components/driver-pay/add-component-modal.tsx

# Existing upload/confirm pattern to study but NOT copy verbatim — driver-pay needs its own routes
@apps/web/src/app/api/documents/request-upload-url/route.ts
@apps/web/src/app/api/documents/complete-upload/route.ts

# Schema — confirm fields, do not change
@apps/web/prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Storage abstraction + attachment API routes + tests</name>
  <files>
    apps/web/src/lib/storage/attachments.ts,
    apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/attachments/route.ts,
    apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/attachments/[attachmentId]/route.ts,
    apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/attachments/[attachmentId]/download-url/route.ts,
    apps/web/src/app/api/driver-pay/__tests__/attachments-api.test.ts
  </files>
  <action>
    **Storage abstraction (`apps/web/src/lib/storage/attachments.ts`)**

    Create a thin facade over the existing `s3-client.ts` + `presigned.ts`. Export:
    - `type StorageProvider = 's3' | 'supabase'`
    - `function getStorageProvider(): StorageProvider` — reads `process.env.STORAGE_PROVIDER`, defaults to `'s3'`.
    - `async function getAttachmentUploadUrl({ tenantId, componentId, ext, contentType }): Promise<{ uploadUrl: string; storageKey: string }>`
      - Generates a UUID via `crypto.randomUUID()` for the filename
      - Builds key `${tenantId}/components/${componentId}/${uuid}.${ext}`
      - For `s3`: uses `PutObjectCommand` directly (NOT the existing `generateUploadUrl` from `presigned.ts` because that function hard-codes the `tenant-${tenantId}/${category}/...` prefix which conflicts with this new key convention). Use 15-min (900s) expiry. Do not sign ContentLength (matches existing presigned.ts comment about Supabase S3 compat).
      - For `supabase`: throw `new Error('Supabase storage provider not yet implemented')` — TODO stub.
    - `async function getAttachmentDownloadUrl(storageKey: string): Promise<string>` — 15-min expiry, `ResponseContentDisposition: 'inline'`. Re-uses the s3Client singleton from `s3-client.ts`.
    - `async function deleteAttachmentObject(storageKey: string): Promise<void>` — `DeleteObjectCommand`.

    Import `s3Client` and `getBucketName` from `./s3-client`. Use `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` (already in package.json — verify by reading presigned.ts).

    **API route — POST/GET `/api/driver-pay/assignments/[assignmentId]/components/[componentId]/attachments/route.ts`**

    Pattern to mirror: `apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/route.ts` (auth, role, PAID guard, getTenantPrisma).

    `GET` (list attachments for a component):
    - `getSession()` → 401 if missing
    - `getTenantPrisma()`
    - Load assignment by `assignmentId`, deletedAt: null. 404 if missing.
    - Driver role: if `assignment.driverId !== session.userId` → return **404** (not 403) per spec "cross-tenant access returns 404".
    - Load component by `componentId`, deletedAt: null, `assignmentId` matches. 404 if missing (this also covers the cross-tenant component_id guess case).
    - Return `prisma.payComponentAttachment.findMany({ where: { componentId, deletedAt: null }, orderBy: { createdAt: 'desc' } })`.
    - Serialize: `{ id, componentId, filename, contentType, sizeBytes, uploadedBy, createdAt }`. **Do NOT include storageKey** in the response (defense-in-depth — client only ever gets download URLs).

    `POST` accepts `?action=presign` or `?action=confirm` via query string (single route for both steps keeps file count low; if you prefer, split into `/attachments/presign/route.ts` and `/attachments/confirm/route.ts` — either is fine).

    `POST ?action=presign`:
    - `applyRateLimit(uploadLimiter, tenantId)` — 429 on limit.
    - Zod-validate body: `{ filename: string (1..255), contentType: string, sizeBytes: number }`.
    - Allow-list MIME: `['image/jpeg', 'image/png', 'image/heic', 'application/pdf']`. Reject 400 otherwise.
    - Max size: `10 * 1024 * 1024` bytes (10MB). Reject 400 if larger.
    - Re-check assignment + component access (same checks as GET).
    - PAID guard on assignment → 409.
    - Compute `ext` from contentType: jpeg→jpg, png→png, heic→heic, pdf→pdf.
    - Call `getAttachmentUploadUrl({ tenantId, componentId, ext, contentType })`.
    - Return `{ uploadUrl, storageKey, expiresIn: 900 }`.

    `POST ?action=confirm`:
    - Zod-validate body: `{ storageKey: string, filename: string, contentType: string, sizeBytes: number }`.
    - Defense check: `storageKey.startsWith(\`${tenantId}/components/${componentId}/\`)` → 403 otherwise (mirrors documents/complete-upload pattern).
    - PAID guard on assignment → 409.
    - `prisma.payComponentAttachment.create({ data: { tenantId, componentId, assignmentId, storageKey, filename, contentType, sizeBytes, uploadedBy: session.userId, createdBy: session.userId } })`.
    - Return `{ attachment: serialized }` with 201 status.

    **API route — DELETE `/api/.../attachments/[attachmentId]/route.ts`**

    - Standard auth/tenant chain.
    - Load attachment by `id`, deletedAt: null, `componentId` matches. **Return 404 if missing or already soft-deleted** (the spec requires soft-deleted attachments to 404 on subsequent fetches).
    - Load assignment via attachment.assignmentId. PAID guard → 409.
    - Driver role: only allow delete if `attachment.uploadedBy === session.userId` (driver who uploaded can remove their own). Otherwise 404.
    - `prisma.payComponentAttachment.update({ where: { id }, data: { deletedAt: new Date() } })`.
    - Leave a `// TODO: daily cleanup job removes storage object` comment near the soft-delete line.
    - Return `{ success: true }`.

    **API route — GET `/api/.../attachments/[attachmentId]/download-url/route.ts`**

    - Standard auth/tenant chain.
    - Load attachment with deletedAt: null check → **404** if missing/deleted.
    - Verify chain: attachment.componentId → component → assignment → tenant. Cross-tenant or driver-not-assigned → **404** (not 403, per spec).
    - Call `getAttachmentDownloadUrl(attachment.storageKey)`.
    - Set response header `Cache-Control: no-store, must-revalidate`.
    - Return `{ url, expiresIn: 900 }`.

    **Tests (`apps/web/src/app/api/driver-pay/__tests__/attachments-api.test.ts`)**

    Mirror the existing test style from `components-api.test.ts` (vi.mock hoisting, mock `getSession`/`getTenantPrisma`). Cover the four spec requirements:

    1. **Tenant B gets 404 for tenant A's attachment URL** — mock attachment with tenantId=A, session tenantId=B, call download-url handler, assert 404.
    2. **Cross-tenant component_id guess fails** — POST presign with valid componentId from another tenant (mock `findFirst` to return null for the tenant-scoped prisma), assert 404.
    3. **File type validation rejects invalid MIME** — POST presign with `contentType: 'application/x-msdownload'`, assert 400.
    4. **Soft-delete: subsequent fetches 404** — mock attachment with `deletedAt: new Date()`, call GET download-url, assert 404.

    5. **(Bonus) PAID 409 on presign** — assignment with payStatus PAID, assert 409.

    All tests use `expect().toBe()` / `toEqual()` — no `toBeCloseTo`. Pattern: `vi.mock('@/lib/auth/supabase', () => ({ getSession: vi.fn() }))`.

    **Verify ext mapping** — heic uses `.heic` extension; jpeg uses `.jpg` (not `.jpeg`).
  </action>
  <verify>
    cd apps/web && npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E "attachments|driver-pay/assignments" — zero new errors.
    cd apps/web && npm test -- attachments-api — all 5 tests pass.
    Manually: hit `POST /api/driver-pay/assignments/{id}/components/{cid}/attachments?action=presign` with valid body via curl using a session cookie — receive `{ uploadUrl, storageKey, expiresIn: 900 }`. Inspect storageKey matches `{tenantId}/components/{componentId}/{uuid}.{ext}`.
  </verify>
  <done>
    Storage abstraction file exists at `apps/web/src/lib/storage/attachments.ts` with three exported async functions.
    Four API route files exist under the correct nested path.
    All five tests pass in `attachments-api.test.ts`.
    Zero new TypeScript errors via `tsc --noEmit`.
    Cross-tenant access returns 404 (not 403) verified in tests.
  </done>
</task>

<task type="auto">
  <name>Task 2: Web uploader/list UI + wire into reimbursement rows</name>
  <files>
    apps/web/src/components/driver-pay/attachment-uploader.tsx,
    apps/web/src/components/driver-pay/attachment-list.tsx,
    apps/web/src/components/driver-pay/pay-components-list.tsx
  </files>
  <action>
    **`attachment-uploader.tsx`** — Client component (`'use client'`).

    Props: `{ assignmentId: string; componentId: string; payStatus: string; onUploaded: (attachment: SerializedAttachment) => void }`.

    Type: `type SerializedAttachment = { id: string; componentId: string; filename: string; contentType: string; sizeBytes: number; uploadedBy: string; createdAt: string }`.

    State: `uploads: { id: string; filename: string; progress: number; error?: string }[]`.

    Behavior:
    - Render a dashed-border drop zone using Tailwind: `border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors` with `data-dragover` toggle to `border-primary bg-primary/5`. Show text exactly: "No receipts uploaded. Drag a photo or PDF here, or click to browse."
    - Hidden `<input type="file" multiple accept="image/jpeg,image/png,image/heic,application/pdf" />` triggered by zone click.
    - On drop/select: for each file (max 10MB; reject with toast "File too large — max 10MB" if larger):
      1. Add to `uploads` state with id = `crypto.randomUUID()`, progress = 0.
      2. `POST /api/driver-pay/assignments/{assignmentId}/components/{componentId}/attachments?action=presign` with `{ filename, contentType, sizeBytes }`.
      3. PUT directly to `uploadUrl` using `fetch` with `XMLHttpRequest` (for progress events — needed for per-file progress bar). Update progress as upload proceeds.
      4. POST `?action=confirm` with `{ storageKey, filename, contentType, sizeBytes }`.
      5. On success: call `onUploaded(attachment)`, remove from `uploads`.
      6. On error: set `uploads[i].error` and show toast: "Something went wrong while saving the receipt. Try again in a moment." (exact Pattern D text per spec).
    - Render `uploads` list below drop zone with filename + progress bar + error state.
    - If `payStatus === 'PAID'`: drop zone disabled with muted styling + tooltip "Paid — attachments locked".

    Use `toast` from `sonner` (already in use per `pay-components-list.tsx`).

    **`attachment-list.tsx`** — Client component.

    Props: `{ assignmentId: string; componentId: string; payStatus: string; attachments: SerializedAttachment[]; onChanged: (next: SerializedAttachment[]) => void }`.

    Behavior:
    - For each attachment, render a card with:
      - Thumbnail (≥80×80) — for `image/*` contentType: lazy-load by clicking, request download URL via `GET /api/.../attachments/{id}/download-url`, render `<img>`. For `application/pdf`: render a file icon (use `FileText` from `lucide-react`) sized to 80×80.
      - Filename truncated to ~30 chars, sizeBytes formatted (KB/MB).
      - Click image → open in a modal (use shadcn `Dialog`) at full size; PDF → open download URL in new tab.
      - Delete button (`X` icon, ≥44×44 touch target) → confirm via `confirm()` → DELETE `/api/.../attachments/{id}` → call `onChanged(filteredList)`. Disabled if `payStatus === 'PAID'`.
    - Empty state: render nothing — let parent show empty drop zone only.
    - All images: `≥80×80` per spec. Use `loading="lazy"` and `next/image` with `unoptimized` (download URLs are signed, not on a CDN).

    **Wire into `pay-components-list.tsx`**

    Read the existing file. Find the REIMBURSEMENT category row rendering (after line ~195, inside the row map). Currently reimbursement components render the same as other rows. Add:

    1. Add to local state: `attachmentsByComponent: Record<string, SerializedAttachment[]>` — initially empty; populate lazily on row expand.
    2. Track `expandedComponentId: string | null`.
    3. For REIMBURSEMENT category rows: add a `<button>` chevron at the end of the row that toggles `expandedComponentId`. When `componentId === expandedComponentId`, render an additional `<tr><td colSpan={4}>` row below containing:
       - If `attachmentsByComponent[id]` is undefined, fetch via `GET /api/.../attachments` (set state).
       - Render `<AttachmentList ... />` + `<AttachmentUploader onUploaded={a => setAttachmentsByComponent(...)} />`.
    4. Add a warning chip on each REIMBURSEMENT row when `attachmentsByComponent[id]?.length === 0` (or undefined before first fetch — show it by default until we know otherwise): a small yellow badge "No receipt" with `text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-200`. Clicking the chip should also expand the row.

    Do NOT add a "must attach receipt" validation — spec says: "Reimbursement without attachments still saves but shows warning chip."

    **DO NOT modify `add-component-modal.tsx`** in this task. Receipts attach to existing components only; user adds the reimbursement first, then expands and uploads. (Simpler flow + the modal already saves before we have a componentId.)
  </action>
  <verify>
    cd apps/web && npx tsc --noEmit 2>&1 | grep -E "attachment-uploader|attachment-list|pay-components-list" — zero new errors.
    Manual: visit `/owner/loads/{loadId}/driver-pay` (or wherever PayComponentsList is rendered), add a reimbursement component, expand its row, drop a 1MB JPG, observe progress bar reaches 100% and thumbnail appears. Click thumbnail → opens in modal. Click delete → confirm → row disappears. Refresh → row stays gone.
    Test 10MB file → rejection toast. Test .docx → rejection toast.
  </verify>
  <done>
    `attachment-uploader.tsx` renders the spec empty-state text, drag-drop works, per-file progress shows, 10MB limit enforced client-side.
    `attachment-list.tsx` renders ≥80×80 thumbnails for images, file icons for PDFs, click-to-expand modal works.
    Reimbursement rows in `pay-components-list.tsx` show "No receipt" warning chip when empty, expand to show uploader+list.
    Existing non-reimbursement components unaffected.
  </done>
</task>

<task type="auto">
  <name>Task 3: Mobile receipt capture + upload helper</name>
  <files>
    apps/mobile/components/driver-pay/ReceiptCapture.tsx,
    apps/mobile/lib/driver-pay/uploadReceipt.ts
  </files>
  <action>
    **`apps/mobile/lib/driver-pay/uploadReceipt.ts`**

    Export: `async function uploadReceipt(params: { assignmentId: string; componentId: string; uri: string; filename: string; contentType: string }): Promise<{ id: string; filename: string }>`.

    Flow:
    1. Read file as binary blob using `FileSystem` from `expo-file-system` (already installed per existing patterns) → `await FileSystem.getInfoAsync(uri)` to get sizeBytes.
    2. If sizeBytes > 2 * 1024 * 1024: compress using `ImageManipulator.manipulateAsync(uri, [], { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG })` — repeat until under 2MB or 3 attempts. Use `expo-image-manipulator` (verify it's in package.json; if not, add to action notes).
    3. If sizeBytes > 10 * 1024 * 1024 after compression: throw `new Error('Receipt too large — max 10MB')`.
    4. Use the api-client from `@drivecommand/api-client` (Bearer token attached automatically) to POST `presign`: `client.post('/api/driver-pay/assignments/{assignmentId}/components/{componentId}/attachments?action=presign', { filename, contentType, sizeBytes })`. Note: api-client routes to the web backend.
    5. PUT to the returned `uploadUrl` using `fetch` with the file blob as body and `Content-Type` header. Native `fetch` on RN supports `body: { uri, type, name }` form OR direct blob via `FileSystem.uploadAsync(uploadUrl, uri, { httpMethod: 'PUT', uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT, headers: { 'Content-Type': contentType } })`. **Use `FileSystem.uploadAsync`** — works reliably on RN 0.76 for large files.
    6. POST `confirm`: `client.post('...attachments?action=confirm', { storageKey, filename, contentType, sizeBytes })`.
    7. Return the created attachment.

    Handle errors at each step — throw with descriptive messages so the UI can show "Something went wrong while saving the receipt. Try again in a moment."

    **`apps/mobile/components/driver-pay/ReceiptCapture.tsx`**

    Props: `{ assignmentId: string; componentId: string; onUploaded: (attachment: { id: string; filename: string }) => void; onCancel: () => void }`.

    Behavior — three states tracked via `mode: 'choose' | 'camera' | 'preview' | 'uploading'`:

    1. **'choose'**: Initial screen. Two big buttons (≥44px touch targets, `haptics.medium()` on press):
       - "Take Photo" → request camera permissions via `Camera.requestCameraPermissionsAsync()` from `expo-camera`. If granted → mode='camera'. If denied → toast/Alert.
       - "Choose from Library" → `ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.8 })` from `expo-image-picker`. On result: set capturedUri → mode='preview'.
       - "Cancel" → `onCancel()`.

    2. **'camera'**: Full-screen `<CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />` from `expo-camera`. Auto-rotate is handled by `CameraView` automatically. Bottom-center shutter button (large white circle, ≥64×64px, `haptics.heavy()` on press) calls `cameraRef.current.takePictureAsync({ quality: 0.8 })`. On result: set capturedUri → mode='preview'. Top-left "Cancel" → mode='choose'.

    3. **'preview'**: Full-screen `<Image source={{ uri: capturedUri }} contentFit="contain" />` using `expo-image`. Two buttons at bottom:
       - "Retake" → mode='camera'.
       - "Use" → mode='uploading' → call `uploadReceipt(...)` → on success `onUploaded(result)`; on error Alert with Pattern D message + return to mode='preview'.

    4. **'uploading'**: Show preview image dimmed + centered `ActivityIndicator` + "Uploading receipt…" text.

    Use `useThemeColors()` from `@/hooks/useThemeColors` for all colors per mobile conventions. Use `haptics` helper.

    Determine `filename` as `receipt-${Date.now()}.jpg`. Determine `contentType` as `'image/jpeg'`. (HEIC handling not needed for v1 — expo-camera defaults to JPEG.)

    Verify `expo-camera`, `expo-image-picker`, `expo-image-manipulator`, `expo-file-system`, and `expo-image` are in `apps/mobile/package.json`. If `expo-image-manipulator` is missing, add it to the action as a manual `npm i` step note in the final summary (don't run npm install in this task — leave for execute-phase).

    **DO NOT** wire `ReceiptCapture` into a specific screen in this task — that wiring requires a host screen (driver reimbursement add flow) that doesn't exist yet on mobile. Leave a `// USAGE:` JSDoc block at the top of `ReceiptCapture.tsx` showing example integration. A follow-up quick task will wire this into the driver portal "add reimbursement" flow.
  </action>
  <verify>
    cd apps/mobile && npx tsc --noEmit 2>&1 | grep -E "ReceiptCapture|uploadReceipt" — zero new errors.
    Both files exist and export their declared APIs.
    Visual smoke test (optional, time permitting): import `ReceiptCapture` into a temporary debug screen, run on Android emulator with `cd apps/mobile && npx expo start`, take a photo, observe preview state, tap "Use", verify a row appears in the web owner UI for the same component.
  </verify>
  <done>
    `uploadReceipt.ts` exports a working two-step upload function (presign + PUT + confirm).
    `ReceiptCapture.tsx` exports a React component with three modes (choose/camera/preview/uploading) using expo-camera + expo-image-picker.
    Touch targets ≥44px confirmed via inline comments.
    Zero new mobile TypeScript errors.
    JSDoc `// USAGE:` block present for future wiring.
  </done>
</task>

</tasks>

<verification>
- Web typecheck clean: `cd apps/web && npx tsc --noEmit` shows no new errors.
- Mobile typecheck clean: `cd apps/mobile && npx tsc --noEmit` shows no new errors.
- Tests pass: `cd apps/web && npm test -- attachments-api` — 5/5 pass.
- Cross-tenant access returns 404 (not 403) — covered by test.
- Soft-deleted attachment returns 404 — covered by test.
- Invalid MIME rejected — covered by test.
- Web manual: upload a JPG to a reimbursement component, see thumbnail; delete it, see warning chip return.
- Storage key format verified: `{tenantId}/components/{componentId}/{uuid}.{ext}`.
- 15-min expiry on presigned URLs (assert in code).
- 10MB client-side limit enforced.
- Mobile: `ReceiptCapture` component compiles and exports correctly. Live capture test deferred to follow-up wiring task.
</verification>

<success_criteria>
- All three tasks complete with their <done> criteria met.
- Storage abstraction layer in place — switching to Supabase Storage in the future requires only implementing the three functions in `attachments.ts` for the `'supabase'` provider.
- Web owner can upload, view, and delete receipts on reimbursement components.
- Mobile driver portal has reusable `ReceiptCapture` component ready for wiring into the add-reimbursement flow (follow-up task).
- All cross-tenant access returns 404, not 403.
- All five tests in `attachments-api.test.ts` pass.
- Zero new TypeScript errors in web or mobile.
</success_criteria>

<output>
After completion, create `.planning/quick/300-driver-pay-phase-5-receipt-attachments-w/300-SUMMARY.md` documenting:
- Final file paths and counts (LOC per file)
- Storage key format used
- Any deviations from this plan (e.g., split the POST route into two files for clarity)
- Confirmation that `expo-image-manipulator` was/wasn't already installed (and `npm i` step needed if not)
- Reference to the follow-up wiring task needed to expose `ReceiptCapture` on the driver portal's reimbursement add flow
- Tests added (count + names)
- Commits made
</output>
