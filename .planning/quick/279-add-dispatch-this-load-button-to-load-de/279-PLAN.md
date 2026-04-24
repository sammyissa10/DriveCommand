---
phase: quick-279
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx
  - apps/web/src/components/carrier/loads/DispatchLoadModal.tsx
autonomous: true
must_haves:
  truths:
    - "Pending load detail page shows a 'Dispatch This Load' button when load has no dispatchId"
    - "Clicking the button opens a modal to create a dispatch and attach the load"
    - "After successful dispatch creation, load shows 'Dispatched on DC-XXXX' badge linking to dispatch"
    - "Button is hidden when load already has a dispatch attached"
  artifacts:
    - path: "apps/web/src/components/carrier/loads/DispatchLoadModal.tsx"
      provides: "Modal with driver/truck/departure/co-driver/miles/notes/template fields"
    - path: "apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx"
      provides: "Dispatch button + dispatch badge on load detail"
  key_links:
    - from: "DispatchLoadModal.tsx"
      to: "/api/v1/carrier/dispatches"
      via: "POST fetch to create dispatch"
      pattern: "fetch.*api/v1/carrier/dispatches"
    - from: "DispatchLoadModal.tsx"
      to: "/api/v1/carrier/loads/[id]"
      via: "PATCH fetch to attach load to dispatch"
      pattern: "fetch.*api/v1/carrier/loads"
---

<objective>
Add a "Dispatch This Load" button to the carrier load detail page that opens a modal to create a new dispatch and automatically attach the load to it.

Purpose: Lets owners quickly dispatch a pending load without navigating to the separate dispatch creation page.
Output: DispatchLoadModal component + updated load detail page with dispatch button/badge.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx
@apps/web/src/components/carrier/loads/LoadForm.tsx
@apps/web/src/components/carrier/dispatches/NewDispatchForm.tsx
@apps/web/src/lib/carrier/dispatches.ts
@apps/web/src/lib/carrier/loads.ts
@apps/web/src/app/api/v1/carrier/dispatches/route.ts
@apps/web/src/app/api/v1/carrier/loads/[id]/route.ts
@apps/web/src/app/(owner)/carrier/dispatches/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create DispatchLoadModal component</name>
  <files>apps/web/src/components/carrier/loads/DispatchLoadModal.tsx</files>
  <action>
Create a new client component `DispatchLoadModal` that renders a modal dialog for dispatching a load.

**Props interface:**
```ts
interface DispatchLoadModalProps {
  loadId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (dispatchId: string, dispatchNumber: string) => void;
}
```

**Modal fields (mirror the existing NewDispatchForm pattern in `apps/web/src/components/carrier/dispatches/NewDispatchForm.tsx`):**
1. Primary Driver (required) — `<select>` of active drivers fetched from server-side props (passed as driverMap). Shows driver name.
2. Truck (required) — `<select>` of active trucks. Shows unit number + make + model.
3. Scheduled Departure (required) — `<input type="datetime-local">`. Default to tomorrow at 08:00 local time. Use helper similar to `getDefaultDeparture()` in NewDispatchForm but set to tomorrow 8 AM.
4. Co-Driver (optional) — Same driver dropdown, filtered to exclude selected primary driver.
5. Planned Miles (optional) — `<input type="number">`.
6. Notes (optional) — `<textarea>`.
7. Route Template (optional) — `<select>` fetched from `/api/v1/carrier/route-templates/active`. On select, auto-fill planned miles from template (same logic as NewDispatchForm handleTemplateChange).

**Driver and truck data:** Fetch on mount via two API calls:
- Drivers: query `/api/v1/carrier/drivers` — but this endpoint does not exist. Instead, create a small fetch to a new inline approach. Actually, follow the pattern from the dispatch page: the load detail server page will query drivers and trucks via Prisma and pass them as props. The modal receives `driverOptions` and `truckOptions` arrays.

