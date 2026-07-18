---
phase: quick-475
plan: 475
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx
  - apps/web/src/app/(owner)/routes/new/page.tsx
  - apps/web/src/components/quick-actions/quickActions.config.ts
autonomous: true

must_haves:
  truths:
    - "At a phone viewport, /routes/new renders the mobile ds layout (grouped sections, ds inputs, stops editor, live distance badge, driver/truck/co-driver pickers) instead of the legacy desktop form"
    - "Creating a route on mobile (origin + destination + date + driver + truck, optional stops/co-drivers) succeeds and redirects to /routes/{id} exactly like desktop"
    - "Desktop (lg+) /routes/new is visually and behaviorally unchanged"
    - "The New Dispatch Quick Create menu item opens /carrier/trips/new (the create form), not the trips list"
  artifacts:
    - path: "apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx"
      provides: "Mobile-web ds rebuild of the New Route form, submitting via createRoute server action with the identical FormData contract"
      min_lines: 250
    - path: "apps/web/src/app/(owner)/routes/new/page.tsx"
      provides: "lg:hidden mobile wrapper + hidden lg:block desktop wrapper (desktop NewRouteClient unchanged)"
      contains: "lg:hidden"
    - path: "apps/web/src/components/quick-actions/quickActions.config.ts"
      provides: "New Dispatch item repointed to /carrier/trips/new"
      contains: "/carrier/trips/new"
  key_links:
    - from: "RouteCreateMobile.tsx"
      to: "createRoute"
      via: "useActionState + <form action={formAction}>"
      pattern: "useActionState\\(createRoute"
    - from: "RouteCreateMobile.tsx origin/destination"
      to: "OSRM distance badge"
      via: "onPlaceSelect coords -> getOSRMDistanceMiles effect -> hidden distanceMiles input"
      pattern: "getOSRMDistanceMiles"
    - from: "page.tsx"
      to: "RouteCreateMobile"
      via: "lg:hidden -m-4 wrapper"
      pattern: "RouteCreateMobile"
---

<objective>
Full faithful rebuild of the "New Route" form (/routes/new) on the DriveCommand mobile-web design system, preserving ALL functionality (route name, origin/destination address autocomplete, live OSRM distance badge, scheduled date, multi-stop editor with type/address/time/notes/reorder/remove, primary driver, carrier-truck picker, co-drivers multi-select, notes). Plus a tiny separate fix: repoint the "New Dispatch" Quick Create menu item to the create form at /carrier/trips/new.

Purpose: /routes/new is the last Quick Create destination still rendering the old desktop form at phone widths. Unlike the simple carrier create forms, this is a rich interactive owner-portal form — nothing may be dropped on mobile.

Output: A new `RouteCreateMobile.tsx` rendered via an `lg:hidden` wrapper in page.tsx (desktop untouched), and a one-line href fix in the Quick Create config.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md

# Desktop source to port VERBATIM (logic) and restyle (only)
@apps/web/src/components/routes/route-form.tsx
@apps/web/src/app/(owner)/routes/new/page.tsx
@apps/web/src/app/(owner)/routes/new/new-route-client.tsx

# Server action — DO NOT CHANGE. The mobile form must produce the exact keys it parses.
@apps/web/src/app/(owner)/actions/routes.ts

# Shared building blocks the desktop form uses — reuse identically
@apps/web/src/components/shared/address-autocomplete.tsx
@apps/web/lib/geo/osrm.ts

# Established mobile-ds create pattern to mirror (layout/components/tokens)
@apps/web/src/app/(owner)/carrier/facilities/new/FacilityCreateMobile.tsx
@apps/web/src/app/(owner)/carrier/facilities/new/page.tsx
@apps/web/src/components/ui/ds/SheetInput.tsx
@apps/web/src/components/ui/ds/index.ts

# Config to edit in Task 2
@apps/web/src/components/quick-actions/quickActions.config.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Build RouteCreateMobile + wire it into page.tsx via lg:hidden wrapper</name>
  <files>
    apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx (new)
    apps/web/src/app/(owner)/routes/new/page.tsx (modify — add wrappers only)
  </files>
  <action>
FIRST, read `apps/web/src/components/routes/route-form.tsx` IN FULL and `createRoute` in `apps/web/src/app/(owner)/actions/routes.ts` IN FULL. This is a port-logic-verbatim, restyle-only task — silent regressions hide in the FormData contract. Do not start writing until you have both fully in mind.

CREATE `apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx` ('use client'). It is a mobile-ds restyle of RouteForm's new-route path. Reuse RouteForm's exact React logic (state, effects, handlers) — copy it, then reskin the markup with ds tokens and ds layout components. It receives the SAME props NewRouteClient passes today:
  `drivers: Array<{ id; firstName; lastName }>` and `trucks: Array<{ id; unitNumber; displayName }>` (these are CARRIER trucks from listCarrierTrucks per quick-470).

