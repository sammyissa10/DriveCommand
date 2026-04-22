---
phase: quick-273
plan: "01"
subsystem: carrier-dispatches
tags: [documents, signed-url, stop-timeline, view-download, tenant-isolation]
dependency_graph:
  requires:
    - apps/web/src/app/api/v1/carrier/documents/[id]/route.ts
    - apps/web/src/lib/carrier/documents.ts
    - apps/web/src/components/carrier/documents/DocumentUploadModal.tsx
  provides:
    - GET /api/v1/carrier/documents/[id]/signed-url
    - StopDocumentList component
  affects:
    - apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx
tech_stack:
  added: []
  patterns:
    - signed-url-on-click (fetch signed URL at view time, not on list load)
    - refreshKey pattern for triggering re-fetch after upload
key_files:
  created:
    - apps/web/src/app/api/v1/carrier/documents/[id]/signed-url/route.ts
    - apps/web/src/components/carrier/dispatches/StopDocumentList.tsx
  modified:
    - apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx
decisions:
  - Fetch fresh signed URL on View click rather than embedding stale URL from list response — avoids expiry issues when documents are listed but not viewed immediately
  - StopDocumentList returns null (not empty state) when no documents — keeps stop card clean when nothing uploaded yet
  - Delete also calls router.refresh() + onStopUpdated() via onDeleted prop — ensures BOL/POD upload status badges stay accurate after deletion
metrics:
  duration: "6m"
  completed_date: "2026-04-22"
  tasks_completed: 2
  files_changed: 3
---

# Quick 273: Add View/Download Button to Uploaded Documents — Summary

**One-liner:** Fresh-signed-URL View button and owner-only Delete button added to each stop card's document list, with auto-refresh after upload.

## What Was Built

### Task 1: Signed-URL API Endpoint
`GET /api/v1/carrier/documents/[id]/signed-url` — Returns a 1-hour signed URL for any CarrierDocument. Validates session, verifies tenant isolation through the parent chain (stop → dispatch → orgId, load → orgId, dispatch → orgId), then generates the URL via Supabase admin client. Returns 404/403/500 on error.

### Task 2: StopDocumentList Component + StopTimelineCard Integration

**StopDocumentList.tsx** — New client component that:
- Fetches `GET /api/v1/carrier/documents?parent_type=stop&parent_id=X` on mount and whenever `refreshKey` changes
- Shows a single-line skeleton while loading; renders nothing if no documents (keeps card clean)
- Renders a compact row per document: colored type badge (BOL/POD/etc.), truncated filename, uploader name, relative time ("Xm ago", "Xh ago", "Xd ago")
- **View button**: Fetches fresh signed URL on click then calls `window.open(signedUrl, '_blank')` — avoids stale URL expiry
- **Delete button**: Owner/manager-only, `window.confirm` dialog, `DELETE /api/v1/carrier/documents/[id]`, removes from local state on success, calls `onDeleted?.()` prop

**StopTimelineCard.tsx** — Modified to:
- Import StopDocumentList
- Add `docRefreshKey` state (incremented after every upload via `onSuccess`)
- Render `<StopDocumentList stopId={stop.id} userRole={userRole} refreshKey={docRefreshKey} />` inside the existing `isPickupOrDelivery` border-t section, below the upload buttons

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

**Files created:**
- `apps/web/src/app/api/v1/carrier/documents/[id]/signed-url/route.ts` — FOUND
- `apps/web/src/components/carrier/dispatches/StopDocumentList.tsx` — FOUND

**Commits:**
- `7c90a6a` — feat(quick-273): add signed-url GET endpoint for carrier documents — FOUND
- `635ce2b` — feat(quick-273): add StopDocumentList with View/Delete actions to stop cards — FOUND

**TypeScript:** `npx tsc --noEmit` — PASSED (no errors)
**Build:** `npm run build` — PASSED (exit code 0)

## Self-Check: PASSED
