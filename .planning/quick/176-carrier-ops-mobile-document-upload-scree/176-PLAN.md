---
phase: quick-176
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/mobile/components/carrier/StopDocumentUpload.tsx
  - apps/mobile/app/(driver)/carrier/dispatch/[id]/stop/[stopId]/upload.tsx
  - apps/mobile/app/(driver)/carrier/dispatch/[id]/stop/[stopId].tsx
  - apps/web/src/app/api/mobile/carrier/driver/stops/[stopId]/documents/route.ts
autonomous: true
must_haves:
  truths:
    - "Driver can tap Upload on a stop and reach the upload screen"
    - "Driver can take a photo or pick from gallery for BOL/POD"
    - "Driver can pick a PDF via document picker"
    - "Driver sees upload progress and success confirmation"
    - "Offline driver gets file saved locally with reconnect flush"
  artifacts:
    - path: "apps/mobile/components/carrier/StopDocumentUpload.tsx"
      provides: "Camera/gallery/document picker + preview + upload + offline queue"
    - path: "apps/mobile/app/(driver)/carrier/dispatch/[id]/stop/[stopId]/upload.tsx"
      provides: "Upload screen with route params"
    - path: "apps/web/src/app/api/mobile/carrier/driver/stops/[stopId]/documents/route.ts"
      provides: "POST endpoint for stop document upload"
  key_links:
    - from: "apps/mobile/app/(driver)/carrier/dispatch/[id]/stop/[stopId].tsx"
      to: "upload.tsx"
      via: "router.push with documentType param"
      pattern: "router\\.push.*upload"
    - from: "StopDocumentUpload.tsx"
      to: "carrierDriverApi.uploadStopDocument"
      via: "FormData POST"
      pattern: "carrierDriverApi\\.uploadStopDocument"
---

<objective>
Build the mobile document upload screen for carrier stop BOLs and PODs.

Purpose: Drivers need to capture and upload proof-of-delivery (POD) and bill-of-lading (BOL) documents at stops. This replaces the placeholder "Upload Document" button on the stop detail screen with a full upload flow including camera, gallery, document picker, preview, progress, and offline support.

Output: Working upload screen navigable from stop detail, with backend API route to receive uploads.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/mobile/app/(driver)/carrier/dispatch/[id]/stop/[stopId].tsx — stop detail screen with placeholder upload button
@apps/mobile/components/driver/DocumentUploadSheet.tsx — existing upload pattern (camera, gallery, progress bar, R2 upload) to replicate
@packages/api-client/src/carrier-driver.ts — carrierDriverApi.uploadStopDocument already defined (POST /api/mobile/carrier/driver/stops/{stopId}/documents)
@apps/mobile/lib/offline-queue.ts — MMKV offline queue pattern
@apps/mobile/lib/storage.ts — kvStorage for MMKV persistence
@apps/mobile/constants/tokens.ts — useThemeColors
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create stop document upload API route and StopDocumentUpload component</name>
  <files>
    apps/web/src/app/api/mobile/carrier/driver/stops/[stopId]/documents/route.ts
    apps/mobile/components/carrier/StopDocumentUpload.tsx
  </files>
  <action>
**API Route** (`apps/web/src/app/api/mobile/carrier/driver/stops/[stopId]/documents/route.ts`):
Create a POST handler that:
- Validates Bearer token via `validateMobileToken` (import from the same pattern used in other carrier driver routes like `apps/web/src/app/api/mobile/carrier/driver/dispatches/route.ts`)
- Accepts multipart FormData with fields: `file` (the uploaded file), `documentType` (string: 'bol' | 'pod')
- Validates the stop belongs to a dispatch assigned to the authenticated driver's tenant
- Uploads file to R2 using the same presigned URL / direct upload pattern as existing document routes (check `apps/web/src/app/api/mobile/driver/documents/route.ts` for the R2 upload pattern)
- Creates a record in the database linking the document to the stop (use the CarrierStopDocument model pattern from the dispatch detail query)
- Returns the created document object as JSON
- Add Upstash rate limiting (same pattern as other `/api/mobile/carrier/*` routes)

**StopDocumentUpload Component** (`apps/mobile/components/carrier/StopDocumentUpload.tsx`):
Model after the existing `DocumentUploadSheet.tsx` pattern but as a full-screen component (not a modal). Props: `{ stopId: string, dispatchId: string, documentType: 'bol' | 'pod' }`.

Step 1 — Source selection:
- Three large pressable cards in a column: "Take Photo" (Camera icon), "Choose from Gallery" (Image icon), "Choose PDF" (FileText icon)
- Take Photo: `ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.8 })`
- Choose from Gallery: `ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8 })`
- Choose PDF: `DocumentPicker.getDocumentAsync({ type: 'application/pdf' })`
- Request permissions before camera/gallery (same pattern as DocumentUploadSheet.tsx)
- Use `getInfoAsync` from `expo-file-system/legacy` for file size

Step 2 — Preview:
- Show image thumbnail (expo-image) or file name + size for PDFs
- "Retake / Change" button to go back to step 1
- File name and size displayed below preview

