---
phase: quick-280
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/carrier/loads/new/page.tsx
  - apps/web/src/components/carrier/loads/LoadForm.tsx
autonomous: true
must_haves:
  truths:
    - "Load create form has a 'Dispatch immediately' toggle that defaults to OFF"
    - "When toggle is ON, dispatch fields (driver, truck, departure, co-driver, planned miles, route template) appear in a collapsible section"
    - "When toggle is ON and form submits, a dispatch is created and the load is attached to it"
    - "When toggle is ON, user is redirected to dispatch detail page with success toast showing DC-XXXX number"
    - "When toggle is OFF, existing create flow is completely unchanged"
    - "Dispatch fields only validate when toggle is ON"
  artifacts:
    - path: "apps/web/src/app/(owner)/carrier/loads/new/page.tsx"
      provides: "Server-side data fetching for drivers, trucks passed to LoadForm"
    - path: "apps/web/src/components/carrier/loads/LoadForm.tsx"
      provides: "Dispatch toggle section with all dispatch fields and dual-path submit logic"
  key_links:
    - from: "LoadForm.tsx"
      to: "/api/v1/carrier/dispatches"
      via: "fetch POST when dispatch toggle is ON"
      pattern: "fetch.*api/v1/carrier/dispatches.*POST"
    - from: "LoadForm.tsx"
      to: "/api/v1/carrier/loads/{id}"
      via: "fetch PATCH to set dispatchId on created load"
      pattern: "fetch.*api/v1/carrier/loads.*PATCH.*dispatchId"
---

<objective>
Add a "Dispatch immediately" collapsible section to the load create form that lets users create a load and dispatch it in one step.

Purpose: Eliminates the two-step workflow of creating a load then separately dispatching it via the DispatchLoadModal. Reuses existing createDispatch API and load-dispatch linking logic.
Output: Updated LoadForm.tsx with dispatch toggle section, updated new load page with driver/truck data fetching.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/components/carrier/loads/LoadForm.tsx
@apps/web/src/components/carrier/loads/DispatchLoadModal.tsx
@apps/web/src/app/(owner)/carrier/loads/new/page.tsx
@apps/web/src/lib/carrier/dispatches.ts
@apps/web/src/lib/carrier/loads.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add driver/truck data fetching to NewLoadPage</name>
  <files>apps/web/src/app/(owner)/carrier/loads/new/page.tsx</files>
  <action>
Update the NewLoadPage server component to fetch active drivers and trucks for the org, then pass them to LoadForm as new props.

Add two Prisma queries alongside the existing `clients` query:

1. **Drivers query:** `prisma.carrierDriver.findMany({ where: { orgId, status: 'active' }, select: { id: true, firstName: true, lastName: true }, orderBy: { firstName: 'asc' } })` — map to `{ id, name: firstName + ' ' + lastName, status: 'active' }` array.

2. **Trucks query:** `prisma.carrierTruck.findMany({ where: { orgId, status: 'active' }, select: { id: true, unitNumber: true, make: true, model: true }, orderBy: { unitNumber: 'asc' } })`.

Run all three queries in parallel with `Promise.all([clients, drivers, trucks])`.

Pass `drivers` and `trucks` as props to `<LoadForm>`. These use the same shape as `DispatchLoadModal`'s `DriverOption` and `TruckOption` interfaces:
- drivers: `{ id: string; name: string; status: string }[]`
- trucks: `{ id: string; unitNumber: string; make: string | null; model: string | null }[]`
  </action>
  <verify>TypeScript compiles: `cd apps/web && npx tsc --noEmit --incremental false 2>&1 | head -20` (expect no errors from this file)</verify>
  <done>NewLoadPage fetches drivers and trucks and passes them to LoadForm alongside clients.</done>
</task>

<task type="auto">
  <name>Task 2: Add dispatch toggle section and dual-path submit to LoadForm</name>
  <files>apps/web/src/components/carrier/loads/LoadForm.tsx</files>
  <action>
This is the main task. Modify LoadForm.tsx to add the "Dispatch immediately" collapsible section and update the submit handler for the create-mode dual path.

**Props changes:**
- Add optional props to `LoadFormProps`: `drivers?: { id: string; name: string; status: string }[]` and `trucks?: { id: string; unitNumber: string; make: string | null; model: string | null }[]`. Optional so edit mode is unaffected.

**New state (only relevant when `mode === 'create'`):**
- `dispatchImmediately` (boolean, default false)
- `primaryDriverId` (string, default '')
- `truckId` (string, default '')
- `coDriverId` (string, default '')
- `scheduledDeparture` (string, default = tomorrow at 08:00, same `getDefaultDeparture()` helper from DispatchLoadModal)
- `dispatchPlannedMiles` (string, default '') — separate from the existing `plannedMiles` field which is for load rate calculation
- `selectedTemplateId` (string, default '')
- `templates` (Template[] — same interface as DispatchLoadModal, fetched from `/api/v1/carrier/route-templates/active` on mount when toggle is ON)
- `coDriverError` (string | null, default null)
- `dispatchError` (string | null, default null)

**Template fetching:** When `dispatchImmediately` toggles to true and templates haven't been fetched yet, fetch from `/api/v1/carrier/route-templates/active`. Cache the result so toggling off/on doesn't re-fetch. Use the same `handleTemplateChange` logic from DispatchLoadModal that auto-populates planned miles and driver/truck from template defaults.

**Co-driver validation:** Same as DispatchLoadModal — co-driver cannot equal primary driver. Filter co-driver dropdown to exclude selected primary.

