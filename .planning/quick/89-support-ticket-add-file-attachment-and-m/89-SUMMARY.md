---
phase: quick-89
plan: 01
subsystem: support-tickets
tags: [support, file-upload, s3, presigned-url, schema-migration]
dependency_graph:
  requires: [prisma/schema.prisma, src/lib/storage/presigned.ts, src/actions/support-tickets.ts]
  provides: [support attachment upload, platform toggle, presigned download links]
  affects: [admin-support, owner-support, support-ticket-modal]
tech_stack:
  added: []
  patterns: [presigned-upload-then-create, server-side-presigned-download, conditional-display]
key_files:
  created:
    - src/app/api/support/upload-attachment/route.ts
  modified:
    - prisma/schema.prisma
    - src/lib/storage/presigned.ts
    - src/actions/support-tickets.ts
    - src/components/support/support-ticket-modal.tsx
    - src/app/(admin)/admin-support/ticket-list.tsx
    - src/app/(owner)/support/[id]/page.tsx
decisions:
  - Store only attachmentKey (S3 key) in DB; generate presigned download URLs on demand to avoid storing expiring URLs
  - Use existing generateUploadUrl/generateDownloadUrl pattern from presigned.ts rather than duplicating S3 logic
  - Platform auto-detects via window.innerWidth < 768 on modal open, always overrideable by user
metrics:
  duration: "~5 minutes"
  completed: "2026-03-22"
  tasks_completed: 3
  files_changed: 6
  files_created: 1
---

# Quick-89: Support Ticket — Platform Toggle and File Attachment Summary

**One-liner:** Added platform (Mobile/Desktop) field and R2 file attachment (images + PDFs, max 10MB) to the support ticket system via presigned upload flow with per-request download URL generation.

## Tasks Completed

| Task | Description | Commit |
| ---- | ----------- | ------ |
| 1 | Schema migration + upload API route + server action update | ac730cf |
| 2 | Platform toggle and file attachment UI in support modal | ca05d1b |
| 3 | Platform badge and attachment link in admin and owner views | bded3aa |

## What Was Built

### Schema (prisma/schema.prisma)
Added three nullable fields to `SupportTicket`:
- `platform String?` — "MOBILE" or "DESKTOP"
- `attachmentUrl String?` — reserved for future use
- `attachmentKey String?` — S3/R2 object key for the attachment

Applied via `prisma db push` (no migration file — project uses db push pattern).

### Upload API Route (src/app/api/support/upload-attachment/route.ts)
POST endpoint that any authenticated user can call. Validates content type (image/* or application/pdf) and size (<= 10MB). Returns `{ uploadUrl, s3Key }` from a presigned PUT URL targeting the `support` category prefix: `tenant-{tenantId}/support/{fileId}-{fileName}`.

### Server Actions (src/actions/support-tickets.ts)
- `createSupportTicket` — extended to accept and persist `platform`, `attachmentUrl`, `attachmentKey`
- `getAllTickets` — `RawTicket` type updated to include the three new nullable fields
- `getAttachmentDownloadUrl(s3Key)` — new exported action; any authenticated user can call it to get a 1-hour presigned GET URL

### Modal Form (src/components/support/support-ticket-modal.tsx)
- Platform segmented toggle (Mobile/Desktop) with viewport auto-detection on open
- File input accepting `image/*,.pdf` with client-side validation (type + size)
- When file selected: shows filename + formatted size + clear button
- Submit flow: presigned URL request → PUT to S3 → createSupportTicket with attachmentKey
- Button text cycles: "Uploading..." → "Submitting..." → "Submit Ticket"

### Admin Ticket View (src/app/(admin)/admin-support/ticket-list.tsx)
- Platform badge in expanded detail: Desktop = blue, Mobile = violet
- Attachment row with "View Attachment" button that fetches presigned download URL on click and opens in new tab
- Loading spinner during URL fetch

### Owner Ticket Detail (src/app/(owner)/support/[id]/page.tsx)
- Platform badge (same color scheme as admin)
- Attachment link generated server-side at page load (1-hour presigned GET URL), rendered as standard `<a>` tag

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

Files verified to exist:
- src/app/api/support/upload-attachment/route.ts
- src/components/support/support-ticket-modal.tsx
- src/actions/support-tickets.ts (modified)
- src/app/(admin)/admin-support/ticket-list.tsx (modified)
- src/app/(owner)/support/[id]/page.tsx (modified)

Commits verified: ac730cf, ca05d1b, bded3aa — all present in git log.

TypeScript: `npx tsc --noEmit` passed with zero errors after each task.

## Self-Check: PASSED
