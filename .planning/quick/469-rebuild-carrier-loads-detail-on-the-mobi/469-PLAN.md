---
phase: quick-469
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/carrier/rate-types.ts
  - src/app/api/v1/carrier/loads/[id]/route.ts
  - src/app/api/v1/carrier/loads/route.ts
  - src/app/api/v1/carrier/contracts/route.ts
  - src/app/(owner)/carrier/loads/[id]/LoadDetailMobile.tsx
  - src/app/(owner)/carrier/loads/[id]/page.tsx
autonomous: true
must_haves:
  truths:
    - "A load whose rateType is per_load or per_hour saves from the edit form without a 400 Zod error"
    - "On a phone, /carrier/loads/[id] renders the dark ds detail screen, not the white desktop page"
    - "The Client and Contract selects show the load's actual saved values on first paint, never 'Select a client…'"
    - "The owner can toggle Edit, change Details/Freight/Rate fields, and Save in place without navigating away"
    - "The owner can Add to Trip and Cancel Load from the mobile screen"
    - "Stops and Driver Assignments are reachable as tabs, not stacked inline sections"
    - "A load on a trip shows a Belongs-to chip that navigates to /carrier/trips/[dispatchId]"
    - "At lg and above the desktop page renders exactly as it did before"
  artifacts:
    - path: "src/lib/carrier/rate-types.ts"
      provides: "Single exported 8-value rate-type tuple shared by the carrier Zod schemas"
      contains: "RATE_TYPES"
    - path: "src/app/api/v1/carrier/loads/[id]/route.ts"
      provides: "PATCH LoadUpdateSchema accepting all 8 rate types"
      contains: "RATE_TYPES"
    - path: "src/app/(owner)/carrier/loads/[id]/LoadDetailMobile.tsx"
      provides: "ds Load Detail — identity, ParentStrip, actions, Details/Stops/Assignments tabs, single isEditing flag"
      min_lines: 400
    - path: "src/app/(owner)/carrier/loads/[id]/page.tsx"
      provides: "Server page rendering lg:hidden LoadDetailMobile + unchanged hidden lg:block desktop"
      contains: "LoadDetailMobile"
  key_links:
    - from: "src/app/(owner)/carrier/loads/[id]/page.tsx"
      to: "src/app/(owner)/carrier/loads/[id]/LoadDetailMobile.tsx"
      via: "lg:hidden -m-4 wrapper with server-derived props"
      pattern: "lg:hidden"
    - from: "src/app/(owner)/carrier/loads/[id]/LoadDetailMobile.tsx"
      to: "/api/v1/carrier/loads/[id]"
      via: "PATCH on save, payload ported from LoadForm handleSubmit"
      pattern: "method: 'PATCH'"
    - from: "src/app/(owner)/carrier/loads/[id]/LoadDetailMobile.tsx"
      to: "/api/v1/carrier/loads/[id]/cancel"
      via: "POST from the Cancel Load sheet"
      pattern: "cancel"
---

<objective>
Rebuild carrier **Loads Detail** (`/carrier/loads/[id]`) on the mobile-web design system, and fix the
stale PATCH rate-type Zod enum that makes `per_load` / `per_hour` loads unsaveable.

Purpose: Loads overview and Loads create are already on the ds, so creating a load works and then the
post-create redirect drops the user onto the old white desktop page. This closes the last hole in the
Loads four-page set. The rate-type bug is independent and blocks the user today.

Output: `src/lib/carrier/rate-types.ts`, a fixed PATCH schema, and `LoadDetailMobile.tsx` wired into
`page.tsx` alongside the untouched desktop branch.

Scope: **`apps/web` only.** `apps/mobile` (React Native) is a separate, not-yet-started track — do not
touch it.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# The contract — read §1–8 and §12 before writing any ds markup
@.planning/mobile-design-system.md

# Closest precedent — same shape (identity → ParentStrip → action → sheets → Edit/isEditing → tabs)
@apps/web/src/app/(owner)/carrier/trips/[id]/TripDetailMobile.tsx

# Sibling pages already on the ds — reuse their vocabulary and helpers verbatim
@apps/web/src/app/(owner)/carrier/loads/new/NewLoadMobile.tsx
@apps/web/src/app/(owner)/carrier/loads/LoadsMobile.tsx