Revised approach — the load detail server page (`page.tsx`) will query active drivers and trucks and pass them to the modal. Define:
```ts
interface DriverOption { id: string; name: string; status: string }
interface TruckOption { id: string; unitNumber: string; make: string | null; model: string | null }
```
Props become:
```ts
interface DispatchLoadModalProps {
  loadId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (dispatchId: string, dispatchNumber: string) => void;
  drivers: DriverOption[];
  trucks: TruckOption[];
}
```

**On submit:**
1. POST to `/api/v1/carrier/dispatches` with `{ primaryDriverId, truckId, coDriverId?, scheduledDeparture, plannedMiles?, notes?, routeTemplateId? }`.
2. Extract `newDispatchId` from response `data.data.id`.
3. Extract dispatch number: POST response includes the created dispatch. To get the dispatch number, make a GET to `/api/v1/carrier/dispatches/${newDispatchId}` and parse the `[DISPATCH_NUMBER=DC-YYYY-NNNNN]` tag from `notes`. OR simpler: parse from the notes field if it's returned in the create response. Check: the POST `/api/v1/carrier/dispatches` route returns `{ data: dispatch }` which includes `notes`. Parse the dispatch number from `notes` using regex `/\[DISPATCH_NUMBER=(DC-\d{4}-\d{5})\]/`.
4. PATCH to `/api/v1/carrier/loads/${loadId}` with `{ dispatchId: newDispatchId, status: 'pending' }` — keep status as 'pending' since 'assigned' is not a valid load status enum value. The key change is setting `dispatchId` which triggers the existing stop migration logic in `updateLoad()`.
5. On success: call `onSuccess(newDispatchId, dispatchNumber)`, show toast "Dispatch {dispatchNumber} created and load attached".
6. On error: show error toast, keep modal open.

**Styling:** Use shadcn Dialog component (`@/components/ui/dialog`). Match the existing form styling from NewDispatchForm (INPUT_CLASSES, SELECT_CLASSES, LABEL_CLASSES constants). Show a loading spinner on submit button while submitting.

**Validation:** Primary driver, truck, and scheduled departure are required. Co-driver cannot equal primary driver (show inline error if same selected).
  </action>
  <verify>File exists, TypeScript compiles (`cd apps/web && npx tsc --noEmit` passes or only pre-existing errors).</verify>
  <done>DispatchLoadModal component created with all 7 fields, submit logic that creates dispatch + attaches load, proper error handling and loading states.</done>
</task>

<task type="auto">
  <name>Task 2: Add dispatch button and badge to load detail page</name>
  <files>apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx</files>
  <action>
Modify the load detail server page to:

**1. Fetch driver and truck data for the modal:**
Add to the existing `Promise.all` in the page:
```ts
prisma.carrierDriver.findMany({
  where: { orgId, status: 'active' },
  select: { id: true, firstName: true, lastName: true, status: true },
  orderBy: { lastName: 'asc' },
}),
prisma.carrierTruck.findMany({
  where: { orgId, status: 'active' },
  select: { id: true, unitNumber: true, make: true, model: true },
  orderBy: { unitNumber: 'asc' },
}),
```
Map drivers to `{ id, name: firstName + ' ' + lastName, status }` and trucks to `{ id, unitNumber, make, model }`.

