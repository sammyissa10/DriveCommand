---
phase: quick-472
plan: 472
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/api/v1/carrier/stops/[id]/route.ts
  - apps/web/src/lib/carrier/stops.ts
  - apps/web/src/components/carrier/dispatches/TripAddStopModal.tsx
  - apps/web/src/components/carrier/dispatches/StopEditModal.tsx
  - apps/web/src/components/carrier/dispatches/StopTimeline.tsx
  - apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx
  - apps/web/src/app/(owner)/carrier/trips/[id]/page.tsx
  - apps/web/src/app/(owner)/carrier/trips/[id]/TripDetailMobile.tsx
autonomous: true

must_haves:
  truths:
    - "On the Add Stop dialog, the user can pick which Load a new stop is for (or leave it unassigned)"
    - "On the Edit Stop dialog, the user can change or clear which Load an existing stop is for"
    - "Each stop card shows a badge naming the Load it serves; stops with no Load show no badge"
    - "Only Loads attached to the current Trip appear in the picker"
    - "Existing stops with no load still render correctly"
  artifacts:
    - path: "apps/web/src/app/api/v1/carrier/stops/[id]/route.ts"
      provides: "loadId accepted (nullable) in StopUpdateSchema for PATCH"
      contains: "loadId"
    - path: "apps/web/src/lib/carrier/stops.ts"
      provides: "updateStop persists loadId with org-ownership verification"
      contains: "loadId"
    - path: "apps/web/src/components/carrier/dispatches/TripAddStopModal.tsx"
      provides: "For Load select populated from trip loads"
    - path: "apps/web/src/components/carrier/dispatches/StopEditModal.tsx"
      provides: "For Load select seeded from stop.loadId, PATCHes loadId"
    - path: "apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx"
      provides: "Load badge on each stop card"
  key_links:
    - from: "trips/[id]/page.tsx"
      to: "StopTimeline"
      via: "loads prop mapped from dispatch.carrierLoads; stops include loadId"
      pattern: "loads="
    - from: "StopEditModal"
      to: "/api/v1/carrier/stops/[id]"
      via: "PATCH body includes loadId (explicit null clears)"
      pattern: "loadId"
    - from: "updateStop"
      to: "carrierLoad org check"
      via: "reject loadId not belonging to org"
      pattern: "carrierLoad.findFirst"
---

<objective>
Let a carrier user associate each Trip STOP with a specific LOAD, and show which Load each stop belongs to. The DB link (`CarrierStop.loadId` → `CarrierLoad`) already exists — this is UI + one backend PATCH-schema gap. Add a "For Load" picker to the Add Stop and Edit Stop dialogs, and a Load badge on each stop timeline card.

Purpose: Owners running multi-load trips (LTL) need to know which load each stop serves.
Output: Per-stop load picker (add + edit) and a load badge on stop cards, desktop + mobile parity.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md

# Read BEFORE writing code (project CLAUDE.md rule — this task touches Stops):
# docs/specs/workflow-engine.md — Section 3 (naming table: confirm user-facing "Trip"/"Load"/"Stop")
#                                 and Section 14 (phase scope — do not build beyond this task)

# Backend
@apps/web/src/app/api/v1/carrier/stops/[id]/route.ts
@apps/web/src/lib/carrier/stops.ts

# UI
@apps/web/src/components/carrier/dispatches/TripAddStopModal.tsx
@apps/web/src/components/carrier/dispatches/StopEditModal.tsx
@apps/web/src/components/carrier/dispatches/StopTimeline.tsx
@apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx
@apps/web/src/app/(owner)/carrier/trips/[id]/page.tsx
@apps/web/src/app/(owner)/carrier/trips/[id]/TripDetailMobile.tsx
</context>

<constraints>
- NO schema change, NO migration. `CarrierStop.loadId` and `CarrierLoad.referenceNumber` (nullable) + `CarrierLoad.client { name }` already exist.
- CarrierStop/CarrierLoad/Trip are orgId-scoped (EXEMPT_MODELS) — follow the existing lib pattern that scopes every query by orgId; do NOT rely on RLS injection.
- Only loads attached to THIS trip may appear in the picker (`dispatch.carrierLoads`), never all org loads.
- UI copy uses user-facing names only ("For Load", "Load", "No specific load") per workflow-engine Section 3.
- Follow existing UI conventions: shadcn `Select` (already imported in TripAddStopModal), existing modal/label styles. Do NOT introduce new patterns.
- Commit only — NO git push, NO deploy. Baseline `tsc` has ~35 pre-existing errors; only regressions in touched files count.
</constraints>

<tasks>

