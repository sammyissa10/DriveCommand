---
phase: quick-402
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/investigations/trip-load-redesign-findings.md
autonomous: true
must_haves:
  truths:
    - "Two parallel data universes (PascalCase vs snake_case) are fully documented"
    - "Current dispatch/trip model relationships are traced and documented"
    - "Route template recurrence mechanism is documented"
    - "Existing UI components are catalogued with reusability assessment"
    - "Driver stop-completion flow is documented"
  artifacts:
    - path: ".planning/investigations/trip-load-redesign-findings.md"
      provides: "Complete investigation findings document"
      min_lines: 200
  key_links: []
---

<objective>
READ-ONLY investigation to map the two parallel data universes (PascalCase vs snake_case tables), document current dispatch/trip model relationships, trace route templates, identify reusable UI components, and document driver stop-completion flow.

Purpose: Provide a foundation for future trip/load redesign decisions by understanding what exists today.
Output: `.planning/investigations/trip-load-redesign-findings.md`
</objective>

<execution_context>
@/Users/ayazmohammed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ayazmohammed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/prisma/schema.prisma
@apps/web/src/lib/carrier/dispatches.ts
@apps/web/src/lib/carrier/loads.ts
@apps/web/src/lib/carrier/route-templates.ts
@apps/web/src/lib/carrier/stop-completion.ts
@apps/web/src/app/(owner)/loads/page.tsx
@apps/web/src/app/(owner)/carrier/loads/page.tsx
@apps/web/src/app/(owner)/carrier/dispatches/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Map the Two Parallel Data Universes</name>
  <files>.planning/investigations/trip-load-redesign-findings.md</files>
  <action>
Create the findings document and document the two parallel data universes:

**PascalCase Universe (Original DriveCommand):**
- Tables: Load, Route, RouteStop, Customer, Truck, User, Invoice, etc.
- Trace which pages/routes use these: `/loads/*`, `/routes/*`, `/invoices/*`, `/crm/*`
- Check `apps/web/src/app/(owner)/actions/loads.ts`, `routes.ts` for usage
- Check `apps/web/src/app/(driver)/actions/` for driver-side usage
- Note: These use `prisma.load`, `prisma.route`, `prisma.routeStop`

**snake_case Universe (Carrier Operations):**
- Tables mapped via `@@map()`: CarrierClient -> "clients", CarrierDispatch -> "dispatches", CarrierLoad -> "loads", CarrierStop -> "stops", RouteTemplate -> "route_templates", etc.
- Trace which pages/routes use these: `/carrier/*` routes
- Check `apps/web/src/lib/carrier/*.ts` for service layer
- Check `apps/web/src/app/api/v1/carrier/*` for API routes
- Note: These use `prisma.carrierLoad`, `prisma.carrierDispatch`, `prisma.carrierStop`

**Document for each universe:**
1. Complete table list with Prisma model names
2. Which routes/pages read from it
3. Which routes/pages write to it
4. Assessment: Live vs Dead code

**Key observation to capture:** The two "Load" tables (Load vs CarrierLoad) have different schemas and serve different purposes. Load has Customer FK, CarrierLoad has CarrierClient FK. They are NOT connected.
  </action>
  <verify>
The findings document exists at `.planning/investigations/trip-load-redesign-findings.md` with:
- Section "## 1. Two Parallel Data Universes"
- PascalCase tables list with usage
- snake_case tables list with usage
- Dead code assessment
  </verify>
  <done>Both data universes are fully documented with table lists, page mappings, and live/dead assessment.</done>
</task>

<task type="auto">
  <name>Task 2: Document Dispatch/Trip Model and Route Templates</name>
  <files>.planning/investigations/trip-load-redesign-findings.md</files>
  <action>
Append to the findings document sections on the Carrier Operations dispatch/trip model:

**Section 2: Current Dispatch/Trip Model**

Document relationships from schema.prisma + dispatches.ts + loads.ts:
- CarrierDispatch: Has primaryDriverId (CarrierDriver), truckId (CarrierTruck), routeTemplateId (optional), scheduledDeparture, status (planned/in_progress/completed/cancelled/tonu)
- CarrierLoad: Has clientId (CarrierClient), dispatchId (optional FK), contractId (optional), status (pending/in_transit/delivered/invoiced/cancelled), pendingStopsJson (stores stops JSON when no dispatch yet)
- CarrierStop: Has dispatchId (required), loadId (optional), facilityId, sequenceOrder, status (pending/arrived/completed/skipped)

**Key relationships to document:**
1. Can a load exist before truck assigned? YES - CarrierLoad.dispatchId is nullable
2. Can one dispatch carry multiple loads? YES - CarrierDispatch has `carrierLoads` relation (one-to-many)
3. Where does stop sequence live? CarrierStop.sequenceOrder + unique constraint on (dispatchId, sequenceOrder)
4. Where does revenue/rate live? CarrierLoad.rateAmount, totalRevenue; calculated by revenue-calculator.ts

**Section 3: Route Templates**

