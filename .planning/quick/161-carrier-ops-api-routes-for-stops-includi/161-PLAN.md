---
phase: quick-161
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/carrier/stops.ts
  - apps/web/src/lib/carrier/stop-completion.ts
  - apps/web/src/app/api/v1/carrier/stops/route.ts
  - apps/web/src/app/api/v1/carrier/stops/[id]/route.ts
  - apps/web/src/app/api/v1/carrier/stops/[id]/arrived/route.ts
  - apps/web/src/app/api/v1/carrier/stops/[id]/complete/route.ts
  - apps/web/src/app/api/v1/carrier/stops/[id]/skip/route.ts
autonomous: true
must_haves:
  truths:
    - "Stops can be listed filtered by dispatch_id or load_id, always ordered by sequenceOrder ASC"
    - "A stop can be created on a dispatch with facility address snapshot in notes"
    - "A stop can be retrieved with its documents and expenses"
    - "A stop can be patched for contact/appointment/instruction fields only"
    - "Arrived endpoint sets arrivedAt and status, rejects non-pending stops with 422"
    - "Complete endpoint enforces BOL/POD requirements from RouteTemplateStop, computes dwell, cascades load delivered + dispatch completed"
    - "Skip endpoint is restricted to owner/sysadmin roles, requires skip_reason"
  artifacts:
    - path: "apps/web/src/lib/carrier/stops.ts"
      provides: "CRUD functions for CarrierStop"
      exports: ["listStops", "getStop", "createStop", "updateStop"]
    - path: "apps/web/src/lib/carrier/stop-completion.ts"
      provides: "Stop Completion Microflow — BOL/POD check, dwell calc, load/dispatch cascade"
      exports: ["completeStop", "arriveStop", "skipStop"]
    - path: "apps/web/src/app/api/v1/carrier/stops/route.ts"
      provides: "GET list + POST create"
    - path: "apps/web/src/app/api/v1/carrier/stops/[id]/route.ts"
      provides: "GET one + PATCH fields"
    - path: "apps/web/src/app/api/v1/carrier/stops/[id]/arrived/route.ts"
      provides: "PATCH arrived"
    - path: "apps/web/src/app/api/v1/carrier/stops/[id]/complete/route.ts"
      provides: "PATCH complete"
    - path: "apps/web/src/app/api/v1/carrier/stops/[id]/skip/route.ts"
      provides: "PATCH skip"
  key_links:
    - from: "apps/web/src/lib/carrier/stop-completion.ts"
      to: "revenue-calculator.ts"
      via: "recalculateAndStore(orgId, loadId) on last delivery completed"
      pattern: "recalculateAndStore"
    - from: "apps/web/src/lib/carrier/stop-completion.ts"
      to: "prisma.carrierLoad / prisma.carrierDispatch"
      via: "status cascade on completion"
      pattern: "load\\.status.*delivered|dispatch\\.status.*completed"
    - from: "apps/web/src/app/api/v1/carrier/stops/[id]/complete/route.ts"
      to: "stop-completion.ts"
      via: "completeStop function call"
      pattern: "completeStop"
---

<objective>
Create the Carrier Ops stops API: CRUD endpoints plus the Stop Completion Microflow (arrived, complete, skip). The complete endpoint is the most operationally critical — it enforces BOL/POD document requirements, computes dwell time, and cascades status to loads and dispatches.

Purpose: Stops are the atomic unit of dispatch execution. Drivers arrive, complete, or skip stops. The completion microflow drives the entire delivery lifecycle.
Output: 7 files — 2 lib modules + 5 API route files.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/carrier/clients.ts (pattern reference for lib module structure)
@apps/web/src/app/api/v1/carrier/dispatches/route.ts (pattern reference for API route structure)
@apps/web/src/app/api/v1/carrier/dispatches/[id]/route.ts (pattern reference for [id] route with params Promise)
@apps/web/src/lib/carrier/dispatches.ts (pattern reference — imports, types, Prisma queries)
@apps/web/src/lib/carrier/revenue-calculator.ts (recalculateAndStore import for load completion cascade)
@apps/web/src/lib/carrier/dispatch-generator.ts (address_snapshot pattern in notes JSON, lines 326-337)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create stops.ts lib module + stop-completion.ts microflow</name>
  <files>
    apps/web/src/lib/carrier/stops.ts
    apps/web/src/lib/carrier/stop-completion.ts
  </files>
  <action>
**stops.ts** — Follow the exact pattern from clients.ts (prisma import, logger, decStr helper, Types section, Functions section):

1. `listStops(orgId, filters)` — Filters: `dispatchId?: string`, `loadId?: string`, `page`, `pageSize`. Where clause: `{ dispatch: { orgId } }` + optional dispatchId/loadId. OrderBy: `{ sequenceOrder: 'asc' }` ALWAYS. Return `{ items, total }`.

