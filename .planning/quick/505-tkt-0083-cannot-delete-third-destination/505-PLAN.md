---
phase: quick-505
plan: 505
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/routes/waypoint-list.ts
  - apps/web/src/lib/routes/waypoint-list.test.ts
  - apps/web/src/components/shared/address-autocomplete.tsx
  - apps/web/src/components/routes/FacilityAddressSelect.tsx
  - apps/web/src/components/routes/route-form.tsx
  - apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx
autonomous: true

must_haves:
  truths:
    - "On /routes/new with 3 rows (Origin 1, Stop 2, Destination 3), row 3 has a visible remove control — the user can delete the row numbered 3"
    - "Removing the last row promotes the previous row to Destination (Delivery); removing the first row promotes the next row to Origin (Pickup)"
    - "The remove control is rendered on EVERY row (never silently absent); when only 2 rows remain it is disabled with a title/aria explaining a route needs an origin and a destination"
    - "After ANY row removal the middle stops still submit as contiguous stops_0_*, stops_1_* ... with no index gaps"
    - "Addresses typed manually (without picking an autocomplete suggestion) survive a removal that shifts a row's FormData field name"
    - "Mobile (lg:hidden) RouteCreateMobile has identical removal behavior to desktop route-form"
    - "The pure waypoint removal helper is unit-tested"
  artifacts:
    - path: "apps/web/src/lib/routes/waypoint-list.ts"
      provides: "Pure removeWaypointById + canRemoveWaypoint with endpoint-type normalization"
      exports: ["removeWaypointById", "canRemoveWaypoint"]
    - path: "apps/web/src/lib/routes/waypoint-list.test.ts"
      provides: "Vitest covering middle/first/last removal, 2-row floor, type normalization, contiguous stop indices"
    - path: "apps/web/src/components/routes/route-form.tsx"
      provides: "Desktop remove control on every waypoint row, wired to the helper"
    - path: "apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx"
      provides: "Mobile parity remove control on every waypoint row"
    - path: "apps/web/src/components/shared/address-autocomplete.tsx"
      provides: "onQueryChange callback so typed text is observable by the parent"
    - path: "apps/web/src/components/routes/FacilityAddressSelect.tsx"
      provides: "manualAddress kept in sync with typing so a name-driven remount restores the text"
  key_links:
    - from: "apps/web/src/components/routes/route-form.tsx"
      to: "apps/web/src/lib/routes/waypoint-list.ts"
      via: "removeWaypointById / canRemoveWaypoint"
      pattern: "removeWaypointById"
    - from: "apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx"
      to: "apps/web/src/lib/routes/waypoint-list.ts"
      via: "removeWaypointById / canRemoveWaypoint"
      pattern: "removeWaypointById"
    - from: "apps/web/src/components/routes/FacilityAddressSelect.tsx"
      to: "apps/web/src/components/shared/address-autocomplete.tsx"
      via: "onQueryChange prop"
      pattern: "onQueryChange"
---

<objective>
TKT-0083 (HIGH, DESKTOP, `/routes/new`): "cant delete distenation three (3)".

**Root cause — VERIFIED in source, do NOT re-diagnose.**

`/routes/new` renders ONE ordered waypoint list. Row 1 is hard-coded Origin (Pickup),
row N is hard-coded Destination (Delivery), and everything between is a user stop.
In BOTH `route-form.tsx` (desktop, ~line 384) and `RouteCreateMobile.tsx` (~line 334)
the entire reorder+remove button cluster is wrapped in:

```jsx
{!isFirst && !isLast && ( <div> up / down / X </div> )}
```

So the remove (X) button is **not rendered at all** on the first and last rows. After the
user clicks "Add Stop" once, the rows are badged `1 Origin (Pickup)`, `2 Stop`,
`3 Destination (Delivery)` — the reporter's "destination three (3)" is that row 3, and it
has no X, no disabled X, no tooltip, and no explanation. `removeWaypoint()` itself is fine
(it filters by `clientId` and floors at 2 rows); the row simply has no control to invoke it.

