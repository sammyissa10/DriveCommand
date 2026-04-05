---
phase: quick-170
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx
  - apps/web/src/components/carrier/dispatches/DispatchHeader.tsx
  - apps/web/src/components/carrier/dispatches/StopTimeline.tsx
  - apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx
  - apps/web/src/components/carrier/dispatches/DispatchLoadsPanel.tsx
  - apps/web/src/components/carrier/dispatches/DispatchExpensesPanel.tsx
  - apps/web/src/components/carrier/dispatches/DispatchPayRecordsPanel.tsx
autonomous: true

must_haves:
  truths:
    - "Dispatcher can view full dispatch detail at /carrier/dispatches/[id]"
    - "Stops render in sequence_order ASC with status badges, timestamps, and doc compliance indicators"
    - "Dispatcher can advance dispatch status (Start Trip / Complete Dispatch)"
    - "Dispatcher can complete or skip individual stops with proper guard rails"
    - "Dispatcher can attach loads, add expenses, and approve pay records"
  artifacts:
    - path: "apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx"
      provides: "Server page that fetches dispatch via getDispatch() and renders all panels"
    - path: "apps/web/src/components/carrier/dispatches/DispatchHeader.tsx"
      provides: "Dispatch number, status badge, driver/truck chips, status action buttons, odometer inputs"
    - path: "apps/web/src/components/carrier/dispatches/StopTimeline.tsx"
      provides: "Vertical ordered list wrapper rendering StopTimelineCard in sequence_order ASC"
    - path: "apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx"
      provides: "Individual stop card with timestamps, doc compliance, complete/skip actions"
    - path: "apps/web/src/components/carrier/dispatches/DispatchLoadsPanel.tsx"
      provides: "Attached loads list with attach-load searchable dropdown"
    - path: "apps/web/src/components/carrier/dispatches/DispatchExpensesPanel.tsx"
      provides: "Expense list and inline add-expense form"
    - path: "apps/web/src/components/carrier/dispatches/DispatchPayRecordsPanel.tsx"
      provides: "Pay records table with approve/approve-all buttons (completed dispatches only)"
  key_links:
    - from: "page.tsx"
      to: "getDispatch()"
      via: "server-side call in lib/carrier/dispatches.ts"
      pattern: "getDispatch\\(session\\.tenantId"
    - from: "StopTimelineCard.tsx"
      to: "/api/v1/carrier/stops/[id]/complete"
      via: "fetch PATCH on Complete Stop click"
      pattern: "fetch.*stops.*complete"
    - from: "DispatchHeader.tsx"
      to: "/api/v1/carrier/dispatches/[id]/status"
      via: "fetch PATCH for status transitions"
      pattern: "fetch.*dispatches.*status"
---

<objective>
Build the Dispatch detail page — the dispatcher's control center for a live trip. This is a read-heavy page with action buttons that call existing API routes.

Purpose: Central view for managing an active dispatch — stop timeline, doc compliance, expenses, pay records.
Output: 7 new files forming the complete dispatch detail page.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/carrier/dispatches.ts (getDispatch includes stops, carrierLoads, expenses, driverPayRecords)
@apps/web/src/lib/carrier/stop-completion.ts (completeStop/skipStop logic, BOL/POD checks via routeTemplateStop)
@apps/web/src/components/carrier/dispatches/DispatchCard.tsx (STATUS_BADGE/STATUS_LABEL maps, extractDispatchNumber helper — reuse)
@apps/web/src/app/api/v1/carrier/dispatches/[id]/status/route.ts (status transitions: planned->in_progress, in_progress->completed, planned->cancelled/tonu)
@apps/web/src/app/api/v1/carrier/stops/[id]/complete/route.ts (PATCH complete)
@apps/web/src/app/api/v1/carrier/stops/[id]/skip/route.ts (PATCH skip, requires skip_reason)
@apps/web/src/app/api/v1/carrier/expenses/route.ts (POST create expense with dispatchId)
@apps/web/src/app/api/v1/carrier/pay-records/[id]/approve/route.ts (PATCH approve)
@apps/web/src/app/(owner)/carrier/facilities/[id]/page.tsx (pattern: server page with getSession, notFound, back link)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Server page + DispatchHeader + StopTimeline + StopTimelineCard</name>
  <files>
    apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx
    apps/web/src/components/carrier/dispatches/DispatchHeader.tsx
    apps/web/src/components/carrier/dispatches/StopTimeline.tsx
    apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx
  </files>
  <action>