<task type="auto">
  <name>Task 1: Accept and persist loadId on stop update (backend)</name>
  <files>
    apps/web/src/app/api/v1/carrier/stops/[id]/route.ts
    apps/web/src/lib/carrier/stops.ts
  </files>
  <action>
Add per-stop load reassignment to the PATCH path (create already supports loadId).

1. `stops/[id]/route.ts` — extend `StopUpdateSchema` with:
   `loadId: z.string().uuid().nullable().optional(),`
   Nullable so an explicit `null` clears the load; optional so unrelated PATCHes are unaffected.

2. `lib/carrier/stops.ts`:
   - Add `loadId?: string | null;` to the `StopUpdateInput` interface.
   - In `updateStop`, BEFORE the `update` call, mirror createStop's org-ownership check: if `data.loadId` is a non-empty string, verify it belongs to this org:
     `const load = await tenantPrisma.carrierLoad.findFirst({ where: { id: data.loadId, orgId }, select: { id: true } }); if (!load) return null;`
     (Skip the check when loadId is `undefined` or `null`.)
   - In the `update({ data: { ... } })` block, add:
     `loadId: data.loadId === undefined ? undefined : data.loadId,`
     so `undefined` leaves it unchanged, `null` clears it, a string sets it. Do NOT wrap in `?? null` (that would wipe the load on every unrelated edit).
  </action>
  <verify>
`cd apps/web && npx tsc --noEmit` — no NEW errors in these two files. Confirm `git grep -n "loadId" src/lib/carrier/stops.ts` shows both the interface field and the update-data line.
  </verify>
  <done>PATCH /api/v1/carrier/stops/[id] accepts `loadId` (string sets, null clears, omitted = unchanged) and rejects a loadId not owned by the org (returns null → 404).</done>
</task>

<task type="auto">
  <name>Task 2: Add "For Load" picker to Add Stop and Edit Stop dialogs</name>
  <files>
    apps/web/src/components/carrier/dispatches/TripAddStopModal.tsx
    apps/web/src/components/carrier/dispatches/StopEditModal.tsx
  </files>
  <action>
Define a shared load-option shape (inline in each file, no new module):
`{ id: string; referenceNumber: string | null; clientName: string }`
Option label helper: `referenceNumber ? referenceNumber : 'No ref'` + ` — ${clientName}`. Use the sentinel value `"none"` for the "No specific load" SelectItem (shadcn Select cannot use empty-string values).

TripAddStopModal.tsx:
   - Add `loads: { id: string; referenceNumber: string | null; clientName: string }[]` to props (default `[]` when destructured).
   - Add form state `selectedLoadId` initialised to the existing `loadId` prop ?? `'none'`. Reset it in the existing `useEffect(() => { if (!open) {...} })` cleanup (back to `loadId ?? 'none'`).
   - In the Step-2 form (after "Stop Type" Select), add a "For Load" `Select` (only render if `loads.length > 0`) with a `"none"` item labelled "No specific load" plus one item per load. Match the existing label/Select markup (`<label className="text-sm font-medium">For Load</label>`).
   - In `handleSubmit`, replace `if (loadId) body.loadId = loadId;` with:
     `if (selectedLoadId && selectedLoadId !== 'none') body.loadId = selectedLoadId;`
     (create API omits loadId when absent — no need to send null on create).

StopEditModal.tsx:
   - Add `loadId: string | null;` to the `StopData` interface.
   - Add `loads: {...}[]` to `StopEditModalProps`.
   - Add `loadId: stop.loadId ?? 'none'` to the `form` initial state AND to the `useEffect([stop])` reset block.
   - Add the same "For Load" `Select` (render only if `loads.length > 0`) seeded from `form.loadId`.
   - In `handleSubmit`, after the existing change-detection block, add load-change handling that ALWAYS sends an explicit value when changed (including clearing):
     compare `form.loadId` against `stop.loadId ?? 'none'`; if different, set
     `body.loadId = form.loadId === 'none' ? null : form.loadId;`
     This sends `null` to clear. Keep the existing "no changes → just close" guard working (loadId change counts as a change).
  </action>
  <verify>
`cd apps/web && npx tsc --noEmit` — no NEW errors in these two files. Visually confirm both dialogs render a "For Load" Select with a "No specific load" option.
  </verify>
  <done>Add Stop dialog defaults to the preset loadId prop (or "No specific load") and sends the chosen loadId; Edit Stop dialog is pre-selected to the stop's current load and can change it or clear it (sends null).</done>
</task>

<task type="auto">
  <name>Task 3: Show load badge on stop cards + wire loads through timeline and page</name>
  <files>
    apps/web/src/components/carrier/dispatches/StopTimeline.tsx
    apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx
    apps/web/src/app/(owner)/carrier/trips/[id]/page.tsx
    apps/web/src/app/(owner)/carrier/trips/[id]/TripDetailMobile.tsx
  </files>
  <action>
