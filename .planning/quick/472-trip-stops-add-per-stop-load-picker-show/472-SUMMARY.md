# Quick Task 472: Per-Stop Load Picker + Load Badge Summary

Per-stop Load association (`CarrierStop.loadId`) surfaced end-to-end: a "For Load" picker on both the Add Stop and Edit Stop dialogs, and a Load badge on every stop card (desktop + mobile), scoped strictly to loads attached to the current Trip.

## What Was Built

- **Backend (`PATCH /api/v1/carrier/stops/[id]`)**: `StopUpdateSchema` now accepts a nullable, optional `loadId`. `updateStop()` verifies any supplied `loadId` belongs to the org (mirrors the existing `createStop` check) before persisting; `undefined` leaves the field untouched, an explicit `null` clears it, a UUID string sets it.
- **Add Stop dialog (`TripAddStopModal`)**: new "For Load" `Select` (rendered only when the trip has loads) defaulting to the preset `loadId` prop or "No specific load". Selection is sent as `loadId` in the create body only when a real load is chosen.
- **Edit Stop dialog (`StopEditModal`)**: same "For Load" `Select`, pre-seeded from `stop.loadId`. Changing it — including clearing back to "No specific load" — is treated as a change and sends an explicit `loadId: null` to clear.
- **Stop cards (`StopTimelineCard`, desktop)**: renders an amber "Load {ref} · {client}" badge next to the type/status badges when the stop has a matching load; renders nothing otherwise. `loads` and `loadId` now flow into the Add/Edit modals it owns.
- **`StopTimeline`**: threads the trip's `loads` array to both `TripAddStopModal` instances (empty-state + main) and to every `StopTimelineCard`.
- **`page.tsx`**: derives `stopLoads` from `serializedDispatch.carrierLoads` (`{ id, referenceNumber, clientName }`) and passes it to both the desktop `StopTimeline` and the mobile `TripDetailMobile`.
- **`TripDetailMobile`**: mirrors the badge display on its own stop cards (mobile-web design system tokens) for parity. Per plan scope, no picker was added here — this screen's add-stop flow was left untouched.

## Deviations from Plan

None — plan executed exactly as written.

## Auth Gates

None encountered.

## Files Changed

- `apps/web/src/app/api/v1/carrier/stops/[id]/route.ts` — `loadId` added to `StopUpdateSchema`
- `apps/web/src/lib/carrier/stops.ts` — `StopUpdateInput.loadId`, org-ownership check, persisted in `updateStop`
- `apps/web/src/components/carrier/dispatches/TripAddStopModal.tsx` — "For Load" picker + `loads` prop
- `apps/web/src/components/carrier/dispatches/StopEditModal.tsx` — "For Load" picker + `loads`/`stop.loadId`
- `apps/web/src/components/carrier/dispatches/StopTimeline.tsx` — `loads` prop threaded to children
- `apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx` — Load badge + `loads` passed to `StopEditModal`
- `apps/web/src/app/(owner)/carrier/trips/[id]/page.tsx` — `stopLoads` derivation, passed to both timelines
- `apps/web/src/app/(owner)/carrier/trips/[id]/TripDetailMobile.tsx` — badge on mobile stop cards, `loadId` on `TripStopItem`

## Verification

- `cd apps/web && npx tsc --noEmit` — 0 errors (clean baseline this session; no regressions introduced by any touched file).
- `git grep -n "loadId" apps/web/src/lib/carrier/stops.ts` confirms interface field + org-check + update-data line all present.
- Only `dispatch.carrierLoads` (loads attached to the current Trip) are ever passed as `loads`/`stopLoads` — never an org-wide load query.
- No Prisma schema change, no migration — `CarrierStop.loadId` and `CarrierLoad.referenceNumber`/`client.name` already existed.

## Naming Compliance

Per project CLAUDE.md, `docs/specs/DriveCommand_Workflow_Engine_v2.md` (readable mirror of `docs/specs/workflow-engine.md`) Section 3 naming table and Section 14 phase scope were reviewed before writing code. That spec governs the Checklists & Workflows / Playbook engine, an unrelated module — it has no naming overlap with Trip/Load/Stop dispatch entities, so no conflicts applied. New UI copy ("For Load", "No specific load", "Load {ref} · {client}") uses plain, user-facing language throughout.

## Self-Check: PASSED

- FOUND: apps/web/src/app/api/v1/carrier/stops/[id]/route.ts
- FOUND: apps/web/src/lib/carrier/stops.ts
- FOUND: apps/web/src/components/carrier/dispatches/TripAddStopModal.tsx
- FOUND: apps/web/src/components/carrier/dispatches/StopEditModal.tsx
- FOUND: apps/web/src/components/carrier/dispatches/StopTimeline.tsx
- FOUND: apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx
- FOUND: apps/web/src/app/(owner)/carrier/trips/[id]/page.tsx
- FOUND: apps/web/src/app/(owner)/carrier/trips/[id]/TripDetailMobile.tsx
- FOUND commit be8d8102 (Task 1: backend loadId)
- FOUND commit 4edba323 (Task 2: picker dialogs)
- FOUND commit e61cd40c (Task 3: badge + wiring)
