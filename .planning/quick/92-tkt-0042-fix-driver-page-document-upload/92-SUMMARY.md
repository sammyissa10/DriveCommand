---
phase: quick-92
plan: "01"
subsystem: documents
tags:
  - mobile
  - file-upload
  - bug-fix
  - validation
dependency_graph:
  requires: []
  provides:
    - mobile-compatible-driver-document-upload
  affects:
    - src/components/documents/driver-document-upload.tsx
    - src/lib/storage/validate.ts
    - src/app/(owner)/actions/ai-documents.ts
tech_stack:
  added: []
  patterns:
    - magic-bytes-as-source-of-truth
    - extension-fallback-for-mobile-mime
key_files:
  modified:
    - src/components/documents/driver-document-upload.tsx
    - src/lib/storage/validate.ts
decisions:
  - Magic bytes detection is the security gate; browser MIME type is treated as unreliable hint on mobile
  - HEIC/HEIF pass-through on both client and server since iOS auto-converts to JPEG before bytes reach the server
  - ai-documents.ts inherits the server-side fix without any code change needed
metrics:
  duration: "~2 minutes"
  completed: "2026-03-22"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
---

# Phase quick-92 Plan 01: TKT-0042 Fix Driver Page Document Upload Summary

**One-liner:** Mobile document upload fixed by adding MIME extension fallback on client and MOBILE_PASSTHROUGH_TYPES list on server, keeping magic bytes as the real security gate.

## What Was Built

Fixed TKT-0042: Driver page document upload was failing on mobile devices due to two MIME type validation failures:

1. **Client-side**: `ALLOWED_TYPES.includes(file.type)` rejected files where `file.type` was empty (Android gallery), `image/heic`, or `image/heif` (iOS camera).
2. **Server-side**: Strict `detected.mime !== claimedType` check rejected uploads where iOS auto-converted HEIC to JPEG or Android reported an empty/generic MIME type.

### Fix Summary

**`driver-document-upload.tsx`** — Client-side:
- Added `MOBILE_EXTRA_TYPES = ['image/heic', 'image/heif', '']` to pass files with non-standard mobile MIME types
- Added extension fallback: when `file.type` is not in allowed list, check file extension against `ALLOWED_EXTENSIONS`
- Extended `ALLOWED_EXTENSIONS` to include `.heic` and `.heif`
- Updated file input `accept` attribute to include `image/heic,image/heif` so iOS shows camera roll photos

**`validate.ts`** — Server-side:
- Added `MOBILE_PASSTHROUGH_TYPES = ['', 'image/heic', 'image/heif', 'application/octet-stream']`
- Mismatch check now skips when `claimedType` is in the passthrough list — magic bytes detection is the authoritative source of truth
- Actual spoofing (e.g., claiming `application/pdf` but bytes are `image/jpeg`) is still rejected
- Both `driver-documents.ts` and `ai-documents.ts` callers benefit from the fix

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix client-side file type validation for mobile browsers | 8aca717 | src/components/documents/driver-document-upload.tsx |
| 2 | Fix server-side MIME type mismatch rejection | af08139 | src/lib/storage/validate.ts |

## Decisions Made

1. **Magic bytes as security gate** — The `file.type` value from the browser is explicitly treated as an unreliable hint. Only the magic bytes detection result determines whether the content type is allowed.

2. **HEIC pass-through** — Even though HEIC is not in `ALLOWED_TYPES`, it is allowed through the mismatch check because iOS auto-converts HEIC to JPEG before the bytes reach the server. The magic bytes detector will see `image/jpeg` and allow it.

3. **Empty string and octet-stream pass-through** — Android and some other mobile browsers report `""` or `application/octet-stream` for camera/gallery images. These are passed through to magic bytes validation rather than rejected at the MIME check.

4. **No change to ai-documents.ts** — The server-side fix in `validate.ts` is shared. No callers needed to be updated.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `src/components/documents/driver-document-upload.tsx` — modified, committed 8aca717
- `src/lib/storage/validate.ts` — modified, committed af08139
- `npx tsc --noEmit` — passed (no errors)
- `npm run build` — passed
- `validateFileType` callers: only `driver-documents.ts` and `ai-documents.ts` — both benefit from the fix