# Desktop source of truth — port its logic, do not re-invent it
@apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx
@apps/web/src/components/carrier/loads/LoadForm.tsx
@apps/web/src/components/carrier/loads/LoadDetailActions.tsx
@apps/web/src/components/carrier/loads/CancelLoadModal.tsx
@apps/web/src/components/carrier/loads/DispatchLoadModal.tsx

# ds kit
@apps/web/src/components/ui/ds/index.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix the stale PATCH rate-type enum (ship this first, on its own)</name>
  <files>
    apps/web/src/lib/carrier/rate-types.ts (new)
    apps/web/src/app/api/v1/carrier/loads/[id]/route.ts
    apps/web/src/app/api/v1/carrier/loads/route.ts
    apps/web/src/app/api/v1/carrier/contracts/route.ts
  </files>
  <action>
    Diagnosed root cause — trust it, do not re-derive:
    `loads/[id]/route.ts:39` (PATCH `LoadUpdateSchema`) declares only 6 rate types
    (`per_mile, flat, per_stop, per_cwt, per_pallet, hourly`). Every other layer supports 8, adding
    `per_load` and `per_hour`: POST `loads/route.ts:39`, `contracts/route.ts:14`, `LoadForm.tsx`
    (`RATE_TYPE_LABELS` ~line 114 + the `<option>`s ~line 889), `NewLoadMobile.tsx` `RATE_TYPES`
    (~line 32), and `revenue-calculator.ts` (explicit `case 'per_load'` line 62, `case 'per_hour'`
    line 81). Prisma `rateType` is a plain `String @default("per_mile")` (schema.prisma:1944) — no DB
    enum, so no migration is involved. A load created as `per_load`/`per_hour` saves fine but can never
    be edited. The PATCH enum is simply stale.

    Do exactly this and no more:
    1. Create `apps/web/src/lib/carrier/rate-types.ts` exporting one const tuple:
       `export const RATE_TYPES = ['per_mile', 'per_load', 'per_hour', 'per_stop', 'flat', 'per_cwt', 'per_pallet', 'hourly'] as const;`
       plus `export type RateType = (typeof RATE_TYPES)[number];`
       Order matches the existing POST/contracts lists so nothing reads as a reorder.
    2. Point all three Zod schemas at it — `z.enum(RATE_TYPES)` in:
       - `loads/[id]/route.ts` PATCH (**this is the fix** — gains `per_load` + `per_hour`)
       - `loads/route.ts` POST (no behavior change — same 8 values)
       - `contracts/route.ts` (no behavior change — same 8 values)

    Judgment call, resolved: the shared constant is worth it here and is not gold-plating — the drift
    is exactly 3 Zod enums that must agree, it is 2 lines of new code, and a 4th divergent copy is how
    this bug happened. **Boundary: schemas only.** Leave the UI label maps (`RATE_TYPE_LABELS`,
    `RATE_TYPES` in NewLoadMobile, `ContractForm.tsx` options) alone — they carry human labels, not
    just values, and rewriting them widens the blast radius of a bug fix.

    Commit this task alone before starting Task 2 — it is independently valuable and unblocks the user
    today.
  </action>
  <verify>
    `cd apps/web && npx tsc --noEmit` — no new errors (baseline ~35 pre-existing, unrelated: missing
    @types for framer-motion, zustand, nuqs, papaparse, d3-geo, @tanstack/react-virtual).
    `grep -rn "per_cwt" apps/web/src --include=*.ts` shows no remaining inline rateType `z.enum` in the
    three API routes.
    Manually: open a load whose rate type is Per load or Per hour, save it — 200, not a 400.
  </verify>
  <done>PATCH accepts all 8 rate types; the 3 carrier Zod schemas read from one `RATE_TYPES` const; committed as its own atomic commit.</done>
</task>

