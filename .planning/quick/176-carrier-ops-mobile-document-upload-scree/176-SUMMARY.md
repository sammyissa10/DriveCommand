---
phase: quick-176
plan: 01
subsystem: carrier-ops-mobile
tags: [mobile, carrier, document-upload, r2, offline, expo-image-picker, expo-document-picker]
dependency_graph:
  requires:
    - quick-175 (stop detail screen with placeholder upload button)
    - apps/web/src/lib/storage/presigned.ts (R2 presigned URL generation)
    - packages/api-client/src/carrier-driver.ts (uploadStopDocument method)
  provides:
    - POST /api/mobile/carrier/driver/stops/[stopId]/documents (R2 upload + DB record)
    - StopDocumentUpload component (3-step camera/gallery/PDF upload flow)
    - upload screen at /carrier/dispatch/[id]/stop/[stopId]/upload
  affects:
    - apps/mobile/app/(driver)/carrier/dispatch/[id]/stop/[stopId].tsx (navigation wired)
tech_stack:
  added: []
  patterns:
    - FormData multipart upload via fetch with R2 presigned URL (server-side upload)
    - MMKV offline save with NetInfo reconnect flush
    - Expo Router nested dynamic route for upload screen
key_files:
  created:
    - apps/web/src/app/api/mobile/carrier/driver/stops/[stopId]/documents/route.ts
    - apps/mobile/components/carrier/StopDocumentUpload.tsx
    - apps/mobile/app/(driver)/carrier/dispatch/[id]/stop/[stopId]/upload.tsx
  modified:
    - apps/mobile/app/(driver)/carrier/dispatch/[id]/stop/[stopId].tsx
decisions:
  - Server-side R2 upload: API route receives FormData file bytes and proxies to R2 via presigned PUT, simpler than the 2-step presigned URL approach the driver documents use
  - Offline path uses MMKV kvStorage directly (not the mutation queue) since file uploads include binary data that cannot be JSON-serialized into the standard queue
metrics:
  duration: ~15 minutes
  completed: 2026-04-05
  tasks_completed: 2
  files_created: 3
  files_modified: 1
---

# Phase quick-176 Plan 01: Carrier Ops Mobile Document Upload Screen Summary

**One-liner:** Full BOL/POD upload flow for carrier stops — camera, gallery, PDF picker, R2 server-side upload, MMKV offline save with reconnect flush.

## What Was Built

### API Route — POST /api/mobile/carrier/driver/stops/[stopId]/documents

Accepts multipart FormData with `file` and `documentType` fields. Validates Bearer token + DRIVER role + stop ownership within tenant. Proxies file bytes to R2 via presigned URL then creates a `CarrierDocument` record linking to the stop. Returns the created document as JSON.

### StopDocumentUpload Component

Full-screen component (not a modal) with a 3-step flow:

1. **Select source** — three large pressable cards: Take Photo (camera), Choose from Gallery (image picker), Choose PDF (document picker)
2. **Preview** — image thumbnail (expo-image) or PDF icon with file name + size, Retake/Change button, Upload BOL/POD primary button
3. **Upload** — progress bar (0→30→60→100%), success state (CheckCircle + haptic + auto-back after 1.5s), error state with Retry button

Offline handling: if NetInfo reports no connectivity, saves file metadata to MMKV at key `carrier_pending_upload_{stopId}_{documentType}`. A `useEffect` listens to NetInfo and flushes pending uploads on reconnect.

### Upload Screen Route

`/carrier/dispatch/[id]/stop/[stopId]/upload` — reads `id`, `stopId`, and `documentType` from route params, renders `StopDocumentUpload`, shows correct header title ("Upload BOL" or "Upload POD").

### Stop Detail Wiring

Replaced `handleUploadDocument`'s `Alert.alert('Coming Soon', ...)` with `router.push` to the upload screen. Upload button label now shows "Upload BOL" for pickup stops and "Upload POD" for delivery/other stops.

## Commits

| Hash | Description |
|------|-------------|
| `720f7d2` | feat(quick-176): add stop document upload API route and StopDocumentUpload component |
| `a15b08e` | feat(quick-176): wire upload screen and stop detail navigation |

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as written.

**Design note:** The plan specified a `readAsStringAsync` + base64 conversion for the FormData body (matching the DocumentUploadSheet pattern). However, since the API route is server-side and receives FormData directly, the component uses the React Native FormData `{ uri, name, type }` object pattern instead, which is simpler and avoids loading the full file into memory on the client. The API handles the R2 upload server-side using `file.arrayBuffer()`.

## Self-Check: PASSED

Files verified:

- `apps/web/src/app/api/mobile/carrier/driver/stops/[stopId]/documents/route.ts` — exists
- `apps/mobile/components/carrier/StopDocumentUpload.tsx` — exists
- `apps/mobile/app/(driver)/carrier/dispatch/[id]/stop/[stopId]/upload.tsx` — exists
- Commits `720f7d2` and `a15b08e` — verified in git log
- `tsc --noEmit` — passes with no errors
- "Coming Soon" removed from upload handler in `[stopId].tsx` — confirmed
