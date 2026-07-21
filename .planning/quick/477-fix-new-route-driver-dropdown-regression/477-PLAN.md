---
phase: quick-477
plan: 477
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/routes/new/page.tsx
  - apps/web/src/app/(owner)/routes/new/new-route-client.tsx
  - apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx
  - apps/web/src/components/routes/route-form.tsx
  - apps/web/src/app/(owner)/routes/[id]/page.tsx
  - apps/web/src/app/(owner)/routes/[id]/route-page-client.tsx
  - apps/web/src/components/routes/route-edit-section.tsx
  - apps/web/e2e/routes.spec.ts
autonomous: true

must_haves:
  truths:
    - "Selecting a primary driver on New Route (desktop AND mobile) and submitting saves the route — no 'Driver not found' / 'not a driver' error."
    - "Primary-driver and co-driver pickers list DRIVER-role User accounts (Route.driverId FK targets), on create AND edit paths."
    - "The createRoute/updateRoute server-action FormData contract in routes.ts is completely unchanged (zero-diff file)."
    - "Route creation shows ONE ordered 'Route stops' waypoint list: first row = origin (Pickup), last row = destination (Delivery), middle rows = user-typed stops; minimum 2 rows."
    - "On submit the form derives the unchanged FormData: origin=first row address, destination=last row address, distanceMiles from first+last coords, each MIDDLE row emitted as contiguous 0-indexed stops_<i>_* with stops_submitted=true."
    - "Editing an existing route reconstructs the waypoint list from initialData.origin + initialStops (sorted) + initialData.destination and round-trips correctly."
    - "npx tsc --noEmit in apps/web introduces zero new errors vs the ~35-error baseline; touched files are clean."
  artifacts:
    - path: "apps/web/src/app/(owner)/routes/new/page.tsx"
      provides: "New Route data source — DRIVER-role Users via listDrivers(), not carrierDriver"
    - path: "apps/web/src/components/routes/route-form.tsx"
      provides: "Desktop unified waypoint list + edit round-trip reconstruction"
    - path: "apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx"
      provides: "Mobile-web unified waypoint list (create)"
  key_links:
    - from: "route-form.tsx / RouteCreateMobile.tsx waypoint rows"
      to: "createRoute/updateRoute FormData contract"
      via: "FacilityAddressSelect name= mapping (first→origin, last→destination, middle→stops_<i>_address) + hidden stops_<i>_type/scheduledAt/notes/lat/lng"
      pattern: "name=\"origin\"|name=\"destination\"|stops_\\$\\{"
    - from: "first-row coords + last-row coords"
      to: "hidden distanceMiles"
      via: "getOSRMDistanceMiles(lat1,lng1,lat2,lng2)"
      pattern: "getOSRMDistanceMiles"
---

<objective>
Fix a P0 route-creation regression and then unify the route-stop UX.

Part A (Task 1): The New Route driver dropdown was repointed (TKT-0074) at the CARRIER fleet
(`carrierDriver`), but `Route.driverId` is an FK to a DRIVER-role `User`. Carrier-driver ids do not
map to User ids, so every save fails with "Driver not found" / "not a driver". Re-source the
primary-driver AND co-driver pickers from DRIVER-role User accounts (`listDrivers()`) on desktop +
mobile, create + edit paths. This task alone restores route saving and lands as an isolated commit.

Part B (Tasks 2 + 3): Now that origin/destination are facility dropdowns, replace the separate
Origin + Destination fields AND the separate Stops section with ONE ordered "Route stops" waypoint
list (first = origin/Pickup, last = destination/Delivery, middle = user-typed stops), on desktop
(route-form.tsx, which also serves the edit path) and mobile (RouteCreateMobile.tsx, create-only).

Purpose: Restore a broken core workflow, then simplify a confusing dual-section form.
Output: Working route create + edit, one intuitive waypoint list, server contract untouched.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<hard_constraints>
- DO NOT edit `apps/web/src/app/(owner)/actions/routes.ts`. Its FormData contract
  (origin, destination, scheduledDate, driverId, carrierTruckId, notes, distanceMiles, coDriverIds,
  stops_submitted, stops_<i>_type/address/scheduledAt/notes/lat/lng) is FROZEN. Open it, read it,
  and confirm it stays a ZERO-DIFF file. `git diff --stat apps/web/src/app/\(owner\)/actions/routes.ts`
  must show no changes at the end.
- DO NOT `git push`. DO NOT run `vercel`. The orchestrator handles typecheck/push/deploy after review.
- Before finishing the plan, run `npx tsc --noEmit` from `apps/web`. Zero NEW errors vs the known
  ~35-error baseline; any file you touched must be error-free.
