---
phase: quick-98
plan: 01
subsystem: ui
tags: [html2canvas, s3, support, screenshot, prisma, shadcn]

# Dependency graph
requires:
  - phase: quick-89
    provides: support ticket file attachment pattern and /api/support/upload-attachment presigned upload route
  - phase: quick-91
    provides: existing SupportTicketModal and support-tickets.ts action foundation
provides:
  - Auto-screenshot capture on support ticket creation via html2canvas
  - screenshotKey field on SupportTicket model (separate from attachmentKey)
  - Confirmation dialog before capture, removable preview in ticket form
  - Admin inline screenshot thumbnail with full-size expand dialog
affects: [admin-support, support-ticket-modal, support-tickets-action]

# Tech tracking
tech-stack:
  added: [html2canvas@1.4.1]
  patterns:
    - Dynamic import of html2canvas to avoid SSR issues
    - Screenshot captured BEFORE form opens (captures page state user was viewing)
    - Reuse of existing /api/support/upload-attachment presigned URL pattern for screenshot blobs
    - Graceful degradation - screenshot upload failure is non-fatal, ticket still submits

key-files:
  created: []
  modified:
    - prisma/schema.prisma
    - src/actions/support-tickets.ts
    - src/components/support/support-ticket-modal.tsx
    - src/app/(admin)/admin-support/ticket-list.tsx

key-decisions:
  - "screenshotKey is stored as a separate field from attachmentKey so both can coexist independently"
  - "Screenshot upload failure is non-fatal — ticket submits without it rather than blocking user"
  - "html2canvas is dynamically imported to avoid SSR bundle bloat and Next.js window errors"
  - "Screenshot is captured BEFORE the Sheet opens so it captures the actual page state"

patterns-established:
  - "Dynamic import pattern for browser-only libraries: (await import('html2canvas')).default"
  - "Presigned URL reuse: getAttachmentDownloadUrl works for any S3 key including screenshotKey"

# Metrics
duration: 25min
completed: 2026-03-22
---

# Quick Task 98: TKT-0044 Screenshot Auto-capture on Support Ticket Summary

**html2canvas page capture before support form opens, with confirmation dialog, removable preview, S3 upload as screenshotKey, and inline expandable thumbnail in admin ticket view**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-03-22T00:00:00Z
- **Completed:** 2026-03-22T00:25:00Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- SupportTicket Prisma model gains `screenshotKey String?` field, pushed to DB and client regenerated
- Support button now shows an AlertDialog asking "Capture Screenshot?" before opening the ticket form
- "Capture & Continue" runs html2canvas on `document.body` and shows a capturing overlay, then opens form with removable thumbnail preview
- Screenshot blob uploads to S3 via existing `/api/support/upload-attachment` pattern; `screenshotKey` stored separately from `attachmentKey`
- Admin ticket list shows a subtle Camera icon on tickets with screenshots; expanding reveals inline clickable thumbnail that opens full-size Dialog

## Task Commits

1. **Task 1: Schema + server action + html2canvas install** - `b472859` (feat)
2. **Task 2: Screenshot capture flow in support ticket modal** - `afae222` (feat)
3. **Task 3: Inline screenshot display in admin ticket list** - `c48340d` (feat)

## Files Created/Modified

- `prisma/schema.prisma` - Added `screenshotKey String?` to SupportTicket model
- `src/actions/support-tickets.ts` - screenshotKey in schema, createSupportTicket params, DB insert, and RawTicket type
- `src/components/support/support-ticket-modal.tsx` - Confirmation dialog, html2canvas capture flow, preview thumbnail, screenshot S3 upload
- `src/app/(admin)/admin-support/ticket-list.tsx` - Camera icon badge, inline screenshot thumbnail, full-size Dialog expand

## Decisions Made

- `screenshotKey` stored as a separate DB field from `attachmentKey` so a ticket can have both a manual file attachment and an auto-screenshot simultaneously without any conflict
- Screenshot upload is non-fatal: if S3 upload fails, `screenshotS3Key` remains undefined and the ticket submits normally — error is logged but not surfaced to user
- `html2canvas` is dynamically imported (`await import('html2canvas')`) to keep it out of the server bundle and avoid Next.js SSR issues with `document`/`window`
- The capture happens BEFORE `setOpen(true)` so the Sheet is not yet rendered, capturing exactly what the user was seeing when they clicked support

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed lucide-react Camera icon title prop incompatibility**
- **Found during:** Task 3 (admin ticket list)
- **Issue:** `title` is not a valid prop on lucide-react SVG icons in this version; TypeScript threw TS2322
- **Fix:** Wrapped `<Camera>` in a `<span title="Has screenshot">` to preserve the tooltip behavior
- **Files modified:** `src/app/(admin)/admin-support/ticket-list.tsx`
- **Verification:** `npx tsc --noEmit` passed with zero errors after fix
- **Committed in:** `c48340d` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking type error)
**Impact on plan:** Minor fix — tooltip behavior preserved via span wrapper, no functional change.

## Issues Encountered

- After adding `screenshotKey` to schema and running `prisma db push`, the Prisma client was stale. `npx tsc --noEmit` caught the type error immediately. Fixed by running `npx prisma generate` before proceeding.

## Self-Check: PASSED

Files confirmed present:
- `prisma/schema.prisma` — screenshotKey field confirmed
- `src/actions/support-tickets.ts` — screenshotKey in 6 locations confirmed
- `src/components/support/support-ticket-modal.tsx` — rewritten with capture flow
- `src/app/(admin)/admin-support/ticket-list.tsx` — screenshot display added

Commits confirmed:
- b472859 — feat(quick-98): schema + action + html2canvas
- afae222 — feat(quick-98): screenshot capture flow in modal
- c48340d — feat(quick-98): inline screenshot display in admin list

## User Setup Required

None - no external service configuration required. Uses existing S3 presigned upload infrastructure.

## Next Phase Readiness

- Screenshot capture flow is fully operational end-to-end
- Existing manual attachment functionality is unchanged and independent
- Admin support view is enhanced with visual screenshot context
- No blockers

---
*Phase: quick-98*
*Completed: 2026-03-22*
