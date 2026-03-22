---
phase: quick-93
plan: 01
subsystem: api, ui
tags: [mobile-upload, s3, multipart, content-type, heic, file-validation]

requires:
  - phase: quick-89
    provides: multipart upload infrastructure (initiate/complete endpoints, driver-document-upload component)

provides:
  - Extension-based content type fallback in multipart initiate endpoint
  - resolvedContentType returned in initiate response and used in complete call
  - HEIC/HEIF-specific error message in validateFileType
  - Improved S3 PUT error messages on mobile Safari (status code + body text)

affects: [mobile-upload, driver-documents, document-upload]

tech-stack:
  added: []
  patterns:
    - "Resolve MIME type from file extension when browser-reported type is empty/non-standard"
    - "Return server-resolved content type in upload initiation responses for downstream use"
    - "Read S3 error response body for cross-origin error details on mobile"

key-files:
  created: []
  modified:
    - src/app/api/documents/multipart/initiate/route.ts
    - src/components/documents/driver-document-upload.tsx
    - src/lib/storage/validate.ts

key-decisions:
  - "Extension fallback covers pdf/jpg/jpeg/png only — HEIC not in fallback since it requires conversion"
  - "HEIC/HEIF check placed before generic ALLOWED_TYPES check in validateFileType so the specific guidance message is shown"
  - "S3 PUT error reads response body text before falling back to statusText to handle mobile Safari empty statusText"

patterns-established:
  - "resolvedContentType pattern: initiate endpoint resolves type, returns it, component uses it for complete call"

duration: 8min
completed: 2026-03-22
---

# Quick Task 93: TKT-0042 Follow-up — Fix Remaining Mobile Upload Bugs

**Extension-based MIME resolution in multipart initiate, HEIC-specific validation message, and improved S3 PUT error detail for mobile Safari empty statusText.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-22T17:39:00Z
- **Completed:** 2026-03-22T17:47:37Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Multipart initiate endpoint now resolves content type from file extension when browser reports empty or non-standard MIME (Android gallery returns `""`, iOS may return `image/heic`)
- `resolvedContentType` added to initiate JSON response and used in the large file complete call — eliminates the mismatch between browser-reported type and what was registered with S3
- HEIC/HEIF files detected by magic bytes now return an actionable message guiding users to convert to JPEG/PNG, instead of the generic "type not allowed" message
- Small file S3 PUT failure on mobile Safari (where `statusText` is empty for cross-origin responses) now includes the HTTP status code and response body text

## Task Commits

1. **Task 1: Content type resolution + HEIC validation message** - `50cb553` (fix)
2. **Task 2: resolvedContentType in complete call + better S3 PUT error** - `f21bee2` (fix)

**Plan metadata:** `9cc90d0` (docs: complete plan)

## Files Created/Modified

- `src/app/api/documents/multipart/initiate/route.ts` — Added `EXTENSION_MIME_MAP`, extension fallback logic, `resolvedContentType` in response
- `src/lib/storage/validate.ts` — Added HEIC/HEIF-specific error message before generic type rejection
- `src/components/documents/driver-document-upload.tsx` — Destructures `resolvedContentType` from initiate, uses it in complete call; improved S3 PUT error block reads response body

## Decisions Made

- Extension fallback only covers `pdf`, `jpg`, `jpeg`, `png` — HEIC is deliberately excluded because HEIC files cannot be stored even if resolved; they need conversion. The server magic bytes check (validate.ts) will catch unconverted HEIC and return the specific message.
- The `resolvedContentType` field is added to the existing initiate response shape — no breaking change; existing callers that don't use it are unaffected.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All three remaining mobile upload bugs from TKT-0042 are addressed
- Mobile upload flow should now work end-to-end for PDF, JPEG, PNG across Android Chrome and iOS Safari
- No blockers

---
*Phase: quick-93*
*Completed: 2026-03-22*

## Self-Check: PASSED

- src/app/api/documents/multipart/initiate/route.ts — FOUND
- src/lib/storage/validate.ts — FOUND
- src/components/documents/driver-document-upload.tsx — FOUND
- .planning/quick/93-tkt-0042-follow-up-fix-remaining-mobile-/93-SUMMARY.md — FOUND
- Commit 50cb553 — FOUND
- Commit f21bee2 — FOUND
- Commit 9cc90d0 — FOUND
