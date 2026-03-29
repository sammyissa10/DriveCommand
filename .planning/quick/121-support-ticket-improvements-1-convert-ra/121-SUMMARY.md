---
phase: quick-121
plan: "01"
subsystem: mobile-support
tags: [mobile, support-tickets, image-picker, s3-upload, ux]
dependency_graph:
  requires: []
  provides: [screenshot-upload-endpoint, page-label-mapping]
  affects: [SupportTicketFAB, support-ticket-api, api-client]
tech_stack:
  added: [expo-image-picker]
  patterns: [presigned-s3-upload, pathname-to-label-mapping]
key_files:
  created:
    - apps/web/src/app/api/mobile/support/upload-screenshot/route.ts
  modified:
    - apps/mobile/components/shared/SupportTicketFAB.tsx
    - apps/web/src/app/api/mobile/support/ticket/route.ts
    - packages/api-client/src/index.ts
    - packages/api-client/src/driver.ts
decisions:
  - Pathname label included alongside raw path in fromPage field (e.g. '/(owner) (Dashboard)') to preserve debuggability while improving admin readability
  - uploadPhaseRef used (not state) for submit button label to avoid re-render race during async upload
  - X icon uses lucide-react-native X component instead of a text character for consistency
metrics:
  duration: "12 minutes"
  completed: "2026-03-29"
  tasks_completed: 2
  files_changed: 5
---

# Quick-121: Support Ticket Improvements — Page Labels & Screenshot Attachment

**One-liner:** Pathname-to-label mapping for all owner/driver routes plus expo-image-picker screenshot attachment with S3 upload and screenshotKey persistence.

## What Was Built

### Task 1: Pathname mapping, upload endpoint, API + client updates

**`getPageLabel(pathname)`** — Ordered regex match table covering all known owner and driver routes. Maps dynamic segments (`[id]` params) via `[^/]+` patterns, checks most-specific routes first. Falls back to capitalize-and-join for unknown paths.

**`fromPage` format** — Now sent as `` `${pathname} (${label})` `` so raw path is preserved for debugging but the label appears in the admin support view.

**Success toast** — `text2` changed from "We'll be in touch soon." to `` `Submitted from ${label}` ``.

**`POST /api/mobile/support/upload-screenshot`** — New presigned URL endpoint mirroring the incident photo upload pattern. No driver role check (both owner and driver portals use the FAB). Allows image/jpeg, image/jpg, image/png up to 10MB. Uses `'support'` as the S3 prefix.

**Ticket API** — `screenshotKey: z.string().optional()` added to schema. Only written to DB when provided.

**api-client** — `screenshotKey?: string` added to `createSupportTicket` data type in both `packages/api-client/src/index.ts` and `packages/api-client/src/driver.ts`.

### Task 2: Screenshot attachment UI in SupportTicketFAB

**"Attach Screenshot" button** — Camera icon + text, secondary/outline style, appears between description and submit. Tapping shows `Alert.alert` with "Take Photo", "Choose from Gallery", "Cancel".

**Permission handling** — `requestCameraPermissionsAsync` for camera, `requestMediaLibraryPermissionsAsync` for gallery. If denied, shows a toast error.

**Image picker config** — `mediaTypes: 'images'`, `quality: 0.7`, `allowsEditing: false`.

**Thumbnail preview** — 120px tall `Image` with rounded corners and slate border. X button (absolute positioned, top-right) clears the selection.

**`uploadScreenshot()` helper** — Local async function using `expo-file-system/legacy` to get file info and read as base64, POSTs to `/api/mobile/support/upload-screenshot` for presigned URL, then PUTs bytes to S3.

**Submit flow** — If screenshot attached: upload first, get `s3Key`, pass as `screenshotKey` to `createSupportTicket`. `uploadPhaseRef` tracks upload phase to show "Uploading screenshot..." on the button without triggering extra re-renders.

**Form reset** — `screenshotUri: null` is part of `DEFAULT_FORM`, so `handleClose` and `onSuccess` automatically clear the screenshot.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

### Files exist

- `apps/web/src/app/api/mobile/support/upload-screenshot/route.ts` — FOUND
- `apps/mobile/components/shared/SupportTicketFAB.tsx` — FOUND (modified)
- `apps/web/src/app/api/mobile/support/ticket/route.ts` — FOUND (modified)
- `packages/api-client/src/index.ts` — FOUND (modified)
- `packages/api-client/src/driver.ts` — FOUND (modified)

### Commits exist

- `efe7af8` — feat(quick-121): add page label mapping and screenshot attachment to SupportTicketFAB

### TypeScript

- Web: no errors introduced (clean build)
- Mobile: no new errors; pre-existing FlashList/ExternalLink type errors unrelated to this task

## Self-Check: PASSED