Secondary defect found while tracing (must be fixed, or the fix below causes data loss):
a row's FormData field name is derived from its index (`stops_${idx - 1}_address`, or
`origin`/`destination` at the endpoints). `FacilityAddressSelect` renders manual mode as
`<AddressAutocomplete key={`manual-${name}`} defaultValue={manualAddress} />`. Removing a
row shifts later rows' `name`, which changes that `key`, which **remounts**
AddressAutocomplete and resets its internal `query` state to `manualAddress`. But
`manualAddress` is only ever written by `onPlaceSelect` — free-typed text lives solely in
the input. Result today: deleting a stop silently wipes the typed address of every row
below it. Promoting a row to Destination (the fix) would trigger exactly this.

The fix: every row gets a remove control. Removing the last row promotes the previous row
to Destination; removing the first row promotes the next row to Origin. Never drop below
2 rows (origin + destination are required by the `createRoute`/`updateRoute` contract).

Purpose: the user can delete the row they are looking at, whichever row it is.
Output: a pure tested helper + desktop, mobile, and address-input fixes.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
Anchors below are VERIFIED against current source (post quick-504 — do NOT revert the
driver-selector work in these files: `listRouteAssignableDrivers`, `routeDriverBlockedLabel`,
`driver.assignable`/`blockedReason`, `carrierDriverId` keys).

**Waypoint shape** (declared identically in both components):
```ts
interface Waypoint {
  clientId: string;              // crypto.randomUUID(), used as the React key
  type: 'PICKUP' | 'DELIVERY';
  address: string;
  scheduledAt: string;
  notes: string;
}
```

**FormData contract (unchanged by this task):**
- Row 0 submits `origin`; row N-1 submits `destination` (address only — endpoints have no
  per-row time/notes field in the server contract).
- Middle rows submit `stops_<k>_address` plus hidden `stops_<k>_type|scheduledAt|notes|lat|lng`,
  where `k` is derived from `waypoints.slice(1, -1)` on every render — contiguity after a
  removal is therefore automatic and MUST stay that way.
- `stops_submitted="true"` sentinel is already present in both forms.

**Files:**
- Desktop: `apps/web/src/components/routes/route-form.tsx` (also used by the route EDIT page — the change is intentionally shared)
- Mobile: `apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx`
- Shared address control: `apps/web/src/components/routes/FacilityAddressSelect.tsx`
- Autocomplete input: `apps/web/src/components/shared/address-autocomplete.tsx`

**Test convention (from quick-503/504):** pure helper at `src/lib/<domain>/<name>.ts`
with a colocated `<name>.test.ts`. Vitest config already globs `src/**/*.test.ts`.
Run with `cd apps/web && npx vitest run src/lib/routes/waypoint-list.test.ts`.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Pure waypoint removal helper + Vitest</name>
  <files>
    apps/web/src/lib/routes/waypoint-list.ts
    apps/web/src/lib/routes/waypoint-list.test.ts
  </files>
  <action>
Create `apps/web/src/lib/routes/waypoint-list.ts` — pure, no React, no imports:

```ts
/** Minimal structural shape shared by RouteForm and RouteCreateMobile waypoints. */
export interface WaypointLike {
  clientId: string;
  type: 'PICKUP' | 'DELIVERY';
}

export const MIN_WAYPOINTS = 2; // a route always needs an origin + a destination

/** A row may be removed only while more than MIN_WAYPOINTS rows exist. */
export function canRemoveWaypoint<T extends WaypointLike>(waypoints: T[]): boolean

/**
 * Remove the row with `clientId`, then normalize endpoints so the list stays valid:
 * first row -> type 'PICKUP' (Origin), last row -> type 'DELIVERY' (Destination).
 * Removing the LAST row promotes the previous row to Destination; removing the FIRST
 * row promotes the next row to Origin. Returns the SAME array reference when the
 * removal is refused (length <= MIN_WAYPOINTS) or `clientId` is not found, so callers
 * can use it directly inside a setState updater with no extra render.
 */
export function removeWaypointById<T extends WaypointLike>(waypoints: T[], clientId: string): T[]
```

Implementation notes:
- Guard first: `if (waypoints.length <= MIN_WAYPOINTS) return waypoints;`
- `const next = waypoints.filter(w => w.clientId !== clientId); if (next.length === waypoints.length) return waypoints;`
- Normalize by returning NEW objects only for the endpoints whose type actually changes
  (`{ ...w, type: 'PICKUP' }` / `{ ...w, type: 'DELIVERY' }`), leaving middle rows
  referentially untouched. Never mutate the input.
- Do NOT reassign `clientId` — React keys and the `waypointCoords` map depend on it.