**page.tsx** — Server component following the facility detail page pattern:
- `getSession()`, redirect if no session, `await params` to get `id`
- Call `getDispatch(session.tenantId, id)` — this already includes `stops` (ordered by sequenceOrder ASC), `carrierLoads` (with client name), `expenses`, `driverPayRecords`
- Also fetch drivers list and trucks list (same as dispatches list page) for the loads panel attach dropdown
- Also need to query `routeTemplateStop` records if `dispatch.routeTemplateId` exists, to get `bolRequired`/`podRequired` per stop sequence — and count `CarrierDocument` per stop (type='bol' and type='pod') to determine upload status
- Also query `CarrierDriver` for primaryDriverId and coDriverId to get names, and `CarrierTruck` for truckId to get unitNumber
- Pass `session.role` down to components for owner/manager-only skip button visibility
- `notFound()` if dispatch is null
- Back link to `/carrier/dispatches`
- Render: `<DispatchHeader>`, `<StopTimeline>`, then a grid with `<DispatchLoadsPanel>`, `<DispatchExpensesPanel>`, and conditionally `<DispatchPayRecordsPanel>` (only when status=completed)
- Use `'use client'` only on the child components, NOT the page

**DispatchHeader.tsx** — Client component ('use client'):
- Props: dispatch object (id, status, notes, primaryDriverId, coDriverId, truckId, plannedMiles, actualMiles), driverName, coDriverName, truckUnit, dispatchId
- Extract dispatch_number from notes using the same `extractDispatchNumber` regex from DispatchCard.tsx (copy the helper, do NOT import from DispatchCard)
- Layout: dispatch_number as h2, status badge (reuse STATUS_BADGE/STATUS_LABEL color maps from DispatchCard pattern)
- Driver chip (User icon + name), co-driver chip if coDriverId exists, truck chip (Truck icon + unitNumber)
- Edit button (`<Link>` to edit page or disabled button) — disabled when status is `in_progress` or `completed`. Use `cursor-not-allowed opacity-50` when disabled.
- Odometer start/end: two number inputs for `actualMiles` (start) and a second field. On blur, PATCH `/api/v1/carrier/dispatches/${id}` with `{ plannedMiles }` or `{ actualMiles }`. Use `useState` + debounce pattern.
  - NOTE: The schema only has `plannedMiles` and `actualMiles` on CarrierDispatch. Use plannedMiles as "Odometer Start" and actualMiles as "Odometer End". PATCH the dispatch on blur.
- Status advancement button:
  - When status=planned: "Start Trip" button (blue). On click: PATCH `/api/v1/carrier/dispatches/${id}/status` with `{ status: 'in_progress' }`. Use `router.refresh()` on success.
  - When status=in_progress: "Complete Dispatch" button (green). Disabled unless ALL stops are completed or skipped (pass `allStopsDone` as prop). On click: PATCH status to `completed`. `router.refresh()` on success.
  - When status=completed/cancelled/tonu: no action button, just the badge.
- Dropdown menu (using shadcn DropdownMenu) with "Cancel Dispatch" and "Mark TONU" options — only visible when status=planned. Cancel: PATCH status to `cancelled`. TONU: PATCH status to `tonu`. Both call `router.refresh()` on success.
- Show loading state on buttons during API calls (disabled + spinner text).

**StopTimeline.tsx** — Client component:
- Props: `stops` array (already sorted by sequenceOrder ASC from getDispatch), `routeTemplateStops` (map of sequenceOrder -> {bolRequired, podRequired}), `stopDocCounts` (map of stopId -> {bolCount, podCount}), `dispatchStatus`, `userRole`
- Render a vertical timeline with a left border line (border-l-2) and StopTimelineCard for each stop
- CRITICAL: Render stops in the order received (sequenceOrder ASC) — do NOT re-sort by stopType