Thread the trip's loads down to the cards and render a badge.

Load-option shape everywhere: `{ id: string; referenceNumber: string | null; clientName: string }`. Badge label: `Load ${referenceNumber ?? 'No ref'} — ${clientName}`.

StopTimeline.tsx:
   - Add `loadId: string | null;` to the local `StopItem` interface.
   - Add `loads: { id: string; referenceNumber: string | null; clientName: string }[]` to `StopTimelineProps` (default `[]`).
   - Pass `loads={loads}` to BOTH `<TripAddStopModal>` instances (empty-state and main).
   - Pass `loads={loads}` and `loadId={stop.loadId ?? undefined}` to each `<StopTimelineCard>`.

StopTimelineCard.tsx:
   - Add `loadId: string | null;` to its local `StopItem` interface. (It already has a separate `loadId?: string` prop used for DocumentUploadModal — keep that; the new field is on the `stop` object. Ensure the two don't collide: the DocumentUploadModal `loadId` prop can be fed `stop.loadId ?? undefined` from StopTimeline, which is already being passed.)
   - Add `loads: {...}[]` prop (default `[]`).
   - Compute the badge: find `loads.find(l => l.id === stop.loadId)`; if found, render a small badge in the top badge row (next to the type/status badges) styled like the existing count badges, e.g. `bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300`, text `Load {referenceNumber ?? 'No ref'} · {clientName}`. Render nothing if no matching load.
   - Pass `loads={loads}` and add `loadId: stop.loadId` to the `stop={{...}}` object handed to `<StopEditModal>`.

page.tsx (desktop `<StopTimeline>` at ~line 344):
   - Build `const stopLoads = serializedDispatch.carrierLoads.map((l) => ({ id: l.id, referenceNumber: l.referenceNumber, clientName: l.client?.name ?? 'Unknown' }));`
   - Pass `loads={stopLoads}` to `<StopTimeline>`.
   - Confirm `serializedDispatch.stops` objects include `loadId` (they spread `...s`, so loadId is present — verify no explicit field allowlist strips it).

TripDetailMobile.tsx (mobile stop cards, ~line 733 `stops.map`):
   - This screen renders its OWN stop cards (does NOT reuse StopTimelineCard) and has no add/edit stop path, so ONLY mirror the badge display for parity.
   - Add a `loads` prop to TripDetailMobile (shape as above), pass it from page.tsx (`loads={stopLoads}`), and in the stop card render a badge when `loads.find(l => l.id === stop.loadId)` matches, using the mobile ds token classes already in this file (e.g. a `text-[13px] text-ds-txt3` line: `Load {referenceNumber ?? 'No ref'} · {clientName}`). Confirm the mobile `stops` prop type includes `loadId` (add it if the inline type omits it).
   - If TripDetailMobile has no add/edit-stop UI, do NOT add a picker there — badge only.
  </action>
  <verify>
`cd apps/web && npx tsc --noEmit` — no NEW errors in the four files. On a trip with 2+ loads: each stop card shows its load badge, unassigned stops show none. Confirm `loads` flows page → StopTimeline → StopTimelineCard → StopEditModal, and page → TripDetailMobile.
  </verify>
  <done>Stop cards (desktop + mobile) show a Load badge for assigned stops and nothing for unassigned; the Edit dialog opened from a card receives the trip's loads and pre-selects the stop's load.</done>
</task>

</tasks>

<verification>
- `cd apps/web && npx tsc --noEmit` — no NEW errors in any touched file (baseline ~35 pre-existing tolerated).
- End-to-end on a trip with 2+ attached loads and multiple stops:
  1. Add Stop → "For Load" picker lists the trip's loads + "No specific load"; choosing one assigns it.
  2. New/edited stop card shows the load badge; a "No specific load" stop shows no badge.
  3. Edit Stop → picker pre-selected to current load; changing it re-badges; clearing to "No specific load" removes the badge (PATCH sends null).
  4. Only loads attached to THIS trip appear (not all org loads).
- Confirm workflow-engine.md Section 3 naming ("Trip"/"Load"/"Stop") respected in all new UI copy.
</verification>

<success_criteria>
- Per-stop load picker on Add + Edit dialogs; load badge on stop cards (desktop + mobile).
- Backend PATCH accepts/persists loadId (set/clear/unchanged) with org-ownership verification.
- No schema change, no migration. Existing stops with no load unaffected.
- Committed (no push, no deploy).
</success_criteria>

<output>
After completion, create `.planning/quick/472-trip-stops-add-per-stop-load-picker-show/472-SUMMARY.md`.
</output>