**2. Extract dispatch number if load has a dispatch:**
If `load.dispatch` exists (it's included via the existing `getLoad` which does `include: { dispatch: true }`), parse the dispatch number from `load.dispatch.notes` using regex `/\[DISPATCH_NUMBER=(DC-\d{4}-\d{5})\]/`.

**3. Create a new client wrapper component inline or as a separate small component in the same file (or extract to a new file `LoadDetailHeader.tsx` — your choice, but keeping it in page.tsx as a client island is cleanest).**

Actually, since the page is a server component but needs interactive state (modal open/close), create a client component `LoadDetailActions` either at the bottom of the page file or in a separate file `apps/web/src/components/carrier/loads/LoadDetailActions.tsx`. This component:

- Receives props: `{ loadId, loadStatus, dispatchId, dispatchNumber, drivers, trucks }`
- If `loadStatus === 'pending' && !dispatchId`: render a blue primary button "Dispatch This Load" (use `Truck` icon from lucide-react). On click, open the DispatchLoadModal.
- If `dispatchId`: render a badge/link "Dispatched on {dispatchNumber}" linking to `/carrier/dispatches/{dispatchId}`. Use a blue badge style with `Link` from next/navigation. If dispatchNumber couldn't be parsed, show "View Dispatch" as fallback text.
- For other statuses (in_transit, delivered, cancelled, invoiced) without a dispatch: show nothing.

**4. Update the page JSX:**
Replace the current header section to include `<LoadDetailActions>` between the h1/p header and the LoadForm. Place it in the header area, either as a row with the title or directly below.

Layout: Keep the existing h1 + p description. Add a flex row that contains the title on the left and the dispatch button/badge on the right:
```tsx
<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
  <div className="min-w-0">
    <h1 ...>Load {load.referenceNumber}</h1>
    <p ...>Edit load details...</p>
  </div>
  <LoadDetailActions
    loadId={id}
    loadStatus={load.status}
    dispatchId={load.dispatchId}
    dispatchNumber={parsedDispatchNumber}
    drivers={driverOptions}
    trucks={truckOptions}
  />
</div>
```

**5. On dispatch success:** The `onSuccess` callback in the modal should trigger a `router.refresh()` to reload the server component data, which will now show the dispatch badge instead of the button.

**Important:** The `load` object from `getLoad()` includes `status` field (from Prisma model). Also includes `dispatch` relation. Use `load.status` and `load.dispatchId` to determine button/badge visibility.

Create `LoadDetailActions` as a separate file at `apps/web/src/components/carrier/loads/LoadDetailActions.tsx` for cleanliness.
  </action>
  <files>apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx, apps/web/src/components/carrier/loads/LoadDetailActions.tsx</files>
  <verify>
1. Navigate to a pending load without a dispatch — "Dispatch This Load" button appears.
2. Click button — modal opens with all 7 fields.
3. Fill required fields and submit — toast shows dispatch number, page refreshes, badge appears.
4. Navigate to a load with existing dispatch — badge/link shows instead of button.
5. `cd apps/web && npx tsc --noEmit` passes (or only pre-existing errors).
  </verify>
  <done>
- Pending loads without dispatch show "Dispatch This Load" button
- Clicking opens DispatchLoadModal with driver/truck/departure/co-driver/miles/notes/template fields
- Submit creates dispatch via POST /api/v1/carrier/dispatches, attaches load via PATCH /api/v1/carrier/loads/[id]
- Success shows toast with dispatch number, page refreshes to show "Dispatched on DC-XXXX" badge
- Badge links to /carrier/dispatches/[dispatchId]
- Loads already dispatched show badge, not button
- Stop migration from pendingStopsJson happens automatically via existing updateLoad flow
  </done>
</task>

</tasks>

<verification>
1. Open a load in 'pending' status with no dispatchId — "Dispatch This Load" button visible
2. Open a load with an existing dispatch — dispatch badge/link visible, no dispatch button
3. Click "Dispatch This Load" on a pending load — modal opens
4. Fill primary driver + truck + departure, submit — dispatch created, load linked, toast shown
5. After dispatch: page shows "Dispatched on DC-XXXX" badge linking to dispatch detail
6. TypeScript compiles: `cd apps/web && npx tsc --noEmit`
</verification>

<success_criteria>
- DispatchLoadModal component exists with all 7 form fields
- Load detail page conditionally shows dispatch button (pending, no dispatch) or dispatch badge (has dispatch)
- Creating a dispatch from the modal correctly creates dispatch + attaches load via existing APIs
- No new npm packages added
- Existing dispatch creation page and load list page untouched
</success_criteria>

<output>
After completion, create `.planning/quick/279-add-dispatch-this-load-button-to-load-de/279-SUMMARY.md`
</output>
