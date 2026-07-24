---
phase: quick-506
plan: 506
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/dispatch/dispatch-field-editability.ts
  - apps/web/src/lib/dispatch/dispatch-field-editability.test.ts
  - apps/web/src/lib/carrier/trips.ts
  - apps/web/src/components/carrier/dispatches/DispatchHeader.tsx
  - apps/web/src/app/(owner)/carrier/trips/[id]/TripDetailMobile.tsx
autonomous: true

must_haves:
  truths:
    - "On /carrier/trips/[id] with status In Progress, the Edit button is a real, clickable Button that opens the Edit Dispatch dialog"
    - "In that dialog on an in-progress trip, Primary Driver, Co-Driver, Truck, Scheduled Departure, Planned Miles, Actual Miles and Notes are all editable and actually persist after Save + refresh"
    - "Route Template stays non-editable on an in-progress trip: the select is rendered but disabled with a visible title/lockReason explaining that changing it would replace the trip's stops"
    - "Edit remains hard-blocked for completed / cancelled / tonu on both desktop and mobile, with an explanatory title"
    - "PATCH /api/v1/carrier/dispatches/[id] no longer silently drops primaryDriverId/truckId on an in_progress trip — the values are written to the Trip row"
    - "PATCH is rejected server-side (409) for completed, cancelled and tonu trips, not just completed"
    - "A driver-reassignment push/email notification only fires when the driver change was actually persisted"
    - "The mobile TripDetailMobile edit sheet shows the assignment fields for an in-progress trip (not the blanket 'locked once a trip is running' card)"
    - "The status -> per-field editability rule lives in ONE pure helper used by the desktop header, the mobile screen and the server, and is unit-tested"
  artifacts:
    - path: "apps/web/src/lib/dispatch/dispatch-field-editability.ts"
      provides: "Pure dispatchFieldEditability(status) returning record-level lock + per-field editability/reason"
      exports: ["dispatchFieldEditability", "lockedDispatchUpdateFields", "DISPATCH_EDITABLE_FIELDS"]
    - path: "apps/web/src/lib/dispatch/dispatch-field-editability.test.ts"
      provides: "Vitest covering planned / in_progress / completed / cancelled / tonu / unknown status"
    - path: "apps/web/src/lib/carrier/trips.ts"
      provides: "updateTrip gating driven by the helper instead of hardcoded status checks"
      contains: "dispatchFieldEditability"
    - path: "apps/web/src/components/carrier/dispatches/DispatchHeader.tsx"
      provides: "Clickable Edit on in_progress + per-field gating in the edit dialog"
    - path: "apps/web/src/app/(owner)/carrier/trips/[id]/TripDetailMobile.tsx"
      provides: "Mobile parity — assignment fields editable in progress, template row locked with lockReason"
  key_links:
    - from: "apps/web/src/lib/carrier/trips.ts"
      to: "apps/web/src/lib/dispatch/dispatch-field-editability.ts"
      via: "lockedDispatchUpdateFields(existing.status) drives payload stripping"
      pattern: "lockedDispatchUpdateFields"
    - from: "apps/web/src/components/carrier/dispatches/DispatchHeader.tsx"
      to: "apps/web/src/lib/dispatch/dispatch-field-editability.ts"
      via: "dispatchFieldEditability(dispatch.status)"
      pattern: "dispatchFieldEditability"
    - from: "apps/web/src/app/(owner)/carrier/trips/[id]/TripDetailMobile.tsx"
      to: "apps/web/src/lib/dispatch/dispatch-field-editability.ts"
      via: "dispatchFieldEditability(trip.status)"
      pattern: "dispatchFieldEditability"
---

<objective>
TKT-0086 (URGENT, `/carrier/trips/[id]`): an OWNER cannot edit a trip once its status is
`in_progress` — the Edit button is a greyed-out `<span>`.

**Root cause — VERIFIED in source, do NOT re-diagnose.**

There are TWO independent blocks, and both must be fixed or the fix is cosmetic:

1. **Client (desktop).** `DispatchHeader.tsx:498` renders a dead `<span>` instead of a
   `<Button>` when `isInProgress || isLocked`, where `isLocked` = completed/cancelled/tonu
   (line 247) and `isInProgress` = in_progress (line 248). The dialog itself is reachable
   only via `openEditDialog`, so the whole edit surface is unreachable mid-trip.
   Inside the dialog the entire assignment block (template + driver + co-driver + truck)
   is wrapped in `{dispatch.status === 'planned' && (...)}` (line 621), and
   `handleEditSave` only puts those keys on the payload when `status === 'planned'`
   (line 358).