2. `getStop(orgId, id)` — findFirst with `where: { id, dispatch: { orgId } }`, include `{ documents: true, expenses: true, facility: true, dispatch: { select: { orgId: true, routeTemplateId: true } } }`. Return null if not found.

3. `createStop(orgId, data: StopCreateInput)` — StopCreateInput has: dispatchId, loadId?, sequenceOrder, stopType, facilityId, clientId?, appointmentStart?, appointmentEnd?, contactName?, contactPhone?, specialInstructions?, commodityDescription?, pieces?, weightLbs?, bolNumber?, podNumber?, sealNumber?. Before create: verify dispatch exists with `{ id: data.dispatchId, orgId }`. Then fetch facility by facilityId to build address_snapshot. Create stop with notes = `JSON.stringify({ address_snapshot: { address_line1: facility.addressLine1, city: facility.city, state: facility.state, zip: facility.zip, lat: facility.latitude, lng: facility.longitude } })`. Return created stop.

4. `updateStop(orgId, id, data: StopUpdateInput)` — StopUpdateInput allows ONLY: contactName, contactPhone, appointmentStart, appointmentEnd, specialInstructions. findFirst to verify ownership via dispatch.orgId, then update. Return null if not found.

**stop-completion.ts** — The critical microflow module. Import prisma, logger, `recalculateAndStore` from `./revenue-calculator`.

1. `arriveStop(orgId, stopId)` — Load stop with dispatch included. Verify dispatch.orgId === orgId. Check stop.status === 'pending', else return `{ error: 'Stop is not in pending status', status: 422 }`. Update: `arrivedAt = new Date()`, `status = 'arrived'`. Return updated stop.

2. `completeStop(orgId, stopId)` — Load stop with dispatch included (need dispatch.routeTemplateId and dispatch.orgId). Verify ownership. Check stop.status === 'arrived', else return 422.

   Step 1 — BOL check: Query RouteTemplateStop where `routeTemplateId = stop.dispatch.routeTemplateId AND sequenceOrder = stop.sequenceOrder`. If not found, default bolRequired = false. If bolRequired === true: check `stop.bolNumber != null` AND `await prisma.carrierDocument.count({ where: { stopId: stop.id, documentType: 'bol' } }) > 0`. If either fails, return `{ error: 'BOL document required before completing this stop.', status: 422 }`.

   Step 2 — POD check: Same pattern with podRequired and documentType 'pod'. Return `{ error: 'POD document required before completing this stop.', status: 422 }`.

   Step 3 — Set departedAt = new Date().

   Step 4 — Compute dwellMinutes = `Math.floor((departedAt.getTime() - stop.arrivedAt!.getTime()) / 60000)`. Parse existing notes JSON (try/catch, default {}), merge `{ ...existingNotes, dwell_minutes: dwellMinutes }`, stringify back. Update stop: `departedAt`, `status = 'completed'`, `notes = mergedNotesString`.

   Step 5 — Load cascade: If stop.loadId is set, count stops where `loadId = stop.loadId AND stopType = 'delivery' AND status NOT IN ('completed', 'skipped')`. If count === 0: update load status to 'delivered'. Then call `recalculateAndStore(orgId, stop.loadId)`.

   Step 6 — Dispatch cascade: Count stops where `dispatchId = stop.dispatchId AND status NOT IN ('completed', 'skipped')`. If count === 0: update dispatch `status = 'completed'` and `actualArrival = new Date()`. Add comment: `// TODO: call generateDriverPayRecords from pay-calculator.ts when built`.

   Return `{ data: updatedStop }`.

3. `skipStop(orgId, stopId, userId, skipReason)` — Load stop with dispatch. Verify ownership. Parse existing notes JSON, merge with `"[SKIPPED by ${userId} at ${new Date().toISOString()}]"` — store as: `{ ...existingNotes, skip_log: "[SKIPPED by ...]" }`. Update stop: `status = 'skipped'`, `skipReason`, `notes = mergedNotes`. Return updated stop. Note: role check happens in the API route, NOT here.

All functions return `{ data: ... }` on success or `{ error: string, status: number }` on failure. Use a union return type like `Promise<{ data: CarrierStop } | { error: string; status: number }>` (define a StopResult type).
  </action>
  <verify>Run `npx tsc --noEmit` from apps/web to confirm no type errors in the two new files.</verify>
  <done>stops.ts exports listStops, getStop, createStop, updateStop. stop-completion.ts exports arriveStop, completeStop, skipStop. All Prisma queries use dispatch.orgId for tenant scoping. completeStop implements the full 6-step microflow with BOL/POD 422 enforcement, dwell calculation, and load/dispatch cascade.</done>