- Commit EACH task atomically as its own commit (three commits total). Task 1 must be independently
  shippable (restores saving on its own).
</hard_constraints>

<context>
@.planning/STATE.md

# Read these before editing — build on the REAL current committed code:
@apps/web/src/app/(owner)/routes/new/page.tsx
@apps/web/src/components/routes/route-form.tsx
@apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx
@apps/web/src/components/routes/FacilityAddressSelect.tsx
@apps/web/src/app/(owner)/actions/drivers.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Re-source route driver pickers from DRIVER-role Users (Part A, P0 fix — commit first)</name>
  <files>
    apps/web/src/app/(owner)/routes/new/page.tsx
    apps/web/src/app/(owner)/routes/new/new-route-client.tsx
    apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx
    apps/web/src/app/(owner)/routes/[id]/page.tsx
    apps/web/src/app/(owner)/routes/[id]/route-page-client.tsx
    apps/web/src/components/routes/route-edit-section.tsx
    apps/web/src/components/routes/route-form.tsx
    apps/web/e2e/routes.spec.ts
  </files>
  <action>
    Root cause: `routes/new/page.tsx` sources drivers via `tenantPrisma.carrierDriver.findMany(...)`
    (the TKT-0074 block, comment mentions "portal access"). Those ids are CarrierDriver ids, not
    User ids, so createRoute's `Route.driverId` FK lookup fails. Restore DRIVER-role User sourcing.

    1) `routes/new/page.tsx`:
       - Import `listDrivers` from `@/app/(owner)/actions/drivers`.
       - Replace the entire `tenantPrisma.carrierDriver.findMany({...}).catch(...)` element in the
         Promise.all with `listDrivers().catch((err) => { logger.error('Failed to load drivers for route form:', err); return []; })`.
       - `listDrivers()` returns full DRIVER-role User records. Map to the shape the forms need:
         `const driverOptions = drivers.map((d) => ({ id: d.id, firstName: d.firstName, lastName: d.lastName }))`.
         `d.id` is the User.id — the correct Route.driverId value.
       - The User model HAS an `isSample` field (confirmed in schema.prisma). listDrivers() does not
         filter it. Filter sample seed users out here: `.filter((d) => !d.isSample)` BEFORE mapping
         (do this against the raw User records, since the mapped shape drops isSample). Confirm the
         field exists with a quick grep of prisma/schema.prisma before relying on it (it does).
       - Pass `driverOptions` to BOTH `<RouteCreateMobile drivers={...}>` and `<NewRouteClient drivers={...}>`.
       - If `tenantPrisma`/`getTenantPrisma` becomes unused after removing the carrierDriver query,
         drop the now-dead import/binding to keep tsc clean. Keep `orgId`/`listCarrierTrucks` as-is.

    2) `routes/new/new-route-client.tsx`: drop `userId` from the local `Driver` interface
       (leave `{ id; firstName; lastName }`). It just forwards props to RouteForm.

    3) `routes/new/RouteCreateMobile.tsx`: its `Driver` interface already has no userId and options
       already use `driver.id` / co-drivers key on `driver.id` — VERIFY only; no change expected.

    4) `route-form.tsx`: the CURRENT committed version already has NO userId gating / no
       "needs portal access" / no disabled option, and its `drivers` prop is already
       `{ id; firstName; lastName }` with options + co-driver checkboxes keyed on `driver.id`.
       VERIFY this. Only edit if you find residual userId gating; otherwise leave untouched.

    5) Edit path `routes/[id]/page.tsx`: remove the `driversForEdit` block that maps
       `userId: d.id` onto each driver. `listDrivers()` already returns User records whose `id` is
       the correct driverId, so pass the drivers straight through (map to
       `{ id, firstName, lastName }` if needed to satisfy the prop type). Do not add userId.

    6) `route-page-client.tsx`: in the `drivers` prop type (around line 80), drop `userId` →
       `Array<{ id: string; firstName: string | null; lastName: string | null; email?: string }>`
       (keep whatever non-userId fields are actually consumed downstream; verify by reading usage).

    7) `route-edit-section.tsx`: `drivers` prop type (line 40) — drop `userId`.

    8) `apps/web/e2e/routes.spec.ts`: the current test asserts carrier-fleet gating (Carlos Rivera
       shown-but-disabled, samples excluded, "TKT-0074"). That behavior is intentionally reverted.
       Rewrite the test to match DRIVER-role User sourcing: assert `#driverId` renders and its
       options are all ENABLED (no disabled options), and that a placeholder option exists. Remove
       the disabled-driver and hard-coded-name ("Michael Jordan"/"Carlos Rivera") assertions since
       those depended on carrier-fleet seed data. Do NOT assert on specific seeded names unless you
       confirm them in the seed. Leave `apps/web/e2e/carrier/trips.spec.ts` untouched.

    Do NOT touch routes.ts. Do NOT change any FormData field names.
  </action>
  <verify>
    - `git diff --stat 'apps/web/src/app/(owner)/actions/routes.ts'` → no output (zero-diff).
    - Read routes/new/page.tsx: driver source is `listDrivers()`, no `carrierDriver.findMany`.
    - grep the six form/edit files for `userId` → only legitimate non-driver uses remain (none on
      the driver prop shapes).
    - `cd apps/web && npx tsc --noEmit` → no new errors; all touched files clean.
  </verify>
  <done>
    New Route (desktop + mobile) and Edit Route driver + co-driver pickers list DRIVER-role Users;
    submitting a route with a selected driver no longer errors. routes.ts unchanged. Committed as a
    standalone commit that independently restores route saving.
  </done>
