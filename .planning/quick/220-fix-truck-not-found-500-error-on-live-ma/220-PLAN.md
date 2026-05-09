---
phase: quick-220
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/live-map/actions.ts
  - apps/web/src/components/vehicle/vehicle-details-sheet.tsx
autonomous: true
must_haves:
  truths:
    - "Clicking a vehicle marker on the live fleet map loads the detail panel with real truck diagnostics"
    - "Invalid or missing truck IDs return a 404 JSON response, never a 500"
    - "The diagnostics endpoint enforces tenant isolation"
    - "No accessibility warnings from SheetContent in the browser console"
  artifacts:
    - path: "apps/web/src/app/(owner)/live-map/actions.ts"
      provides: "getVehicleDiagnostics server action with proper error handling and tenant isolation"
    - path: "apps/web/src/components/vehicle/vehicle-details-sheet.tsx"
      provides: "Vehicle details panel with accessible Sheet markup"
  key_links:
    - from: "apps/web/src/components/maps/live-map.tsx"
      to: "apps/web/src/components/vehicle/vehicle-details-sheet.tsx"
      via: "selectedVehicleId state passed as truckId prop"
      pattern: "truckId=.selectedVehicleId"
    - from: "apps/web/src/components/vehicle/vehicle-details-sheet.tsx"
      to: "apps/web/src/app/(owner)/live-map/actions.ts"
      via: "getVehicleDiagnostics server action call"
      pattern: "getVehicleDiagnostics\\(truckId\\)"
---

<objective>
Fix the "Truck not found" 500 error when clicking vehicle markers on the Live Fleet Map.

Purpose: The diagnostics server action throws an unhandled error when the truck lookup
fails, causing a 500 instead of a clean 404. Additionally, the `findUnique` query
relies solely on Prisma RLS middleware for tenant scoping — adding an explicit
`tenantId` WHERE clause ensures the lookup is bulletproof regardless of RLS state.
The Sheet component also needs accessible title/description for all render states.

Output: Working vehicle detail panel on marker click, proper 404 for missing trucks,
no console accessibility warnings.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/(owner)/live-map/actions.ts
@apps/web/src/components/vehicle/vehicle-details-sheet.tsx
@apps/web/src/components/maps/live-map.tsx
@apps/web/src/lib/maps/map-utils.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix getVehicleDiagnostics error handling and tenant isolation</name>
  <files>apps/web/src/app/(owner)/live-map/actions.ts</files>
  <action>
In `getVehicleDiagnostics` (line ~187):

1. Add `requireTenantId()` call at the top of the function (after `requireRole`) to get the tenantId.

2. Change the `db.truck.findUnique` query (line ~193-201) to include explicit tenant scoping:
   ```
   db.truck.findUnique({
     where: { id: truckId, tenantId },
     select: { ... }
   })
   ```
   This ensures tenant isolation even if the RLS middleware has gaps.

3. Also add `tenantId` to ALL the other parallel queries in the Promise.all:
   - `db.gPSLocation.findFirst` — add `where: { truckId, truck: { tenantId } }` (the GPSLocation
     table may not have a direct tenantId; scope through the truck relation instead, OR leave as-is
     if GPSLocation already has a tenantId field — check the Prisma schema first)
   - `db.fuelRecord.findFirst` — same pattern, add tenant scoping
   - `db.load.findFirst` — add `tenantId` to where clause (Load model has tenantId)

4. Replace the `throw new Error('Truck not found')` (line ~249) with a return value the
   client can handle. Since this is a server action (not an API route), it cannot return
   `Response.json()`. Instead, return `null` when the truck is not found:
   ```
   if (!truck) {
     return null;
   }
   ```
   The client (VehicleDetailsSheet) already handles `null` diagnostics by showing
   "No data available", so this is the correct approach.

5. Validate the `truckId` parameter at the top of the function — if it is empty string
   or not a valid UUID pattern, return `null` early before making any DB queries:
   ```
   const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
   if (!truckId || !UUID_RE.test(truckId)) {
     return null;
   }
   ```
  </action>
  <verify>
Run `npx tsc --noEmit` from `apps/web` — no type errors in actions.ts or vehicle-details-sheet.tsx.
  </verify>
  <done>
getVehicleDiagnostics returns null for missing/invalid trucks instead of throwing,
all queries include explicit tenant scoping, and invalid UUIDs are rejected early.
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix VehicleDetailsSheet accessibility and error resilience</name>
  <files>apps/web/src/components/vehicle/vehicle-details-sheet.tsx</files>
  <action>
1. The Sheet component renders three states: loading, diagnostics loaded, and no-data.
   In the loading and no-data states (lines ~141-143 and ~329-331), the SheetContent
   has no SheetHeader/SheetTitle, which triggers Radix accessibility warnings.

   Fix: Add a SheetHeader with SheetTitle and SheetDescription in ALL three render
   branches inside SheetContent. For the loading and no-data states, use
   VisuallyHidden from Radix (`import { VisuallyHidden } from '@radix-ui/react-visually-hidden'`)
   to wrap the title so it is accessible but not visible:
   ```tsx
   <SheetHeader>
     <VisuallyHidden>
       <SheetTitle>Vehicle Details</SheetTitle>
     </VisuallyHidden>
     <SheetDescription className="sr-only">
       Vehicle diagnostics panel
     </SheetDescription>
   </SheetHeader>
   ```

   If `@radix-ui/react-visually-hidden` is not installed, use the `sr-only` Tailwind
   class instead:
   ```tsx
   <SheetHeader className="sr-only">
     <SheetTitle>Vehicle Details</SheetTitle>
   </SheetHeader>
   ```

2. In the `catch` block of `fetchDiagnostics` (line ~87), the error is logged but the
   user sees "No data available" with no way to retry. Add a simple error state:
   - Add `const [error, setError] = useState(false);`
   - Set `setError(true)` in catch, `setError(false)` at start of fetch
   - In the render, when `!diagnostics && !loading && error`, show a message like
     "Failed to load vehicle data" instead of just "No data available"

3. Ensure the SheetContent has `aria-describedby` — Radix Sheet should handle this
   automatically if SheetDescription is present in all states.
  </action>
  <verify>
Run `npx tsc --noEmit` from `apps/web` — no type errors. Open the live map page in
the browser, click a vehicle marker — no accessibility warnings in the console about
missing DialogTitle or aria-describedby.
  </verify>
  <done>
SheetContent has accessible title/description in all render states. Error state is
surfaced to the user. No Radix accessibility warnings in the console.
  </done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx tsc --noEmit` — zero type errors
2. Open the Live Fleet Map, click a vehicle marker — detail panel loads with real data
3. No 500 errors in Vercel logs or browser console on marker click
4. No "Truck not found" errors in logs
5. Pass a garbage truckId to getVehicleDiagnostics — returns null, no throw
6. No accessibility warnings about DialogTitle or aria-describedby in browser console
</verification>

<success_criteria>
- Clicking any vehicle marker on the live fleet map successfully loads the detail panel with diagnostics data
- getVehicleDiagnostics returns null (not throws) for invalid or non-tenant trucks
- All diagnostics queries include explicit tenant scoping
- SheetContent has proper accessible title in loading, loaded, and error states
- Zero TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/220-fix-truck-not-found-500-error-on-live-ma/220-SUMMARY.md`
</output>