<task type="auto">
  <name>Task 2: page.tsx server derivation + LoadDetailMobile — the record (identity, tabs, Details/Freight/Rate, Edit/Save, audit)</name>
  <files>
    apps/web/src/app/(owner)/carrier/loads/[id]/LoadDetailMobile.tsx (new)
    apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx
  </files>
  <action>
    **page.tsx (additive only — the `hidden lg:block` desktop branch is byte-for-byte the existing JSX).**
    Wrap the current return in a fragment:
    `<div className="lg:hidden -m-4"><LoadDetailMobile ... /></div>` + `<div className="hidden lg:block space-y-6">{existing JSX}</div>`
    — exactly the shape of `loads/new/page.tsx`.

    Keep lines 56–133 (stops resolution) VERBATIM — the dispatch-stop fallback and the
    `pendingStopsJson` branch are where silent regressions hide. Likewise `parsedDispatchNumber`
    (line 148–153) and `pendingStopCount` (155–160).

    **All derivation is server-side, including every select option.** A native `<select value={id}>`
    with no matching `<option>` on first paint renders its *first* option, so a saved Client silently
    reads as "Select a client…" — that is the exact symptom in the reported screenshot. Fetch and pass:
    - `clients` (already fetched)
    - `contracts` for `load.clientId` — **new**: `prisma.carrierContract.findMany({ where: { orgId, clientId: load.clientId, status: 'active' }, select: { id, contractNumber, contractName, rateType, baseRate, fuelSurchargeMethod, fuelSurchargeRate } })`. Serialize Decimals to strings. Do **not** copy NewLoadMobile's client-side `useEffect` contract fetch — on a detail page the client is already known, so a fetch would repaint the select.
    - `facilities` — `prisma.carrierFacility.findMany({ where: { orgId }, select: { id, name, city, state }, orderBy: { name: 'asc' } })` (needed by Task 3's stops editor; add it now in the same `Promise.all`)
    - `driverOptions` / `truckOptions` (already derived)
    - `initialData` (already derived) and `mappedStops`
    - `loadAudit`
    - a `mobileStops` array for the timeline: `mappedStops` is `StopBuilderStop[]` and carries **no status**. Build a parallel `Record<string, string>` of stop id → status from `stopsForMapping` where those are real `CarrierStop` rows; `pendingStopsJson` stops have no status and get no pill.

    **LoadDetailMobile.tsx** — `'use client'`, modeled on `TripDetailMobile.tsx`. §6 is explicit:
    children are **tabs**, not inline stacked sections. The desktop's inline stack (LoadForm +
    LoadDetailActions + DriverAssignmentSection + AuditTrailFooter) must NOT be copied.

    Structure:
    - `NavHeader title={isEditing ? 'Edit Load' : 'Load'}`; `onBack` → `/carrier/loads` (§12: tab
      ROOTS omit onBack, a detail pushed from a root has it — Loads is a bottom-tab root, so the
      overview has none but this page does). `left` = Cancel when editing; `right` = Save (emphasized,
      disabled until `dirty`) when editing, else `Edit`.
    - Identity: centered `load.referenceNumber` at `text-[22px] font-bold text-ds-txt` + `StatusPill`.
      **Reuse LoadsMobile's `STATUS_META` tones exactly** — pending=neutral, in_transit=accent,
      delivered=success, **invoiced=success** (locked: the desktop's purple has no ds equivalent and
      `vip` amber is reserved for VIP tags), cancelled=danger.
    - `ParentStrip` → the trip, when `load.dispatchId`: label `parsedDispatchNumber ?? 'View Trip'`,
      icon `Truck`, `onClick` → **`/carrier/trips/${load.dispatchId}`**. Note the desktop
      `LoadDetailActions` links to `/carrier/dispatches/...`; do not copy that — commit 4986a301 removed
      that 308 redirect hop.
    - `SegmentedControl` tabs: Details / Stops / Assignments. Task 3 fills Stops + Assignments; here
      they may render a placeholder — but wire the tab state now.
    - Details tab, one `isEditing` flag driving both modes (§6: one component, not two screens), with
      `SectionHeader` + `FieldGroup` groups ordered per §7 (Identity → Operational → Financial):
      - **Client & load** — client (select), contract (select, only when `contracts.length > 0`),
        load type, BOL #, PO #
      - **Commodity** — commodity *, weight (lbs), pieces; `Toggle` "Hazmat" tone="warning"
      - **Rate** — `Toggle` "Brokered to another carrier"; rate type (8 values), rate ($), other
        charges ($), planned miles, carrier cost ($) only when `brokerFlag`; then the live revenue
        preview card. **Import `RATE_TYPES` labels, `money`/`raw`/`num`/`fmtMoneyInput`/`fmtIntInput`,
        the `moneyInput`/`intInput` helpers and the `calculateRevenuePreview` block from
        `NewLoadMobile.tsx`** — lift the shared ones into a small local module or copy them across
        deliberately; do not write a third money formatter.
      - **Instructions** — special instructions (multiline)
      Picking a contract auto-fills rateType + rateAmount and toasts "Rate filled from contract" —
      same as `NewLoadMobile.handleContractChange`, but reading from the server-passed `contracts`.
    - Save: port `LoadForm.handleSubmit` (lines 356–455) payload construction **verbatim**, minus the
      create-only dispatch branch. Validate client + commodity + every stop has a facility; on failure
      `toast.error('Check the highlighted fields')`, inline errors, input preserved.
      **Send `stops` in the payload**, seeded in state from the `mappedStops` prop. Never send
      `stops: []` on a load that has stops — `updateLoad` deletes pending stops absent from the payload.
      `PATCH /api/v1/carrier/loads/${loadId}` → `navigator.vibrate?.(10)`, `toast.success('Load
      updated')`, `setIsEditing(false)`, `router.refresh()` — return to view **in place**, no navigation.
    - Audit footer at the bottom of the Details tab when `loadAudit` exists: a ds card
      (`rounded-[20px] bg-ds-card p-4`) with `text-[13px] text-ds-txt3` created/updated by + when. Do
      not mount the shadcn `AuditTrailFooter` inside the mobile branch.

    Rules that will be checked: zero borders on cards, no hex literals (`ds.*` tokens only), layout
    spacing on the 5-value scale, no spinner (`Skeleton` if anything loads), ≥44px targets with
    `active:opacity-75`, `aria-label` on icon-only controls.
  </action>
  <verify>
    `cd apps/web && npx tsc --noEmit` — no new errors vs baseline.
    `git diff apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx` — every removed/added line is
    wrapper JSX, imports, or the new Promise.all queries; no desktop JSX changed.
    Device/narrow viewport: `/carrier/loads/[id]` is dark ds; the Client select shows the real client on
    first paint; Edit → change rate → Save → toast + values persist after refresh; resize ≥1024px → the
    old desktop page, unchanged.
  </verify>
  <done>Mobile Loads Detail renders identity + status + ParentStrip + tabs; Details tab reads and edits Client/Commodity/Rate/Instructions through one isEditing flag and saves via PATCH with stops intact; audit shows; desktop untouched. Committed.</done>