Create `apps/web/src/lib/routes/waypoint-list.test.ts` covering:
1. Removing a middle stop from `[O, S1, S2, D]` yields `[O, S1, D]` (order preserved, D still last).
2. Removing the LAST row from `[O, S1, D]` yields `[O, S1]` and `S1.type === 'DELIVERY'` (the TKT-0083 case).
3. Removing the FIRST row from `[O, S1, D]` yields `[S1, D]` and `S1.type === 'PICKUP'`.
4. A 2-row list `[O, D]` is unchanged for either clientId, and the SAME reference is returned.
5. An unknown clientId returns the SAME reference.
6. Input array is not mutated.
7. Contiguity: for `[O, S1, S2, S3, D]`, after removing `S1`, mapping
   `result.slice(1, -1).map((_, k) => \`stops_\${k}_address\`)` equals
   `['stops_0_address', 'stops_1_address']` — no index gaps.
8. `canRemoveWaypoint` is false at length 2, true at length 3.
  </action>
  <verify>cd apps/web && npx vitest run src/lib/routes/waypoint-list.test.ts</verify>
  <done>All Vitest cases pass; helper is pure and exports `removeWaypointById`, `canRemoveWaypoint`, `MIN_WAYPOINTS`.</done>
</task>

<task type="auto">
  <name>Task 2: Preserve manually typed addresses across field-name changes</name>
  <files>
    apps/web/src/components/shared/address-autocomplete.tsx
    apps/web/src/components/routes/FacilityAddressSelect.tsx
  </files>
  <action>
Prerequisite for Task 3 — without it, promoting a row to Origin/Destination wipes its
typed address (the `key={`manual-${name}`}` remount described in the objective).

In `address-autocomplete.tsx`:
- Add optional prop `onQueryChange?: (value: string) => void` to `AddressAutocompleteProps`.
- Call `onQueryChange?.(val)` inside `handleChange`, immediately after `setQuery(val)`
  (before the debounce branches, so it fires for short/cleared values too).
- Also call `onQueryChange?.(place.displayName)` in `handleSelect` for consistency.
- Change nothing else — the debounce, suggestion fetch, outside-click handling and the
  existing `onPlaceSelect` contract stay exactly as they are. The prop is optional, so
  every other caller of AddressAutocomplete is unaffected.

In `FacilityAddressSelect.tsx`:
- Pass `onQueryChange={(val) => { setManualAddress(val); onAddressChange?.(val); }}` to the
  `<AddressAutocomplete>` in manual mode.
- Leave the `key={`manual-${name}`}` in place; with `manualAddress` now tracking every
  keystroke, a remount restores the exact text instead of reverting to '' .