</task>

<task type="auto">
  <name>Task 2: Create all 5 API route files for stops</name>
  <files>
    apps/web/src/app/api/v1/carrier/stops/route.ts
    apps/web/src/app/api/v1/carrier/stops/[id]/route.ts
    apps/web/src/app/api/v1/carrier/stops/[id]/arrived/route.ts
    apps/web/src/app/api/v1/carrier/stops/[id]/complete/route.ts
    apps/web/src/app/api/v1/carrier/stops/[id]/skip/route.ts
  </files>
  <action>
Follow the exact pattern from dispatches/route.ts and dispatches/[id]/route.ts (getSession, orgId from session.tenantId, try/catch with logger.error, NextResponse.json with { data: ... } wrapper).

**stops/route.ts** — GET + POST:
- GET: Extract query params dispatch_id, load_id, page, pageSize. Call listStops(orgId, filters). Return `{ data: { items, total, page, pageSize } }`.
- POST: Zod schema StopCreateSchema for body validation (dispatchId: uuid required, loadId: uuid optional, sequenceOrder: number, stopType: string, facilityId: uuid required, clientId: uuid optional, appointmentStart/End: datetime optional, contactName/contactPhone/specialInstructions: string optional, commodityDescription: string optional, pieces: number optional, weightLbs: number optional, bolNumber/podNumber/sealNumber: string optional). Call createStop(orgId, parsed.data). Return 201.

**stops/[id]/route.ts** — GET + PATCH:
- GET: `const { id } = await params;` (params is Promise<{ id: string }> — same pattern as dispatches/[id]). Call getStop(orgId, id). 404 if null.
- PATCH: Zod schema allowing ONLY contactName, contactPhone, appointmentStart, appointmentEnd, specialInstructions (all optional strings/datetimes). Call updateStop. 404 if null.

**stops/[id]/arrived/route.ts** — PATCH only:
- Call arriveStop(orgId, id). If result has 'error' key, return NextResponse.json({ error }, { status }). Else return { data }.

**stops/[id]/complete/route.ts** — PATCH only:
- Call completeStop(orgId, id). Same error/data pattern as arrived.

**stops/[id]/skip/route.ts** — PATCH only:
- BEFORE calling skipStop, check session.role: if role === 'driver', return 403 `{ error: 'Drivers cannot skip stops' }`. Parse body with Zod: `{ skip_reason: z.string().min(1, 'skip_reason is required') }`. Return 400 on validation failure. Call skipStop(orgId, id, session.userId, parsed.data.skip_reason). Handle error/data return.

All [id] routes use the Next.js 15 pattern: `{ params }: { params: Promise<{ id: string }> }` with `const { id } = await params;`.
  </action>
  <verify>Run `npx tsc --noEmit` from apps/web. Confirm all 7 new files compile. Verify the directory structure: `ls -R apps/web/src/app/api/v1/carrier/stops/`.</verify>
  <done>5 API routes created. GET /stops returns list ordered by sequenceOrder ASC. POST /stops creates with address_snapshot. GET /stops/[id] includes documents and expenses. PATCH /stops/[id] updates only allowed fields. PATCH arrived validates pending status. PATCH complete runs full 6-step microflow with hard 422 on missing BOL/POD. PATCH skip enforces owner/sysadmin role gate and requires skip_reason.</done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx tsc --noEmit` — zero type errors
2. Confirm all 7 files exist at correct paths
3. Verify stop-completion.ts imports recalculateAndStore from revenue-calculator.ts
4. Verify skip route checks session.role !== 'driver' (not checking for non-existent 'manager' role)
5. Verify completeStop queries RouteTemplateStop for bolRequired/podRequired (not checking CarrierStop columns that don't exist)
6. Verify dwellMinutes uses Math.floor and is stored in notes JSON (not a column)
</verification>

<success_criteria>
- 7 new files created, zero type errors
- Stop list always returns sequenceOrder ASC
- Stop create includes address_snapshot in notes JSON
- Stop PATCH only allows 5 fields (contactName, contactPhone, appointmentStart, appointmentEnd, specialInstructions)
- Arrived rejects non-pending with 422
- Complete enforces BOL/POD from RouteTemplateStop lookup with hard 422
- Complete computes integer dwellMinutes, stores in notes JSON
- Complete cascades: last delivery stop -> load delivered + revenue recalc; all stops done -> dispatch completed
- Skip restricted to owner/sysadmin roles, 403 for driver, 400 for missing reason
</success_criteria>

<output>
After completion, create `.planning/quick/161-carrier-ops-api-routes-for-stops-includi/161-SUMMARY.md`
</output>