**StopTimelineCard.tsx** — Client component:
- Props: stop object, sequenceNumber, bolRequired, podRequired, bolUploaded (boolean from doc count > 0), podUploaded (boolean), dispatchStatus, userRole
- Sequence badge: circle with number, colored by status (green=completed, blue=arrived, gray=pending, yellow=skipped)
- Stop type badge: "Pickup" / "Delivery" / "Fuel" / etc. with appropriate colors
- Facility name (from stop.facility.name via included relation — but getDispatch doesn't include facility. Need to update the server page query OR pass facility data). SOLUTION: In page.tsx, after getting the dispatch, query facilities for all facilityIds in the stops and pass a facilityMap (id -> {name, addressLine1, city, state}) to StopTimeline.
- Address line under facility name
- Appointment window: format `appointmentStart` — `appointmentEnd` as "Mon, Apr 5, 2:00 PM — 4:00 PM"
- Arrived timestamp: display `arrivedAt` formatted. Editable via a datetime-local input that PATCHes `/api/v1/carrier/stops/${id}` — BUT the current StopUpdateSchema only allows contactName, contactPhone, appointmentStart, appointmentEnd, specialInstructions. So arrived/departed timestamps are NOT editable via the current API. Show them as read-only text with an edit icon that shows a tooltip "Coming soon" for now.
- Departed timestamp: same as arrived — read-only display with edit icon tooltip.
- Dwell time: if both arrivedAt and departedAt exist, compute `Math.floor((departedAt - arrivedAt) / 60000)` and display as "X min"
- Status badge: pending/arrived/completed/skipped with colors matching the status badge pattern
- Document section (only for pickup and delivery stops):
  - Pickup: "BOL" label. If bolRequired && !bolUploaded: red warning icon + "BOL required" text. If bolUploaded: green checkmark. If !bolRequired: gray "Optional".
  - Delivery: "POD" label. Same pattern with podRequired/podUploaded.
  - "Upload" button placeholder (disabled, text "Upload" — DocumentUploadModal in next task per spec)
- "Complete Stop" button: 
  - Only show when stop.status is 'pending' or 'arrived' AND dispatch is 'in_progress'
  - Disabled with tooltip when `(bolRequired && !bolUploaded) || (podRequired && !podUploaded)` — tooltip: "Required documents must be uploaded first"
  - On click: PATCH `/api/v1/carrier/stops/${stop.id}/complete`. `router.refresh()` on success. Show error toast on failure (e.g., "Stop is not in arrived status").
- "Skip Stop" button:
  - Only visible when `userRole === 'owner'` (owner/manager only)
  - Only show when stop.status is 'pending' or 'arrived'
  - On click: open a small modal/dialog (use shadcn AlertDialog) prompting for `skip_reason` (required textarea). On confirm: PATCH `/api/v1/carrier/stops/${stop.id}/skip` with `{ skip_reason }`. `router.refresh()` on success.
- Use `sonner` toast for success/error feedback on all API calls.
  </action>
  <verify>
Navigate to `/carrier/dispatches/[id]` for an existing dispatch. Verify:
1. Page loads without errors (check browser console)
2. Dispatch number, status badge, driver/truck chips render
3. Stops render in sequence_order (not grouped by type)
4. Status buttons appear based on current status
5. `tsc --noEmit` passes for all new files
  </verify>
  <done>
Dispatch detail page renders with header (number, badges, chips, status buttons, odometer fields) and stop timeline (ordered cards with sequence badge, type badge, facility info, appointment window, timestamps, doc compliance indicators, complete/skip buttons with proper guards). All API calls use existing routes.
  </done>
</task>

<task type="auto">
  <name>Task 2: DispatchLoadsPanel + DispatchExpensesPanel + DispatchPayRecordsPanel</name>
  <files>
    apps/web/src/components/carrier/dispatches/DispatchLoadsPanel.tsx
    apps/web/src/components/carrier/dispatches/DispatchExpensesPanel.tsx
    apps/web/src/components/carrier/dispatches/DispatchPayRecordsPanel.tsx
  </files>
  <action>
**DispatchLoadsPanel.tsx** — Client component ('use client'):
- Props: `loads` (from dispatch.carrierLoads — array with id, loadType, referenceNumber, status, totalRevenue, client.name), `dispatchId`, `dispatchStatus`
- Render load cards in a list: each card shows referenceNumber (or "No ref"), client name, status badge (use similar color map as dispatch statuses: pending=slate, in_transit=blue, delivered=green, cancelled=red), totalRevenue formatted as currency
- "Attach Load" button (only when status is planned or in_progress):
  - Opens an inline section with a searchable text input
  - On typing, GET `/api/v1/carrier/loads?status=pending&search=${query}` — BUT check if the loads list API supports search. If not, fetch all pending loads with no dispatchId and filter client-side. Use: GET `/api/v1/carrier/loads?status=pending&page=1&pageSize=50` (the existing loads route likely supports status filter)
  - Actually, check the loads route. If the loads list endpoint doesn't exist yet for unassigned loads, use a simpler approach: just show a text input for load ID and POST. BUT the spec says "searchable dropdown of unassigned pending loads" — implement a dropdown that fetches pending loads on open.
  - To attach: the CarrierLoad model has `dispatchId` FK. So attaching = PATCH `/api/v1/carrier/loads/${loadId}` with `{ dispatchId }`. Check if the loads PATCH endpoint exists. If not, do a direct fetch to a new endpoint. PRAGMATIC APPROACH: since the spec says POST `/api/v1/carrier/dispatches/[id]/loads`, but that route doesn't exist yet, implement the attach as PATCH to `/api/v1/carrier/loads/${loadId}` updating dispatchId. If that endpoint doesn't exist either, create a minimal client-side fetch that the page can handle. For now, just call PATCH on the load with the dispatchId and show a toast. The API route for loads PATCH likely exists — check `/api/v1/carrier/loads/[id]/route.ts`.
  - FALLBACK: If no load PATCH route exists, show the "Attach Load" button as a stub with a "Coming soon" tooltip. The visual UI should still be complete.
- `router.refresh()` on successful attach.

**DispatchExpensesPanel.tsx** — Client component ('use client'):
- Props: `expenses` (from dispatch.expenses — array with id, expenseType, amount, paidBy, driverId, notes, approvedAt), `dispatchId`, `drivers` (array of {id, name} for the driver select)
- Expense list: render each expense as a row/card with: expenseType (capitalize), amount (currency format), paidBy, driver name (look up from drivers array by driverId), status badge (approvedAt ? "Approved" green : "Pending" slate)
- "Add Expense" section: collapsible inline form (toggle with a button):
  - expense_type: select with options: fuel, toll, lumper, scale, parking, repair, meal, lodging, other
  - amount: number input with $ prefix
  - paid_by: select with options: company, driver
  - driver: select from drivers array (optional)
  - notes: text input (optional)
  - Submit button: POST `/api/v1/carrier/expenses` with `{ dispatchId, expenseType, amount, paidBy, driverId, notes }`. Show toast on success/error. `router.refresh()` on success. Reset form.

**DispatchPayRecordsPanel.tsx** — Client component ('use client'):
- Props: `payRecords` (from dispatch.driverPayRecords — array with id, driverId, payModel, basePay, bonuses, reimbursements, deductions, netPay, status, approvedAt), `drivers` (array of {id, name}), `dispatchStatus`
- Only rendered when `dispatchStatus === 'completed'` (the page.tsx handles this conditional)
- Table/card layout per driver pay record:
  - Driver name (lookup from drivers), pay model badge, base pay, bonuses, reimbursements, deductions, net pay (all formatted as currency)
  - Status badge: pending=yellow, approved=green, voided=red
  - "Approve" button per record (only when status=pending): PATCH `/api/v1/carrier/pay-records/${record.id}/approve`. `router.refresh()` on success. Toast feedback.
- "Approve All" button at top: iterates over all pending records and calls approve for each sequentially. Shows loading state. `router.refresh()` after all complete.
- If no pay records exist, show "No pay records generated" message.

**Styling for all three panels:**
- Use shadcn Card component pattern: `rounded-lg border bg-card p-4` or `p-6`
- Section headers with text-lg font-semibold
- Consistent with the existing carrier ops visual style (see DispatchCard.tsx, FacilityForm.tsx patterns)
- All currency: `new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)`
- All Decimal values from Prisma come as strings — parse with `Number()` before formatting
  </action>
  <verify>
1. Navigate to dispatch detail page — all three panels render below the stop timeline
2. Add Expense form submits and new expense appears after refresh
3. Pay Records panel only shows for completed dispatches
4. Approve button works on individual pay records
5. `tsc --noEmit` passes
  </verify>
  <done>
Three bottom panels render on dispatch detail page: loads panel with attach capability, expenses panel with inline add form, pay records panel (completed dispatches only) with approve/approve-all functionality. All panels use existing API routes and show proper loading/error states.
  </done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx tsc --noEmit` — no type errors in new files
2. Navigate to `/carrier/dispatches` — click any dispatch card — detail page loads
3. Stop timeline shows stops in sequence_order ASC
4. Status buttons respect state machine (Start Trip only on planned, Complete only on in_progress with all stops done)
5. Complete Stop disabled when required docs missing
6. Skip Stop only visible for owner role
7. Expenses form creates expenses via API
8. Pay records panel only appears for completed dispatches
</verification>

<success_criteria>
- 7 new files created, 0 existing files modified
- Dispatch detail page is fully navigable from the dispatches list
- All interactive elements call existing API routes (dispatches, stops, expenses, pay-records)
- Stop ordering is strictly sequence_order ASC
- Doc compliance indicators show BOL/POD required vs uploaded status
- Page passes TypeScript compilation
</success_criteria>

<output>
After completion, create `.planning/quick/170-carrier-ops-dispatch-detail-page-with-st/170-SUMMARY.md`
</output>