**UI — new section between Stops and Rate & Financials sections (after Section 3, before Section 4):**

```
<div className={sectionClass}>
  <div className="flex items-center justify-between">
    <h3 className={sectionTitleClass + " mb-0"}>Dispatch</h3>
    <div className="flex items-center gap-2">
      <Switch checked={dispatchImmediately} onCheckedChange={setDispatchImmediately} id="dispatch-toggle" />
      <label htmlFor="dispatch-toggle" className="text-sm font-medium cursor-pointer select-none">
        Dispatch immediately
      </label>
    </div>
  </div>
  {dispatchImmediately && (
    <div className="mt-4 space-y-4">
      ... fields ...
    </div>
  )}
</div>
```

Only render this section when `mode === 'create'` and `drivers` prop is provided.

**Fields inside the collapsible (same layout pattern as DispatchLoadModal):**
1. Route Template (optional) — `<select>` from fetched templates, with template auto-populate behavior
2. Primary Driver (required, red asterisk) — `<select>` from `drivers` prop
3. Truck (required, red asterisk) — `<select>` from `trucks` prop
4. Scheduled Departure (required, red asterisk) — `<input type="datetime-local">`
5. Co-Driver (optional) — `<select>` from drivers filtered to exclude primary, with same co-driver error handling
6. Planned Miles (optional) — `<input type="number">` — this is the dispatch planned miles, separate from the load's per-mile rate field

Use 2-column grid (`grid grid-cols-1 sm:grid-cols-2 gap-4`) for the fields. Place Route Template full-width, then Primary Driver + Truck side by side, then Departure + Co-Driver side by side, then Planned Miles in its own row.

**Validation changes in handleSubmit:**
When `dispatchImmediately` is true, additionally validate:
- `primaryDriverId` is not empty
- `truckId` is not empty
- `scheduledDeparture` is not empty
- `coDriverId !== primaryDriverId` (if co-driver selected)

Set `dispatchError` with a descriptive message if any fail. Show the error below the dispatch section fields.

**Submit handler changes (only in create path, `mode === 'create'`):**

After the existing load creation fetch succeeds and `savedId` is obtained:

If `dispatchImmediately` is true:
1. Build dispatch payload (same shape as DispatchLoadModal):
   ```
   { primaryDriverId, truckId, scheduledDeparture: new Date(scheduledDeparture).toISOString() }
   ```
   Plus optional: coDriverId, plannedMiles (from dispatchPlannedMiles), routeTemplateId (from selectedTemplateId).

2. POST to `/api/v1/carrier/dispatches` — if fails, toast.error the message but still redirect to load detail (load was already created).

3. If dispatch creation succeeds, extract `newDispatchId` and `dispatchNumber` from response (same pattern as DispatchLoadModal).

4. PATCH `/api/v1/carrier/loads/${savedId}` with `{ dispatchId: newDispatchId }` to attach load to dispatch. This triggers the existing pendingStopsJson migration in updateLoad.

5. Upload rate confirmation file if present (existing logic, runs before dispatch redirect).

6. Show toast: `toast.success(\`Load created and dispatched as ${dispatchNumber}\`)`.

7. Redirect to `/carrier/dispatches/${newDispatchId}` instead of `/carrier/loads`.

If `dispatchImmediately` is false:
- Existing behavior unchanged (toast "Load created", redirect to `/carrier/loads`).

**Button text:** When `dispatchImmediately` is true, change submit button text from "Create Load" to "Create & Dispatch".

**Important:** Do NOT touch any edit-mode logic. The dispatch section only renders when `mode === 'create'`. The edit submit path is completely untouched.
  </action>
  <verify>
1. `cd apps/web && npx tsc --noEmit --incremental false 2>&1 | head -30` — no TypeScript errors
2. Visual check: Load the new load page in the browser. Toggle should appear below Stops section. When OFF, no dispatch fields visible. When ON, all 6 fields appear. Submit button text changes with toggle.
  </verify>
  <done>
- Toggle defaults to OFF, existing create flow is unchanged
- Toggle ON shows driver (required), truck (required), departure (required, defaults tomorrow 8 AM), co-driver (optional, excludes primary), planned miles (optional), route template (optional with auto-populate)
- Dispatch fields only validate when toggle is ON
- On submit with toggle ON: creates load, creates dispatch, attaches load, redirects to dispatch detail page with "Load created and dispatched as DC-XXXX" toast
- On submit with toggle OFF: normal load creation + redirect to load list
- Edit mode completely unaffected
  </done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx tsc --noEmit` passes with zero errors
2. Create a load with dispatch toggle OFF — normal behavior, redirects to load list
3. Create a load with dispatch toggle ON — fills driver, truck, departure — creates both load and dispatch, redirects to dispatch detail page, toast shows DC-XXXX number
4. Verify dispatched load has correct dispatchId set
5. Verify stops from load appear as CarrierStop records on the dispatch (pendingStopsJson migration)
6. Edit load form is completely unaffected (no dispatch section visible)
</verification>

<success_criteria>
- Load create form has a "Dispatch immediately" toggle that defaults to OFF
- Toggle ON reveals dispatch fields in a collapsible section
- Submit with toggle ON creates load + dispatch + attaches them in sequence
- Redirect goes to dispatch detail page with success toast including dispatch number
- Toggle OFF preserves exact existing behavior
- No TypeScript errors
- No new npm packages
</success_criteria>

<output>
After completion, create `.planning/quick/280-add-dispatch-option-to-load-create-form/280-SUMMARY.md`
</output>