</task>

<task type="auto">
  <name>Task 3: Actions and children — Add to Trip sheet, Cancel Load sheet, Stops tab, Assignments tab</name>
  <files>
    apps/web/src/app/(owner)/carrier/loads/[id]/LoadDetailMobile.tsx
    apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx
  </files>
  <action>
    **Actions** — port the gating from `LoadDetailActions.tsx` VERBATIM; it is subtle:
    - `status === 'cancelled'` → no actions at all.
    - has `dispatchId` → the trip lives in the ParentStrip (Task 2); additionally show **Cancel Load**
      only when `status === 'pending'`.
    - no `dispatchId` and `status === 'pending'` → **Add to Trip** (`PrimaryButton`) + **Cancel Load**.
    - no `dispatchId` and status is anything else → no actions.
    Cancel Load is destructive: a `SheetContainer` (not a `PrimaryButton`), body ported from
    `CancelLoadModal.tsx` — reason field + the `removeStops` toggle shown only when `pendingStopCount > 0`,
    wording preserved → `POST /api/v1/carrier/loads/${loadId}/cancel` with `{ removeStops, reason }`.

    **Add to Trip** — a `SheetContainer` porting `DispatchLoadModal`'s two modes via a
    `SegmentedControl` (New trip / Existing trip):
    - _Existing trip_: `GET /api/v1/carrier/dispatches?...` (reuse the modal's wide date range +
      `getWideDateRange`), list open trips in a `FieldGroup` select or `EntityRow`s →
      `PATCH /api/v1/carrier/loads/${loadId}` `{ dispatchId }`.
    - _New trip_: primary driver, truck, scheduled departure (`datetime-local`, default from
      `getDefaultDeparture`), planned miles → `POST /api/v1/carrier/dispatches` then
      `PATCH /api/v1/carrier/loads/${loadId}` `{ dispatchId: newDispatchId }`. Keep the modal's
      two-step error handling — if the dispatch is created but the load PATCH fails, surface the real
      error rather than a silent success.
    Drivers/trucks come from the server-passed `driverOptions`/`truckOptions` (Task 2). **Deliberately
    out of scope**: route-template prefill and co-driver — they are desktop conveniences, not required
    to put a load on a trip, and the desktop modal stays available at lg+. Say so in a code comment so
    the omission reads as a decision, not an oversight.
    On success: `navigator.vibrate?.(10)`, `toast.success('Load added to trip')`, `router.refresh()`.

    **Stops tab** — parity with the Details tab's single `isEditing` flag:
    - view: a ds dot timeline modeled on `TripDetailMobile`'s stops tab — `sequenceOrder`. type label,
      facility name · city/state, appointment window via a `fmtWindow` helper, and a `StatusPill` only
      where a status exists (Task 2's status map; `pendingStopsJson` stops have none). `EmptyState`
      (icon `MapPin`) when there are no stops.
    - editing: render `<MobileStopsEditor stops={stops} onChange={setStops} facilities={facilities} error={errors.stops} mode="load" />`
      from `@/components/carrier/stops/MobileStopsEditor` — the same editor `NewLoadMobile` uses. Its
      array feeds the Task 2 save payload, so no separate save and no `stops: []` hazard.

    **Assignments tab** — `DriverAssignmentSection` is an async server component calling
    `listAssignmentsForLoad(loadId)`. Call `listAssignmentsForLoad(id)` in `page.tsx` and pass
    `initialAssignments` (`SerializedAssignment[]`) down. Render **read-only** ds rows: driver name
    (`MonogramAvatar`), `driverRole`, `payType` · `baseRate`/`rateUnit`, and a `StatusPill` for
    `payStatus`. `EmptyState` when empty, with one line pointing at the desktop for creating an
    assignment. Do **not** mount `AssignmentSectionClient` inside the mobile branch — it is shadcn and
    would paint white inside the dark shell. Creating/editing assignments on mobile is explicitly out of
    scope for this task; note it in the summary as the follow-up.
  </action>
  <verify>
    `cd apps/web && npx tsc --noEmit` — no new errors vs baseline.
    Device/narrow viewport: a pending load with no trip shows Add to Trip + Cancel Load; adding to an
    existing trip refreshes into a ParentStrip chip; a cancelled load shows no actions; Stops tab shows
    the timeline and swaps to `MobileStopsEditor` under Edit, and a stop edited there survives Save +
    refresh; Assignments tab lists assignments or an empty state.
    Resize ≥1024px → desktop unchanged.
  </verify>
  <done>Add to Trip and Cancel Load work from mobile with the desktop's exact gating; Stops tab views and edits stops through the shared editor; Assignments tab lists assignments read-only. Committed.</done>
</task>

</tasks>

<verification>
- `cd apps/web && npx tsc --noEmit` exits 0 apart from the ~35 known baseline errors (framer-motion,
  zustand, nuqs, papaparse, d3-geo, @tanstack/react-virtual missing @types). Any error inside a touched
  file, or an increase in the count, is a failure.
- `git diff` on `page.tsx` touches only the mobile wrapper, imports, and the new server queries — the
  `hidden lg:block` desktop JSX is byte-for-byte unchanged.
- `apps/mobile` has zero changes.
- ds QA (§9) on the mobile branch: no borders on cards, no hex literals, layout spacing ∈ {8,12,16,20,24},
  accent used ≲4 times, no spinners, ≥44px targets with `active:opacity-75`, icon-only controls labelled.
- The rate-type fix landed as its own commit, before the rebuild commits.
</verification>

<success_criteria>
- A `per_load` / `per_hour` load saves from the edit form (no 400).
- `/carrier/loads/[id]` on a phone is the dark ds screen: identity + status pill, ParentStrip → trip,
  Add to Trip / Cancel Load, Details / Stops / Assignments tabs, Edit toggle, audit footer.
- Selects show saved values on first paint (server-derived options).
- Desktop at lg+ is unchanged.
- Three commits, one per task. **Nothing is pushed** — the user pushes and deploys.
</success_criteria>

<output>
After completion, create `.planning/quick/469-rebuild-carrier-loads-detail-on-the-mobi/469-SUMMARY.md`.

Also append a **Loads (Detail)** entry to `.planning/mobile-design-system.md` §12, matching the style of
the existing entries: date, file, what was reused vs ported, the decisions taken (invoiced=success,
trips-not-dispatches link, server-derived selects, route-template/co-driver omission from Add to Trip,
assignments read-only), and `tsc --noEmit` → exit 0. Update the trailing **Pending** line on the Loads
(Overview) entry — Create and Detail are both done, so the Loads four-page set is complete.
</output>
</content>
</invoke>