2. **SERVER — CONFIRMED, this is the half that would have made a UI-only fix silently fail.**
   `apps/web/src/lib/carrier/trips.ts` `updateTrip()`:

   ```ts
   // line 387
   if (existing.status === 'completed') return { error: 'Cannot update completed dispatch' };
   ...
   // lines 418-423 — Strip locked fields when in_progress
   const updateData = { ...data };
   if (existing.status === 'in_progress') {
     delete updateData.primaryDriverId;
     delete updateData.truckId;
   }
   // line 426 — template change is planned-only (CORRECT, keep)
   const routeTemplateId = existing.status === 'planned' ? updateData.routeTemplateId : undefined;
   delete updateData.routeTemplateId;
   ```

   So the API accepts driver/truck on an in-progress trip, returns 200, and **silently
   discards them**. Worse, the notification block at line 528 reads the RAW `data`, not
   the stripped `updateData`:

   ```ts
   if (data.primaryDriverId && data.primaryDriverId !== existing.primaryDriverId) {
     after(() => sendDispatchAssignedNotification(orgId, id, data.primaryDriverId!));
   }
   ```

   -> today a mid-trip reassignment notifies a driver who was never actually assigned.
   This already fires in production from the MOBILE screen (see #3).

3. **Mobile is already half-unlocked and is therefore already hitting the silent-drop bug.**
   `TripDetailMobile.tsx:277` uses `canEdit = canManage && !isLocked` (in_progress is
   editable), but line 379 still gates the assignment payload to `isPlanned` and lines
   618-626 render a "Driver, truck and route template are locked once a trip is running"
   card. Desktop and mobile disagree; the server disagrees with both.

**Correct rule (this task implements it in ONE place):**

| field | planned | in_progress | completed / cancelled / tonu |
|---|---|---|---|
| routeTemplateId | editable | **locked** (would delete + recreate all stops, trips.ts:462-525) | locked |
| primaryDriverId | editable | **editable** | locked |
| coDriverId | editable | **editable** | locked |
| truckId | editable | **editable** | locked |
| scheduledDeparture | editable | editable | locked |
| plannedMiles / actualMiles | editable | editable | locked |
| notes | editable | editable | locked |

Purpose: unblock legitimate mid-trip dispatch corrections (driver swap, truck swap, odometer,
ETA) without letting the one genuinely destructive field through.
Output: one pure helper + Vitest, one server change, two client changes.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@apps/web/src/lib/carrier/trips.ts
@apps/web/src/components/carrier/dispatches/DispatchHeader.tsx
@apps/web/src/app/(owner)/carrier/trips/[id]/TripDetailMobile.tsx
@apps/web/src/app/api/v1/carrier/dispatches/[id]/route.ts
@apps/web/src/components/ui/ds/FieldGroup.tsx

Pattern to mirror (quick-503/504/505: pure helper in src/lib/** + colocated Vitest):
@apps/web/src/lib/dispatch/driver-readiness-label.ts
</context>

<side_effects_of_mid_trip_REASSIGNMENT>
Investigated; record these in the SUMMARY. No extra code is required for any of them,
but do not "clean them up" as part of this task.

- **Driver notification.** `updateTrip` already calls `sendDispatchAssignedNotification`
  when `primaryDriverId` changes (trips.ts:528). Once the change actually persists, the
  NEW driver is correctly notified. The PREVIOUS driver is NOT notified that the trip was
  taken from them — pre-existing gap, out of scope, note it.
- **Driver / truck status.** Derived live from the Trip row (`ACTIVE_DISPATCH_STATUSES =
  ['in_progress']`, `truck-status.ts` / `driver-status.ts`) — no denormalized column, so
  both boards self-correct on reassignment. No action.
- **Driver pay.** `generateDriverPayRecords(orgId, dispatchId)` reads the trip's driver at
  generation time (trip completion), so a mid-trip swap means the FINAL driver is paid for
  the whole trip. Accepted behavior for a correction; call it out in the SUMMARY.
- **Workflow engine.** `PlaybookInstance` for a dispatch is keyed by
  `entityType='DISPATCH' + entityId=<dispatch id>`, NOT by driver. A reassignment leaves
  any pre-trip checklist attached to the dispatch, partially completed by the old driver.
  **This task must not touch `work_state` / `checklist_status` / any Playbook row** — it is
  a pure gating change, so `docs/specs/workflow-engine.md` does not need to be opened.
- **No stored enum/status values change**, so no `pg_constraint` check is needed.
</side_effects_of_mid_trip_REASSIGNMENT>

<tasks>

<task type="auto">
  <name>Task 1: Add pure dispatchFieldEditability helper + Vitest</name>
  <files>
    apps/web/src/lib/dispatch/dispatch-field-editability.ts
    apps/web/src/lib/dispatch/dispatch-field-editability.test.ts
  </files>
  <action>
Create `apps/web/src/lib/dispatch/dispatch-field-editability.ts` — pure, no imports, no I/O.
Mirror the shape/comment style of the sibling `driver-readiness-label.ts` (quick-503).

Export:

```ts
export const DISPATCH_EDITABLE_FIELDS = [
  'routeTemplateId', 'primaryDriverId', 'coDriverId', 'truckId',
  'scheduledDeparture', 'scheduledArrival', 'plannedMiles', 'actualMiles', 'notes',
] as const;
export type DispatchEditableField = (typeof DISPATCH_EDITABLE_FIELDS)[number];

export interface DispatchFieldState { editable: boolean; reason: string | null }
export interface DispatchEditability {
  /** False for completed / cancelled / tonu — the whole record is read-only. */
  canEdit: boolean;
  /** Why the record is locked, for the Edit button title. Null when canEdit. */
  lockReason: string | null;
  fields: Record<DispatchEditableField, DispatchFieldState>;
}

export function dispatchFieldEditability(status: string): DispatchEditability;
/** Payload keys the server must drop for this status. Derived from the same map. */
export function lockedDispatchUpdateFields(status: string): DispatchEditableField[];
```

Rules:
- `completed` -> canEdit false, lockReason `"A completed trip can't be edited."`
- `cancelled` -> canEdit false, lockReason `"A cancelled trip can't be edited."`
- `tonu`      -> canEdit false, lockReason `"A trip marked TONU can't be edited."`
  For all three, every field is `{ editable: false, reason: lockReason }`.
- `in_progress` -> canEdit true, lockReason null, every field editable EXCEPT
  `routeTemplateId`, which is
  `{ editable: false, reason: "Changing the route template replaces every stop on the trip — only available before it starts." }`
- `planned` -> canEdit true, all fields editable, all reasons null.
- Any UNKNOWN status -> treat exactly as `planned` (fully editable). This preserves today's
  behavior (`isLocked`/`isInProgress` are both false for an unknown status) and means an
  unexpected value can never make a trip un-editable. Add a one-line comment saying so.

`lockedDispatchUpdateFields(status)` returns the keys whose `editable` is false — note that
for a locked status this returns every field, and the server handles that case with the
`canEdit` check before it ever gets here.

Write `dispatch-field-editability.test.ts` (Vitest, colocated — `src/**/*.test.ts` is already
in `apps/web/vitest.config.ts`). Cover:
1. planned: canEdit true, all 9 fields editable, lockReason null.
2. in_progress: canEdit true; primaryDriverId / coDriverId / truckId / scheduledDeparture /
   plannedMiles / actualMiles / notes editable; routeTemplateId NOT editable and its reason
   is a non-empty string.
3. completed, cancelled, tonu (it.each): canEdit false, lockReason non-empty, EVERY field
   editable === false.
4. unknown status `'archived'`: behaves like planned.
5. `lockedDispatchUpdateFields('in_progress')` === `['routeTemplateId']`;
   `lockedDispatchUpdateFields('planned')` === `[]`.
  </action>
  <verify>cd apps/web && npx vitest run src/lib/dispatch/dispatch-field-editability.test.ts</verify>
  <done>All test cases pass; the helper has zero imports and no React/Prisma dependency.</done>
</task>

<task type="auto">
  <name>Task 2: Stop the server silently dropping mid-trip driver/truck edits</name>
  <files>apps/web/src/lib/carrier/trips.ts</files>
  <action>
Edit `updateTrip()` only (starts line 378). `updateTrip` has exactly ONE caller
(`PATCH /api/v1/carrier/dispatches/[id]`, via the `updateDispatch` alias re-exported from
`lib/carrier/dispatches.ts`), so this is contained.

1. Import the helper:
   `import { dispatchFieldEditability, lockedDispatchUpdateFields } from '@/lib/dispatch/dispatch-field-editability';`

2. Replace the completed-only guard (lines 387-389):

   ```ts
   const editability = dispatchFieldEditability(existing.status);
   if (!editability.canEdit) {
     return { error: editability.lockReason ?? 'This trip can no longer be edited' };
   }
   ```
   This TIGHTENS the server: cancelled and tonu are now rejected too (the UI has always
   blocked them, the API did not). The route maps `{ error }` to HTTP 409 — unchanged.

3. Replace the hardcoded strip block (lines 418-423) with:

   ```ts
   // Drop any field that isn't editable at this status (in_progress: routeTemplateId only).
   const updateData = { ...data };
   for (const field of lockedDispatchUpdateFields(existing.status)) {
     delete updateData[field];
   }
   ```
   Net effect: `primaryDriverId` and `truckId` are NO LONGER deleted for `in_progress`.
   Do NOT weaken the tenant-isolation checks above it (lines 391-416) — driver/truck/co-driver
   still must belong to `orgId`, and co-driver still must differ from the effective primary.
   Those already run for every status.

4. Keep the template handling at lines 425-427 as-is in behavior. `routeTemplateId` is now
   already removed from `updateData` for in_progress by the loop; the existing
   `existing.status === 'planned' ? updateData.routeTemplateId : undefined` read must be
   taken BEFORE the strip loop, or (preferred) rewritten as:

   ```ts
   const routeTemplateId = editability.fields.routeTemplateId.editable ? data.routeTemplateId : undefined;
   delete updateData.routeTemplateId;
   ```
   The stop-replacement block (lines 461-525) stays guarded by
   `if (routeTemplateId && existing.status === 'planned')` — unchanged. Trip stops must never
   be rewritten for a running trip.

5. Fix the notification source of truth (lines 527-532): compare `updateData.primaryDriverId`,
   not `data.primaryDriverId`, so the "new driver assigned" push/email only fires when the
   change was actually persisted:

   ```ts
   if (updateData.primaryDriverId && updateData.primaryDriverId !== existing.primaryDriverId) {
     after(() => sendDispatchAssignedNotification(orgId, id, updateData.primaryDriverId!));
   }
   ```

Do not touch `transitionTripStatus`, `reorderStops`, `addLoadToTrip` or anything that writes
stop/checklist state.
  </action>
  <verify>
cd apps/web && npx tsc --noEmit 2>&1 | tail -5
(35 pre-existing errors is the baseline — only a NEW error, or any error in trips.ts, is a regression.)
Then confirm no residual hardcoded gate:
grep -n "delete updateData.primaryDriverId\|Cannot update completed dispatch" src/lib/carrier/trips.ts   # expect no matches
  </verify>
  <done>updateTrip rejects completed/cancelled/tonu with a 409, strips only routeTemplateId for in_progress, persists primaryDriverId/coDriverId/truckId mid-trip, and notifies only on a persisted driver change.</done>
</task>

<task type="auto">
  <name>Task 3: Unlock and field-gate the Edit UI on desktop and mobile</name>
  <files>
    apps/web/src/components/carrier/dispatches/DispatchHeader.tsx
    apps/web/src/app/(owner)/carrier/trips/[id]/TripDetailMobile.tsx
  </files>
  <action>
**A. `DispatchHeader.tsx` (desktop)**

- Import `dispatchFieldEditability` and derive once near line 247:
  `const editability = dispatchFieldEditability(dispatch.status);`
  Keep `isLocked` / `isInProgress` only where they still drive other UI (odometer inputs,
  status buttons); replace the EDIT gating with the helper.
- Edit button (lines 497-516): render the dead `<span>` fallback ONLY when
  `!editability.canEdit`, and use `title={editability.lockReason}` instead of the generic
  "Cannot edit an active or completed dispatch". Otherwise render the real `<Button>`.
- `openEditDialog` (line 274): the template list currently loads only when
  `dispatch.status === 'planned'`. Change the condition to
  `editability.fields.routeTemplateId.editable` (same result today, one source of truth).
- Edit dialog body (line 621): change `{dispatch.status === 'planned' && (...)}` so the
  assignment block renders whenever `editability.canEdit`. Inside it:
  - **Route Template select**: always rendered, but
    `disabled={!editability.fields.routeTemplateId.editable}` plus
    `title={editability.fields.routeTemplateId.reason ?? undefined}`, and when it is not
    editable render the reason as a `text-xs text-muted-foreground` line under the select
    ("show it, but explain the block" — quick-503/504 pattern). Keep the existing amber
    "Changing the template will replace all existing stops" warning + stop preview, both of
    which only apply in the editable (planned) case.
  - **Primary Driver / Co-Driver / Truck selects**: unchanged markup, now reachable while
    in_progress. Keep the existing "clear co-driver when it equals the new primary" behavior.
- `handleEditSave` (line 312): replace both `dispatch.status === 'planned'` conditions.
  - The co-driver-equals-primary guard should run whenever
    `editability.fields.coDriverId.editable`.
  - The payload block (line 358) should attach `primaryDriverId`, `truckId` and `coDriverId`
    when their respective `editability.fields.*.editable` is true, and attach
    `routeTemplateId` only when `editability.fields.routeTemplateId.editable` AND it changed.

**B. `TripDetailMobile.tsx` (mobile-web)**

- Import the helper; `const editability = dispatchFieldEditability(trip.status);`
- Line 277: `const canEdit = canManage && editability.canEdit;` (same result, one source).
  Leave `canAddStop`, the odometer inline-edit gating and the status actions alone.
- Line 613: stop swapping the whole Assignment group for a static card. Always render
  `<FieldGroup fields={editAssignment} isEditing />`, and express the template lock through
  the `FieldDef` fields that already exist for exactly this (`FieldGroup.tsx:49-52`):

  ```ts
  {
    key: 'routeTemplateId',
    label: 'Route template',
    editable: editability.fields.routeTemplateId.editable,
    lockReason: editability.fields.routeTemplateId.reason ?? undefined,
    value: trip.routeTemplateName ?? 'No template',
    input: editability.fields.routeTemplateId.editable ? { ...existing select config } : undefined,
  }
  ```
  Delete the "Driver, truck and route template are locked once a trip is running" card
  (lines 618-626) — it is now wrong.
- Line 337 (`startEdit`): load templates when `editability.fields.routeTemplateId.editable`
  instead of `isPlanned`.
- Lines 356 and 379 (`saveEdit`): same treatment as desktop — the co-driver guard and the
  assignment payload keys are gated per-field off `editability.fields.*`, not off `isPlanned`.
- Also update the now-stale comment at lines 273-276 to describe the new shared rule.

Follow existing conventions in both files — no new components, no new styling primitives.
  </action>
  <verify>
cd apps/web && npx tsc --noEmit 2>&1 | tail -5   # no new errors vs the 35-error baseline
grep -n "status === 'planned'" src/components/carrier/dispatches/DispatchHeader.tsx "src/app/(owner)/carrier/trips/[id]/TripDetailMobile.tsx"   # no remaining edit-gating matches

Manual (dev server, owner login), on the reported trip DC-2026-00001 (In Progress):
1. /carrier/trips/8920928d-2e47-47cd-8d88-575b39ed30be — Edit is a live button; click it.
2. Change Primary Driver AND Truck, Save -> toast "Dispatch updated"; after the refresh the
   header shows the NEW driver and NEW truck (this is the exact case that used to 200-and-drop).
3. Route Template select is visible but disabled with the explanatory reason under it.
4. Narrow to mobile width: Edit -> the Assignment group is present with driver/truck/co-driver
   editable and the template row locked with its lockReason.
5. Complete (or open a cancelled) trip -> Edit is greyed with the status-specific title, and a
   direct `curl -X PATCH .../dispatches/{id} -d '{"plannedMiles":5}'` returns 409.
  </verify>
  <done>Edit is reachable and functional on an in-progress trip on both desktop and mobile; driver/co-driver/truck/schedule/odometer/notes persist; route template is visibly locked with a reason; completed/cancelled/tonu remain blocked client- and server-side.</done>
</task>

</tasks>

<verification>
- `npx vitest run src/lib/dispatch/dispatch-field-editability.test.ts` passes.
- `npx tsc --noEmit` shows no new errors over the 35-error baseline and none in the 4 touched files.
- The status->field rule appears in exactly one file; no `status === 'planned'` edit gate is
  left in DispatchHeader.tsx, TripDetailMobile.tsx or updateTrip.
- No Prisma schema change, no migration, no stored enum value changed, no Playbook/checklist
  or stop row touched.
</verification>

<success_criteria>
TKT-0086 closed: an owner can open Edit on an `in_progress` trip and change driver, co-driver,
truck, scheduled departure, planned/actual miles and notes, and those changes are persisted by
the API (not silently discarded). Route template stays locked mid-trip with a visible reason.
Completed / cancelled / TONU trips remain read-only on both clients AND are now rejected 409
by the server.
</success_criteria>

<output>
After completion, create `.planning/quick/506-tkt-0086-cannot-edit-a-trip-once-it-is-i/506-SUMMARY.md`,
including the mid-trip reassignment side effects listed in `<side_effects_of_mid_trip_REASSIGNMENT>`
(previous driver is not notified; pay records follow the final driver; the dispatch's playbook
instance stays attached to the dispatch, not the driver).
</output>
</content>
</invoke>