Step 3 — Upload:
- "Upload BOL" or "Upload POD" button (based on documentType prop)
- Before uploading, check `NetInfo.fetch()` for connectivity
- **Online path:** Build FormData with the file (use `readAsStringAsync` + base64 conversion pattern from DocumentUploadSheet.tsx), call `carrierDriverApi.uploadStopDocument(token, stopId, documentType, formData)`. Show progress bar (simulated: 0% -> 30% preparing, 30% -> 80% uploading, 80% -> 100% saving). On success: green checkmark icon + "Uploaded successfully" text + `Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)`, then auto-navigate back via `router.back()` after 1.5s timeout.
- **Offline path:** Store file info in MMKV via `kvStorage.setObject('carrier_pending_upload_${stopId}_${documentType}', { uri, name, size, mimeType, stopId, documentType, timestamp: Date.now() })`. Show "Saved offline — will upload when connected" message with an orange info icon. Auto-navigate back after 2s.
- **Error path:** Red error message + "Retry" button that re-triggers upload
- On failure toast via `react-native-toast-message`

Offline reconnect flush: Add a `useEffect` that listens to `NetInfo.addEventListener` — when connectivity returns, check for any `carrier_pending_upload_*` keys in MMKV storage and attempt upload. This can be a simple check inside the component or a standalone utility. Keep it simple — iterate known keys pattern `carrier_pending_upload_${stopId}_${documentType}`.

Style: Use `useThemeColors()` throughout. StyleSheet.create at bottom. Match the visual language of the stop detail screen (SectionCard style, rounded corners, brand color for primary actions).
  </action>
  <verify>
    Run `cd apps/mobile && npx tsc --noEmit 2>&1 | head -30` to check for TypeScript errors in the new files.
    Verify the API route file exists: `ls apps/web/src/app/api/mobile/carrier/driver/stops/\[stopId\]/documents/route.ts`
    Verify the component file exists: `ls apps/mobile/components/carrier/StopDocumentUpload.tsx`
  </verify>
  <done>
    StopDocumentUpload component renders 3-step flow (source selection, preview, upload) with online/offline handling. API route accepts FormData POST and stores document.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create upload screen route and wire stop detail navigation</name>
  <files>
    apps/mobile/app/(driver)/carrier/dispatch/[id]/stop/[stopId]/upload.tsx
    apps/mobile/app/(driver)/carrier/dispatch/[id]/stop/[stopId].tsx
  </files>
  <action>
**upload.tsx** (`apps/mobile/app/(driver)/carrier/dispatch/[id]/stop/[stopId]/upload.tsx`):
- Read route params: `id` (dispatchId), `stopId` from path, `documentType` from search params (query param)
- `useLocalSearchParams<{ id: string; stopId: string; documentType: 'bol' | 'pod' }>()`
- SafeAreaView with background color from `useThemeColors()`
- Header: back button (ChevronLeft) + title "Upload BOL" or "Upload POD" based on documentType param (default to "Upload Document" if missing)
- Render `<StopDocumentUpload stopId={stopId} dispatchId={id} documentType={documentType || 'pod'} />` as the main content
- Wrap in `<AnimatedScreen>`

**Wire stop detail** (`[stopId].tsx`):
- Replace `handleUploadDocument` function body. Instead of `Alert.alert('Coming Soon', ...)`, navigate to the upload screen:
  ```
  const docType = stop.stopType.toLowerCase() === 'pickup' ? 'bol' : 'pod'
  router.push(`/carrier/dispatch/${id}/stop/${stopId}/upload?documentType=${docType}`)
  ```
- Update the upload button label from "Upload Document" to "Upload BOL" for pickup stops or "Upload POD" for delivery/other stops
- Keep the Camera icon
  </action>
  <verify>
    Run `cd apps/mobile && npx tsc --noEmit 2>&1 | head -30` — no errors in modified files.
    Grep for "Coming Soon" in stopId.tsx to confirm placeholder is removed: `grep "Coming Soon" apps/mobile/app/\(driver\)/carrier/dispatch/\[id\]/stop/\[stopId\].tsx` should return nothing (only the expense one remains).
  </verify>
  <done>
    Tapping "Upload BOL/POD" on stop detail navigates to the upload screen with correct documentType. Upload screen renders StopDocumentUpload with all params passed through.
  </done>
</task>

</tasks>

<verification>
- `cd apps/mobile && npx tsc --noEmit` passes with no new errors
- Stop detail screen no longer shows "Coming Soon" alert for document upload (expense alert is fine to keep)
- Upload screen route is reachable at `/carrier/dispatch/[id]/stop/[stopId]/upload`
- StopDocumentUpload component handles camera, gallery, PDF picker, preview, upload with progress, offline save
- API route exists at `/api/mobile/carrier/driver/stops/[stopId]/documents`
</verification>

<success_criteria>
- Driver can navigate from stop detail to upload screen
- Upload screen shows correct title (Upload BOL vs Upload POD) based on stop type
- Three source options work: camera (quality 0.8), gallery (quality 0.8), PDF document picker
- Preview step shows image or file info with retake option
- Online upload shows progress bar and success with haptic feedback + auto-back
- Offline scenario saves to MMKV and shows offline message
- API route validates token, accepts upload, stores document
</success_criteria>

<output>
After completion, create `.planning/quick/176-carrier-ops-mobile-document-upload-scree/176-SUMMARY.md`
</output>