</task>

<task type="auto">
  <name>Task 2: Desktop unified waypoint list + edit round-trip (Part B — route-form.tsx)</name>
  <files>apps/web/src/components/routes/route-form.tsx</files>
  <action>
    Re-read the CURRENT committed route-form.tsx first (it changed under quick-476/facility work).
    Replace the separate "Origin"/"Destination" fields AND the separate "Stops" section with ONE
    ordered "Route stops" waypoint list. RouteForm serves BOTH create (/routes/new desktop) and edit
    (via RouteEditSection), so this task also owns the edit round-trip.

    Data model — a single `waypoints` state (replace the `stops` state and origin/dest handling):
      interface Waypoint { clientId: string; type: 'PICKUP' | 'DELIVERY'; address: string; scheduledAt: string; notes: string }
      - Minimum 2 rows. First row is origin (implicit type PICKUP), last row is destination
        (implicit type DELIVERY). Middle rows carry a user-selectable Pickup/Delivery type.
      - Init (create): two empty rows [origin, destination].
      - Init (edit): reconstruct from props → first = { address: initialData.origin, type PICKUP },
        middle = initialStops sorted by position (map type/address/scheduledAt/notes),
        last = { address: initialData.destination, type DELIVERY }.

    Coords: keep a `Map<clientId, Coords>` for all rows. Derive originCoords = first row coords,
    destCoords = last row coords; keep the existing OSRM effect driving `distance` off those two.

    FormData emission (contract UNCHANGED — reuse FacilityAddressSelect's own `name` submission):
      - FIRST row: render its FacilityAddressSelect with name="origin" (required), onCoordsChange →
        set first-row coords.
      - LAST row: FacilityAddressSelect name="destination" (required), onCoordsChange → last-row coords.
      - MIDDLE rows: 0-indexed contiguous. For the k-th middle row (k = 0,1,...): FacilityAddressSelect
        name={`stops_${k}_address`}, plus hidden inputs stops_${k}_type / _scheduledAt / _notes /
        _lat / _lng (lat/lng from that row's coords). Keep the hidden `stops_submitted=true` sentinel.
      - Keep hidden `distanceMiles` (round(distance) with initialData.distanceMiles fallback) and
        hidden `coDriverIds` exactly as today. FIRST/LAST rows must NOT be emitted as stops_*.
      - IMPORTANT: the middle index must be computed from CURRENT order (recompute on every render),
        so reordering/adding/removing keeps stops_* contiguous and 0-indexed.

    Row UI (reuse FacilityAddressSelect + existing inputClass/labelClass; keep 44px touch targets):
      - Header label per row: first = "Origin (Pickup)", last = "Destination (Delivery)", middle =
        a Pickup/Delivery <select> bound to that row's type.
      - Reorder up/down (moveUp disabled on first, moveDown disabled on last — do not let a row move
        past the fixed origin/destination ends; simplest: allow reordering only among the full list
        but the derivation always treats index 0 as origin and last as destination — clamp so first
        and last are stable, i.e. disable moveUp on row 0 and moveDown on the last row).
      - Remove button disabled whenever waypoints.length <= 2 (never drop below 2 rows).
      - "Add stop" INSERTS a new middle row just BEFORE the last row (so destination stays last):
        `setWaypoints((prev) => [...prev.slice(0, -1), newRow, prev[prev.length - 1]])`.
      - Scheduled time + notes per row as today (optional). Address via FacilityAddressSelect with
        onAddressChange keeping row.address in sync (needed for edit-consistency + validation).

    Validation: first and last rows must be filled before submit. FacilityAddressSelect on
    origin/destination already carries `required`, so native validation blocks empty submit — keep
    that. Keep the distance badge(s) as-is (driven off first/last coords).

    Apply UI/UX Pro Max guidance for the DriveCommand nextjs stack (professional logistics SaaS,
    dark-mode-safe) when restructuring the section — clean single-list layout, numbered rows,
    consistent spacing.

    Do NOT change RouteForm's props signature in a way that breaks callers other than removing the
    now-unused `stops`-only assumptions; initialData/initialStops/initialCoDriverIds stay. Do NOT
    touch routes.ts. Do NOT rename any FormData field.
  </action>
  <verify>
    - Read the file: one waypoint list; no separate Origin/Destination inputs; no separate Stops
      section; first row name="origin", last row name="destination", middle rows name=`stops_${k}_address`.
    - grep for the FormData field names to confirm they are all still present and unchanged:
      origin, destination, distanceMiles, coDriverIds, stops_submitted, stops_${..}_type/scheduledAt/notes/lat/lng.
    - `git diff --stat 'apps/web/src/app/(owner)/actions/routes.ts'` → no output.
    - `cd apps/web && npx tsc --noEmit` → no new errors; route-form.tsx clean.
  </verify>
  <done>
    Desktop create + edit render one ordered waypoint list (origin first, destination last, min 2
    rows); submit derives origin/destination/distanceMiles/stops_* per the unchanged contract; edit
    round-trips existing routes. Committed atomically.
  </done>
</task>

<task type="auto">
  <name>Task 3: Mobile-web unified waypoint list (Part B — RouteCreateMobile.tsx, create)</name>
  <files>apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx</files>
  <action>
    Re-read the CURRENT committed RouteCreateMobile.tsx first. Apply the SAME unified waypoint-list
    restructure as Task 2, but for the mobile-web create path (this component is create-only — it
    submits `createRoute` with no initialData, so NO edit round-trip needed here).

    - Replace the separate Origin/Destination fields + separate Stops section with ONE ordered
      "Route stops" waypoint list. Initialize with two empty rows [origin, destination].
    - Same derivation on submit (contract UNCHANGED): first row FacilityAddressSelect name="origin",
      last row name="destination", each MIDDLE row (0-indexed contiguous) name=`stops_${k}_address`
      plus hidden stops_${k}_type/_scheduledAt/_notes/_lat/_lng; keep hidden stops_submitted=true,
      distanceMiles (from first+last coords via getOSRMDistanceMiles), coDriverIds.
    - First = origin (Pickup), last = destination (Delivery), middle = user-typed type <select>.
      Min 2 rows; remove disabled when length <= 2; "Add" inserts a middle row before the last row;
      reorder up/down clamped so origin stays first and destination stays last.
    - Style with the mobile design-system tokens already in the file (dsFieldClass, dsLabelClass,
      dsErrorClass, MobileScreen/NavHeader/SectionHeader/PrimaryButton). Reuse the existing
      FacilityAddressSelect. Keep 44–48px touch targets and the existing haptic/nav patterns.
      Apply UI/UX Pro Max guidance (mobile logistics, dark-mode-safe).
    - Keep the NavHeader "Create" requestSubmit flow and PrimaryButton as-is.

    Do NOT touch routes.ts. Do NOT rename any FormData field.
  </action>
  <verify>
    - Read the file: one waypoint list; first row name="origin", last name="destination", middle
      rows name=`stops_${k}_address`; all stops_* / origin / destination / distanceMiles /
      coDriverIds / stops_submitted field names intact.
    - `git diff --stat 'apps/web/src/app/(owner)/actions/routes.ts'` → no output.
    - `cd apps/web && npx tsc --noEmit` → no new errors; RouteCreateMobile.tsx clean.
  </verify>
  <done>
    Mobile-web New Route renders one ordered waypoint list and submits the unchanged FormData
    contract. Committed atomically.
  </done>
</task>

</tasks>

<verification>
- routes.ts is a ZERO-DIFF file: `git diff --stat 'apps/web/src/app/(owner)/actions/routes.ts'` empty.
- `cd apps/web && npx tsc --noEmit` → no new errors vs the ~35-error baseline; every touched file clean.
- Three atomic commits (one per task); Task 1 independently restores route saving.
- No `git push`, no `vercel` run — orchestrator handles deploy after review.
</verification>

<success_criteria>
- Driver/co-driver pickers list DRIVER-role Users on desktop + mobile, create + edit; routes save.
- Desktop + mobile create show one ordered waypoint list; desktop edit round-trips.
- Submit derives origin/destination/distanceMiles/stops_* under the unchanged server contract.
- routes.ts unchanged; tsc has no new errors.
</success_criteria>

<output>
After completion, create `.planning/quick/477-fix-new-route-driver-dropdown-regression/477-SUMMARY.md`
summarizing the three commits, files changed, and confirmation that routes.ts stayed zero-diff and
tsc introduced no new errors.
</output>