- Do not touch the facility-mode hidden input, `composeFacilityAddress`, the
  `initializedRef` init effect, or the 4s manual-mode fallback effect.
  </action>
  <verify>cd apps/web && npx tsc --noEmit 2>&1 | grep -E "address-autocomplete|FacilityAddressSelect" || echo "no new type errors in touched files"</verify>
  <done>Typing a raw address into a stop row, then removing a different row (which shifts this row's `name`), leaves the typed text intact in the input and in the submitted FormData.</done>
</task>

<task type="auto">
  <name>Task 3: Render a remove control on every waypoint row (desktop + mobile)</name>
  <files>
    apps/web/src/components/routes/route-form.tsx
    apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx
  </files>
  <action>
Apply the SAME change to both files (they hold verbatim-identical waypoint state).

1. Import the helper: `import { removeWaypointById, canRemoveWaypoint } from '@/lib/routes/waypoint-list';`

2. Replace the body of `removeWaypoint` with the helper:
```ts
function removeWaypoint(clientId: string) {
  setWaypoints((prev) => removeWaypointById(prev, clientId));
}
```
Keep `addWaypoint`, `moveWaypointUp`, `moveWaypointDown`, `updateWaypoint` and the
origin/dest coord derivation exactly as they are — the derived `originCoords`/`destCoords`
already recompute from the new first/last `clientId`, so the OSRM distance self-corrects
after a promotion.

3. Restructure the row header controls. Today:
```jsx
{!isFirst && !isLast && (
  <div className="flex items-center gap-0.5 ..."> up / down / X </div>
)}
```
Change to an ALWAYS-rendered control cluster in which only the reorder buttons stay
middle-only, and the X is always present:
```jsx
<div className="flex items-center gap-0.5 shrink-0">
  {!isFirst && !isLast ? ( <>up button</> <>down button</> ) : null}
  <button
    type="button"
    onClick={() => removeWaypoint(wp.clientId)}
    disabled={isPending || !canRemoveWaypoint(waypoints)}
    title={removeTitle}
    aria-label={removeTitle}
    className={/* unchanged existing X button classes for that file */}
  >
    <X className="h-4 w-4" />
  </button>
</div>
```
Keep each file's own styling tokens: desktop uses the existing
`inline-flex ... p-2 min-h-[44px] min-w-[44px] ... hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 disabled:opacity-30`;
mobile uses `flex h-12 w-12 items-center justify-center rounded-full text-ds-txt3 transition active:opacity-75 disabled:opacity-30`.
Do not introduce new design tokens or classes.

4. Compute the title/aria per row so the control is self-explaining:
```ts
const removeTitle = !canRemoveWaypoint(waypoints)
  ? 'A route needs at least an origin and a destination'
  : isFirst
    ? 'Remove origin — the next stop becomes the origin'
    : isLast
      ? 'Remove destination — the previous stop becomes the destination'
      : `Remove stop ${idx + 1}`;
```
The disabled state (only reachable at exactly 2 rows) must remain VISIBLE, not hidden —
the absence of any control is the bug being fixed.

5. Endpoint rows keep their existing layout otherwise: the fixed
"Origin (Pickup)" / "Destination (Delivery)" label span stays (no type `<select>` on
endpoints), and endpoints still render no Scheduled Time / Notes fields. Ensure the label
span keeps `flex-1 min-w-0` so the newly added X sits flush right without pushing layout.

6. Do NOT change: the `stops_submitted` sentinel, the hidden
`stops_${k}_type|scheduledAt|notes|lat|lng` block derived from `waypoints.slice(1, -1)`,
the `fieldName` derivation (`origin` / `destination` / `stops_${idx - 1}_address`), the
`required={isFirst || isLast}` rule on the address field, the driver/co-driver/truck
sections from quick-504, or the mobile `NavHeader`/`PrimaryButton` ds shell.
  </action>
  <verify>
cd apps/web && npx tsc --noEmit 2>&1 | grep -E "route-form|RouteCreateMobile" || echo "no new type errors in touched files"
Then manually on /routes/new (desktop, lg+): click "Add Stop" once -> rows badge 1/2/3 ->
row 3 "Destination (Delivery)" now shows an X -> click it -> row 2 becomes
"Destination (Delivery)", 2 rows remain, and both remaining X buttons render disabled with
the "needs at least an origin and a destination" title. Repeat under 1024px width for the
mobile view.
  </verify>
  <done>
Every row on both desktop and mobile New Route renders a remove control. Row 3 in an
Origin/Stop/Destination list is deletable and promotes row 2 to Destination. The list never
drops below 2 rows. Middle stops still submit as contiguous `stops_0_*`, `stops_1_*`.
No regression to the quick-504 driver selector or the createRoute FormData contract.
  </done>
</task>

</tasks>

<verification>
- `cd apps/web && npx vitest run src/lib/routes/waypoint-list.test.ts` — all pass.
- `cd apps/web && npx tsc --noEmit` — no NEW errors (35 pre-existing baseline errors are
  expected; only flag regressions or errors inside the six touched files).
- Manual /routes/new desktop: Add Stop x1 -> delete row 3 (Destination) -> succeeds,
  row 2 relabels to "Destination (Delivery)".
- Manual /routes/new desktop: Add Stop x3, type raw addresses into stops 1-3, delete the
  first stop -> the remaining stops keep their typed addresses (Task 2 regression check).
- Manual /routes/new mobile (<1024px): same two checks.
- Submit a route after a deletion and confirm it saves with the correct destination and
  contiguous stops.
</verification>

<success_criteria>
- The reporter's exact action — deleting the row numbered 3 on /routes/new — works.
- The remove control exists on every row and is never silently absent.
- Removing an endpoint promotes its neighbour; the list floors at origin + destination.
- Stop indices stay contiguous; no FormData contract change.
- Manually typed addresses survive removals.
- Desktop and mobile behave identically.
- Pure removal helper is unit-tested.
</success_criteria>

<output>
After completion, create `.planning/quick/505-tkt-0083-cannot-delete-third-destination/505-SUMMARY.md`
</output>
