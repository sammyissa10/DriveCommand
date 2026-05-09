---
phase: quick-196
plan: "01"
subsystem: carrier-dispatches
tags: [bug-fix, document-upload, stop-completion, bol, pod]
dependency_graph:
  requires: []
  provides: [working-bol-pod-upload-to-complete-flow]
  affects: [dispatch-detail-page, stop-completion-server-action]
tech_stack:
  added: []
  patterns: [router.refresh() for RSC re-fetch after client mutation]
key_files:
  modified:
    - apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx
    - apps/web/src/lib/carrier/stop-completion.ts
decisions:
  - "Use router.refresh() instead of wiring onStopUpdated prop — simpler, works without prop threading through StopTimeline.tsx"
  - "OR logic for BOL/POD: document alone OR number alone satisfies compliance — matches real-world trucking where number may come later"
metrics:
  duration: "5 minutes"
  completed: "2026-04-07"
  tasks_completed: 1
  files_modified: 2
---

# Quick Task 196: Fix BOL/POD Upload to Enable Complete Stop Button

One-liner: Fixed the upload-then-complete flow by adding router.refresh() after document upload and switching BOL/POD server-side checks from AND to OR logic.

## What Was Done

Two bugs prevented the BOL/POD upload-to-complete flow from working on the dispatch detail page:

**Bug 1 — UI never refreshed after upload**
`StopTimelineCard.tsx` passed `onSuccess={() => onStopUpdated?.()}` to `DocumentUploadModal` for both BOL and POD uploads. However `onStopUpdated` is never passed by `StopTimeline.tsx`, making the callback a no-op. The `stopDocCounts` query was never re-run, so `bolUploaded`/`podUploaded` stayed false and the Complete Stop button remained disabled.

Fix: Changed both `onSuccess` callbacks to `() => { router.refresh(); onStopUpdated?.(); }`. The `router` was already imported and instantiated via `useRouter()` at line 134. `router.refresh()` triggers Next.js RSC re-render server-side, re-fetching `stopDocCounts` from the database.

**Bug 2 — Server required both document AND number**
`completeStop()` in `stop-completion.ts` used `if (!hasBolNumber || !hasBolDoc)` — meaning both the `bolNumber` field AND an uploaded document were required simultaneously. In practice, carriers upload a document but may not have the number handy yet.

Fix: Changed both BOL and POD checks to `&&` (AND of negations = OR of positives) — having either a document upload or a reference number is now sufficient.

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Hash | Message |
|------|---------|
| 7c7a801 | fix(quick-196): refresh page after BOL/POD upload and relax server-side check |

## Self-Check: PASSED

- `apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx` — modified (router.refresh in both onSuccess callbacks)
- `apps/web/src/lib/carrier/stop-completion.ts` — modified (OR logic for BOL and POD checks)
- Commit 7c7a801 — verified in git log
- `tsc --noEmit` — passed with no errors