Document from route-templates.ts:
- RouteTemplate: Has templateName, clientId, contractId, scheduleType, recurrenceRule (iCal RRULE), recurrenceTimezone, scheduledDepartureTime, defaultDriverId, defaultTruckId
- RouteTemplateStop: Has routeTemplateId, sequenceOrder, stopType, facilityId, apptWindowStartOffsetMin, apptWindowEndOffsetMin
- Recurrence mechanism: `computeNextOccurrence()` parses RRULE (DAILY/WEEKLY/MONTHLY)
- Generation: `createDispatch()` with routeTemplateId inherits stops from template
- Auto-generation: When dispatch completes, `transitionDispatchStatus()` auto-creates next recurring dispatch

**Does a load ever attach to a template?** NO - RouteTemplate has no load FK. Loads attach to dispatches AFTER generation.
  </action>
  <verify>
The findings document has:
- Section "## 2. Current Dispatch/Trip Model" with relationship diagram/table
- Section "## 3. Route Templates" with recurrence mechanism documented
  </verify>
  <done>Dispatch/trip model relationships and route template mechanism are fully documented.</done>
</task>

<task type="auto">
  <name>Task 3: Catalogue UI Components and Driver Stop Flow</name>
  <files>.planning/investigations/trip-load-redesign-findings.md</files>
  <action>
Append final sections to the findings document:

**Section 4: Existing UI Building Blocks**

Catalogue components from the codebase with reusability assessment:

**Stop Builder / Stop Management:**
- Check `apps/web/src/app/(owner)/carrier/dispatches/[id]/stops/page.tsx`
- Check `apps/web/src/app/(owner)/carrier/loads/new/page.tsx` for stop input
- Look for StopInput interface in loads.ts
- Assessment: Reusable as-is / Reusable with changes / Better scrapped

**Dispatch Pages:**
- `apps/web/src/app/(owner)/carrier/dispatches/page.tsx` - list
- `apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx` - detail
- `apps/web/src/app/(owner)/carrier/dispatches/_grid/` - DataGrid components

**Load Pages (Carrier):**
- `apps/web/src/app/(owner)/carrier/loads/page.tsx` - list
- `apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx` - detail
- `apps/web/src/app/(owner)/carrier/loads/new/page.tsx` - create
- `apps/web/src/app/(owner)/carrier/loads/_grid/` - DataGrid components

**Load Pages (Original - PascalCase):**
- `apps/web/src/app/(owner)/loads/page.tsx` - list (uses prisma.load)
- `apps/web/src/components/loads/` - load-form.tsx, load-list.tsx, etc.
- Assessment: These target the OLD Load model, not CarrierLoad

**Driver-Side Views:**
- `apps/web/src/app/(driver)/my-load/page.tsx`
- `apps/web/src/app/(driver)/my-route/page.tsx`
- Mobile: `apps/mobile/app/(driver)/loads/` screens

**Section 5: Driver Stop-Completion Flow**

Document from stop-completion.ts:

**Current Flow (3-stage cascade):**
1. `arriveStop()`: pending -> arrived, sets arrivedAt
2. `completeStop()`: arrived -> completed
   - Enforces BOL/POD document requirements (from RouteTemplateStop config)
   - Sets departedAt, computes dwellMinutes
   - If pickup stop: marks CarrierLoad as in_transit
   - If last delivery stop: marks CarrierLoad as delivered, triggers revenue recalc
   - If all dispatch stops done: marks CarrierDispatch as completed, triggers pay record generation
3. `skipStop()`: any -> skipped, requires skipReason, logs who skipped

**Document Upload Flow:**
- Documents attached via CarrierDocument table (stopId FK)
- documentType: 'bol', 'pod', etc.
- Upload endpoints: `/api/v1/carrier/documents`
- Mobile upload: `/api/mobile/carrier/driver/stops/[stopId]/documents`

**Checklist Integration:**
- Workflow Engine (PlaybookInstance, StepInstance) can attach to dispatches
- TriggerEvent.ON_DISPATCH_CREATE fires pre-trip playbooks
- TriggerEvent.ON_DISPATCH_DELIVER fires post-trip playbooks
- BUT: No per-stop checklist integration yet (stops are NOT entities in workflow engine)
  </action>
  <verify>
The findings document has:
- Section "## 4. Existing UI Building Blocks" with component list and reusability assessment
- Section "## 5. Driver Stop-Completion Flow" with current state documented
- Document is at least 200 lines
  </verify>
  <done>UI components are catalogued with reusability assessments, and driver stop-completion flow is fully documented.</done>
</task>

</tasks>

<verification>
After completing all tasks:
1. Verify `.planning/investigations/trip-load-redesign-findings.md` exists
2. Verify it contains all 5 sections
3. Verify it's at least 200 lines
4. Run `wc -l .planning/investigations/trip-load-redesign-findings.md` to confirm
</verification>

<success_criteria>
- Findings document exists at `.planning/investigations/trip-load-redesign-findings.md`
- Document contains 5 sections covering all investigation scope items
- Two parallel data universes are clearly distinguished with live/dead code assessment
- Dispatch/Load/Stop relationships are documented with FK analysis
- Route template recurrence mechanism is explained
- UI components are catalogued with reusability recommendations
- Driver stop-completion flow is documented including checklist/document-upload state
</success_criteria>

<output>
After completion, create `.planning/quick/402-read-only-investigation-map-trip-load-da/402-SUMMARY.md`
</output>