SUBMIT VIA THE SAME SERVER ACTION using the IDENTICAL FormData contract:
  - `const [state, formAction, isPending] = useActionState(createRoute, { success: false })` (import createRoute from `@/app/(owner)/actions/routes`).
  - Render a real `<form ref={formRef} action={formAction}>` wrapping the fields. Trigger submission from the NavHeader right button and the bottom PrimaryButton via `formRef.current?.requestSubmit()`.
  - `const fieldErrors = typeof state?.error === 'object' ? state.error : undefined;` — render inline errors per field exactly like RouteForm (origin, destination, scheduledDate, driverId, carrierTruckId, notes). Render a general banner when `state.error` is a string.

PRESERVE THE EXACT FormData KEYS (cross-check every one against createRoute's parser after building):
  - Hidden `distanceMiles` — value = rounded OSRM `distance` state when set, else '' (new route has no initialData fallback).
  - Hidden `coDriverIds` — comma-separated `coDriverIds.join(',')`.
  - Hidden `stops_submitted` = "true".
  - Per stop i (index-based, in array order): hidden `stops_${i}_type`, `stops_${i}_scheduledAt`, `stops_${i}_notes`, `stops_${i}_lat`, `stops_${i}_lng`, PLUS the AddressAutocomplete for the stop rendered with `name={`stops_${i}_address`}`.
  - Named inputs: `name` (optional text), `origin` (AddressAutocomplete), `destination` (AddressAutocomplete), `scheduledDate` (datetime-local, required), `driverId` (select, required), `carrierTruckId` (select, required), `notes` (textarea).
  - CRITICAL: the truck select MUST be named `carrierTruckId` (NOT `truckId`) — that is the exact key createRoute parses and RouteForm submits. A renamed/missing hidden field silently breaks route creation (stops lost, wrong/no truck).

REUSE THE SAME BUILDING BLOCKS (do NOT swap for manual entry):
  - `AddressAutocomplete` from `@/components/shared/address-autocomplete` for origin, destination, and each stop address. It accepts `className` applied to its inner `<input>`. Pass a ds input className matching SheetInput's field styling (`h-[46px] w-full rounded-[12px] bg-ds-input px-3 text-[16px] text-ds-txt outline-none placeholder:text-ds-txt3`) so the field reads as ds. Read `SheetInput.tsx` for the authoritative token string; do not hardcode hex/hsl. Keep the `onPlaceSelect` handlers wiring coords into state exactly as RouteForm does.
  - `getOSRMDistanceMiles` from `@/lib/geo/osrm` — keep the useEffect that fetches road distance when both origin+dest coords exist, with `distanceLoading` state.

LIVE DISTANCE BADGE = a ds card (NOT the old blue border box). Show:
  - loading: ds card (`rounded-[20px] bg-ds-card px-4 py-3`) with a spinner + "Calculating road distance…" in `text-ds-txt2`.
  - loaded: ds card showing "Estimated distance: N miles" (accent `text-ds-accent` or the project accent token for the number). Round + toLocaleString like RouteForm.
  (No saved-distance fallback needed — this is the create path only.)

MOBILE DS LAYOUT (mirror FacilityCreateMobile):
  - `MobileScreen` (className "pb-10 pt-2") containing the `<form>`.
  - `NavHeader` title "New Route", left `NavTextButton` "Cancel" -> `router.push('/routes')` (or router.back()), right `NavTextButton` label "Create" (or "Creating…" when isPending), emphasized, onClick submits, disabled while isPending.
  - `SectionHeader` groups:
    * ROUTE DETAILS: route name (optional), origin (AddressAutocomplete), destination (AddressAutocomplete), the live distance badge, scheduled date (datetime-local).
    * STOPS: SectionHeader with an action `{ label: 'Add', onClick: addStop }`. Empty state = ds card "No stops yet…". Each stop = a ds card (`rounded-[20px] bg-ds-card p-4`) with a position badge, a type select (PICKUP/DELIVERY) with an explicit first option, reorder up/down + remove buttons (touch targets >=48, ds icon-button styling, accessibility/aria-labels), the stop AddressAutocomplete, scheduled time (datetime-local, optional), notes (optional). Keep addStop/removeStop/moveStopUp/moveStopDown/updateStop and stopCoords Map logic verbatim.
    * ASSIGNMENTS: primary driver select (named `driverId`, controlled `selectedDriverId` state so co-driver list can exclude it), carrier truck select (named `carrierTruckId`, options render `truck.displayName || truck.unitNumber`). Both selects need an explicit "Select…" placeholder first option (native-select-first-option gotcha) and the empty-state helper text RouteForm shows when the list is empty. Co-Drivers = ds rows (one per driver excluding the selected primary) with a checkmark/toggle affordance, toggling into `coDriverIds` state (mirror RouteForm's toggleCoDriver). Only render the block when there is at least one eligible driver.
    * NOTES: textarea named `notes`.
  - Bottom `PrimaryButton` label "Create Route" (loading while isPending) that submits the form. Keep ONE PrimaryButton per screen (the bottom one) — the NavHeader right acts as the mirrored Save affordance like FacilityCreateMobile.
  - Style native `<select>` / `<textarea>` / datetime-local inputs with the same ds token classes as SheetInput (rounded-[12px], bg-ds-input, text-ds-txt, >=46px height). ds tokens ONLY — no hardcoded hex/hsl.

MODIFY `apps/web/src/app/(owner)/routes/new/page.tsx` following the FacilityCreateMobile pattern:
  - Keep the existing server-side data loading (requireTenantId, listDrivers, listCarrierTrucks) unchanged.
  - Render `<div className="lg:hidden -m-4"><RouteCreateMobile drivers={drivers} trucks={trucks} /></div>` and wrap the EXISTING desktop block (the heading + `<NewRouteClient drivers trucks />` card) in `<div className="hidden lg:block space-y-6">…</div>` — desktop markup otherwise UNCHANGED. Do NOT touch new-route-client.tsx or route-form.tsx.

AFTER BUILDING: cross-check EVERY FormData key produced by RouteCreateMobile against createRoute's parser (distanceMiles, name, origin, destination, scheduledDate, driverId, carrierTruckId, notes, coDriverIds, stops_submitted, and the six per-stop keys). Then run `tsc --noEmit`.
  </action>
  <verify>
cd apps/web && npx tsc --noEmit  (repo has ~35 baseline errors; only NEW errors in the two touched files count as regressions)
Grep RouteCreateMobile.tsx to confirm every contract key is present: `name="carrierTruckId"`, `name="driverId"`, `name="origin"`, `name="destination"`, `name="scheduledDate"`, `name="notes"`, `name="distanceMiles"`, `name="coDriverIds"`, `name="stops_submitted"`, `name={`stops_${` (address + type/scheduledAt/notes/lat/lng).
Confirm page.tsx has both `lg:hidden` (mobile) and `hidden lg:block` (desktop) wrappers and still imports NewRouteClient for desktop.
  </verify>
  <done>
At a phone viewport /routes/new renders the ds layout (grouped sections, ds inputs, dynamic stops editor, ds distance badge, driver/truck/co-driver pickers). Submitting with origin/destination/date/driver/truck (and optional stops/co-drivers) calls createRoute and redirects to /routes/{id} exactly like desktop. Field errors from the action state render inline. Desktop (lg+) is unchanged. tsc introduces no new errors in the touched files.
  </done>
</task>

<task type="auto">
  <name>Task 2: Repoint New Dispatch Quick Create item to /carrier/trips/new</name>
  <files>apps/web/src/components/quick-actions/quickActions.config.ts</files>
  <action>
In the `create-dispatch` item of `QUICK_CREATE_ITEMS`, change `href: "/carrier/dispatches"` to `href: "/carrier/trips/new"` and remove the stale `// TODO: Dispatch creation uses a modal in /carrier/dispatches` comment above it. `/carrier/trips/new` is the confirmed create route (its page.tsx exists and already has a mobile ds view). Leave the item's id/label/icon/shortcut/description and every OTHER config item untouched. This is its own separate small commit.
  </action>
  <verify>
Grep quickActions.config.ts: the create-dispatch item shows `href: "/carrier/trips/new"` and the old `/carrier/dispatches` href + TODO comment are gone. No other items changed (diff touches only the create-dispatch block).
  </verify>
  <done>
The New Dispatch Quick Create menu item navigates to /carrier/trips/new (the create form) instead of the trips list. Committed separately from Task 1.
  </done>
</task>

</tasks>

<verification>
- Phone viewport: /routes/new shows the mobile ds rebuild, not the legacy form; all desktop functionality present (autocomplete, live distance, multi-stop editor, driver/truck/co-drivers, notes).
- Route creation on mobile produces the exact FormData keys createRoute parses and redirects to /routes/{id}.
- Desktop lg+ /routes/new unchanged.
- New Dispatch menu item opens /carrier/trips/new.
- `tsc --noEmit` shows no new errors in touched files.
</verification>

<success_criteria>
- RouteCreateMobile.tsx exists, uses ds tokens/components, submits via createRoute with the identical FormData contract (carrierTruckId, not truckId).
- page.tsx has lg:hidden mobile + hidden lg:block desktop wrappers; new-route-client.tsx and route-form.tsx untouched.
- quickActions.config.ts create-dispatch href = /carrier/trips/new.
- Two commits: one for the Route rebuild (Task 1), one for the New Dispatch href (Task 2). Executor commits only — NO git push, NO deploy.
</success_criteria>

<output>
After completion, create `.planning/quick/475-mobile-ds-rebuild-new-route-form-full-re/475-SUMMARY.md`
</output>
