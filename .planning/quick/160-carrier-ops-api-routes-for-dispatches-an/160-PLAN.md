---
phase: quick-160
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/carrier/dispatches.ts
  - apps/web/src/lib/carrier/loads.ts
  - apps/web/src/lib/carrier/revenue-calculator.ts
  - apps/web/src/app/api/v1/carrier/dispatches/route.ts
  - apps/web/src/app/api/v1/carrier/dispatches/[id]/route.ts
  - apps/web/src/app/api/v1/carrier/dispatches/[id]/status/route.ts
  - apps/web/src/app/api/v1/carrier/loads/route.ts
  - apps/web/src/app/api/v1/carrier/loads/[id]/route.ts
  - apps/web/src/app/api/v1/carrier/loads/[id]/revenue/route.ts
autonomous: true
must_haves:
  truths:
    - "Dispatches can be listed with default today+tomorrow filter and optional filters"
    - "Dispatches can be created with auto-generated DC-YYYY-NNNNN number stored in notes"
    - "Dispatch status transitions follow strict state machine (planned->in_progress->completed, planned->cancelled, planned->tonu)"
    - "Loads can be listed and created with clientId required (400 if missing)"
    - "Load creation auto-populates rate fields from contract when contractId provided"
    - "Revenue calculator correctly handles all 6 rate types plus FSC"
    - "Revenue recalculation triggered on rate field changes and via /revenue endpoint"
  artifacts:
    - path: "apps/web/src/lib/carrier/dispatches.ts"
      provides: "Dispatch CRUD + status transition logic"
    - path: "apps/web/src/lib/carrier/loads.ts"
      provides: "Load CRUD with contract auto-populate"
    - path: "apps/web/src/lib/carrier/revenue-calculator.ts"
      provides: "Revenue calculation for all rate types + FSC"
    - path: "apps/web/src/app/api/v1/carrier/dispatches/route.ts"
      provides: "GET list + POST create for dispatches"
    - path: "apps/web/src/app/api/v1/carrier/dispatches/[id]/route.ts"
      provides: "GET one + PATCH fields for dispatches"
    - path: "apps/web/src/app/api/v1/carrier/dispatches/[id]/status/route.ts"
      provides: "PATCH status transition endpoint"
    - path: "apps/web/src/app/api/v1/carrier/loads/route.ts"
      provides: "GET list + POST create for loads"
    - path: "apps/web/src/app/api/v1/carrier/loads/[id]/route.ts"
      provides: "GET one + PATCH fields for loads"
    - path: "apps/web/src/app/api/v1/carrier/loads/[id]/revenue/route.ts"
      provides: "PATCH revenue recalculation trigger"
  key_links:
    - from: "apps/web/src/app/api/v1/carrier/dispatches/route.ts"
      to: "apps/web/src/lib/carrier/dispatches.ts"
      via: "import { listDispatches, createDispatch }"
    - from: "apps/web/src/app/api/v1/carrier/loads/[id]/route.ts"
      to: "apps/web/src/lib/carrier/revenue-calculator.ts"
      via: "recalculate on rate field PATCH"
---

<objective>
Create dispatch and load CRUD API routes plus revenue calculator for the Carrier Ops module.

Purpose: Enable dispatches (trip assignments) and loads (freight) management with status workflows and automatic revenue calculation.
Output: 9 files — 3 lib modules + 6 API route files.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/carrier/clients.ts (pattern reference for lib modules)
@apps/web/src/app/api/v1/carrier/clients/route.ts (pattern reference for API routes)
@apps/web/src/app/api/v1/carrier/clients/[id]/route.ts (pattern reference for [id] routes)
@apps/web/src/lib/carrier/dispatch-generator.ts (dispatch number generation pattern)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Revenue calculator + dispatch and load lib modules</name>
  <files>
    apps/web/src/lib/carrier/revenue-calculator.ts
    apps/web/src/lib/carrier/dispatches.ts
    apps/web/src/lib/carrier/loads.ts
  </files>
  <action>
Follow the exact patterns from `@apps/web/src/lib/carrier/clients.ts` — same imports (`prisma`, `logger`), same `decStr` helper, same interface/function structure.

**revenue-calculator.ts:**

Create `calculateRevenue(load, dispatch?, contract?)` that accepts load data (rateType, rateAmount, commodityWeightLbs, commodityPallets, otherCharges), optional dispatch (actualMiles, plannedMiles), optional contract (fuelSurchargeMethod, fuelSurchargeRate).

Rate type calculation for baseRevenue:
- `per_mile`: rateAmount * (dispatch.actualMiles ?? dispatch.plannedMiles ?? 0)
- `flat`: rateAmount
- `per_stop`: rateAmount * count of delivery stops (pass deliveryStopCount as param)
- `per_cwt`: rateAmount * (commodityWeightLbs / 100)
- `per_pallet`: rateAmount * commodityPallets
- `hourly`: rateAmount * 8 (hardcoded default hours)

FSC calculation (only when contract provided):
- `percent_of_linehaul`: baseRevenue * fuelSurchargeRate
- `per_mile`: miles * fuelSurchargeRate (same miles logic as per_mile rate)
- `none` or no contract: 0

detentionAmount: pass 0 (no detention_minutes column exists).

totalRevenue = baseRevenue + fuelSurcharge + detentionAmount + (otherCharges ?? 0).

If brokerFlag is true, compute grossMargin = totalRevenue - (carrierCost ?? 0) and log it but do not store.

Export `calculateRevenue` and a helper `recalculateAndStore(orgId, loadId)` that fetches the load + dispatch + contract from DB, calls calculateRevenue, and updates the load's totalRevenue and fuelSurcharge fields.

All numeric fields from Prisma are Decimal — use `Number()` to convert before math, and use `decStr()` for serialization.

**dispatches.ts:**

Interfaces: `ListDispatchesFilters` (status?, dateFrom?, dateTo?, driverId?, needsAssignment?: boolean, page?, pageSize?), `DispatchCreateInput` (primaryDriverId, truckId required; optional: coDriverId, trailerId, dispatcherId, routeTemplateId, scheduledDeparture, scheduledArrival, plannedMiles, hosCycle, notes), `DispatchUpdateInput = Partial<Omit<DispatchCreateInput, 'primaryDriverId' | 'truckId'>> & { primaryDriverId?: string; truckId?: string; trailerId?: string; notes?: string; plannedMiles?: number }`.

Functions:
- `listDispatches(orgId, filters)` — Default date range: today 00:00 to tomorrow 23:59 (by scheduledDeparture) when no dateFrom/dateTo provided. Filter by status, driverId. For needsAssignment, filter notes containing `needs_assignment=true`. Include `_count` of stops and a raw count of stops with status='completed' or status='skipped' for progress. Return `{ items, total }`.
- `getDispatch(orgId, id)` — findFirst with includes: stops (orderBy sequenceOrder ASC), carrierLoads (include client: { select: { name: true } }), expenses, driverPayRecords.
- `createDispatch(orgId, data)` — Auto-generate dispatch number: count existing dispatches for this orgId, increment, format as `DC-YYYY-NNNNN`, store in notes as `[DISPATCH_NUMBER=DC-YYYY-NNNNN]` (append to any user-provided notes). Required fields: primaryDriverId, truckId. scheduledDeparture defaults to NOW if not provided.
- `updateDispatch(orgId, id, data)` — findFirst to check exists + check status. If status = 'completed', return `{ error: 'Cannot update completed dispatch' }`. If status = 'in_progress', strip primaryDriverId and truckId from data (driver/truck locked). Then update.
- `transitionDispatchStatus(orgId, id, newStatus, notes?)` — Implements strict state machine:
  - `planned -> in_progress`: update actualDeparture = new Date().
  - `in_progress -> completed`: first verify all stops are 'completed' or 'skipped' (query stops, check). If not, return `{ error: 'All stops must be completed or skipped' }`. Set actualArrival = new Date(). Stub: `// TODO: call pay calculator`.
  - `planned -> cancelled`: find all attached loads with status 'pending', update them to 'cancelled'.
  - `planned -> tonu`: prepend "[TONU]" to notes, set status to 'tonu'. Append any user-provided notes.
  - All other transitions: return `{ error: 'Invalid status transition', details: { from, to } }` (caller returns 422).

**loads.ts:**

Interfaces: `ListLoadsFilters` (clientId?, dispatchId?, status?, dateFrom?, dateTo?, page?, pageSize?), `LoadCreateInput` (clientId required; optional: dispatchId, contractId, loadType, referenceNumber, bolNumber, proNumber, poNumber, commodityDescription, commodityWeightLbs, commodityPieces, commodityPallets, hazmat, hazmatClass, rateType, rateAmount, brokerFlag, carrierCost, specialInstructions, notes), `LoadUpdateInput = Partial<LoadCreateInput>`.

Functions:
- `listLoads(orgId, filters)` — Filter by clientId, dispatchId, status. Date filter on createdAt. Include client (select name), dispatch (select id, notes — for dispatch number extraction). Return `{ items, total }`.
- `getLoad(orgId, id)` — findFirst with includes: client, dispatch, contract, stops (orderBy sequenceOrder ASC), expenses, and CarrierDocument relation if it exists (use `documents` relation name — check Prisma; if not available, skip). Compute financials summary: { totalRevenue: decStr, fuelSurcharge: decStr, otherCharges: decStr, carrierCost: decStr }.
- `createLoad(orgId, data)` — If no clientId, throw error with message "client_id is required — every load must be attributed to a client." (caller catches and returns 400 with exact message). If contractId provided, fetch contract, auto-populate rateType and rateAmount from contract.baseRate. If referenceNumber is null/undefined, auto-generate: count existing loads for orgId, format as `LD-YYYY-NNNNN`. After creation, call `recalculateAndStore(orgId, newLoad.id)` to compute initial revenue.
- `updateLoad(orgId, id, data)` — findFirst to check exists. Update. If any of rateType, rateAmount, commodityWeightLbs, commodityPallets, otherCharges, brokerFlag, carrierCost changed, call `recalculateAndStore(orgId, id)` after update.
  </action>
  <verify>Run `npx tsc --noEmit -p apps/web/tsconfig.json` — all three files compile without errors.</verify>
  <done>Three lib modules exist with full CRUD + revenue calculation logic. Revenue calculator handles all 6 rate types + FSC. Dispatch status machine enforces valid transitions. Load creation requires clientId and auto-populates from contracts.</done>
</task>

<task type="auto">
  <name>Task 2: Dispatch API routes (list, create, get, update, status)</name>
  <files>
    apps/web/src/app/api/v1/carrier/dispatches/route.ts
    apps/web/src/app/api/v1/carrier/dispatches/[id]/route.ts
    apps/web/src/app/api/v1/carrier/dispatches/[id]/status/route.ts
  </files>
  <action>
Follow the exact patterns from `@apps/web/src/app/api/v1/carrier/clients/route.ts` and `[id]/route.ts` — same auth boilerplate (getSession, check session, extract orgId=session.tenantId, check orgId), same try/catch with logger.error, same NextResponse.json wrapping.

**dispatches/route.ts (GET + POST):**

GET: Extract query params — status, date_from, date_to, driver_id, needs_assignment (parse "true"/"false"), page, pageSize. Call `listDispatches(orgId, filters)`. Return `{ data: { ...result, page, pageSize } }`.

POST: Zod schema `DispatchCreateSchema`:
- primaryDriverId: z.string().uuid()
- truckId: z.string().uuid()
- coDriverId: z.string().uuid().optional()
- trailerId: z.string().uuid().optional()
- dispatcherId: z.string().uuid().optional()
- routeTemplateId: z.string().uuid().optional()
- scheduledDeparture: z.string().datetime().optional()
- scheduledArrival: z.string().datetime().optional()
- plannedMiles: z.number().optional()
- hosCycle: z.string().optional()
- notes: z.string().optional()

Parse body, validate, call `createDispatch(orgId, parsed.data)`. Return 201.

**dispatches/[id]/route.ts (GET + PATCH):**

GET: `const { id } = await params;` Call `getDispatch(orgId, id)`. Return 404 if null.

PATCH: Zod schema `DispatchUpdateSchema` — all fields optional. Parse, validate. Call `updateDispatch(orgId, id, parsed.data)`. If result has `.error`, return 409 with error message. Return 404 if null.

Params type: `{ params: Promise<{ id: string }> }` (Next.js 15 pattern — must await params).

**dispatches/[id]/status/route.ts (PATCH only):**

Zod schema: `{ status: z.enum(['in_progress', 'completed', 'cancelled', 'tonu']), notes: z.string().optional() }`.

Call `transitionDispatchStatus(orgId, id, parsed.data.status, parsed.data.notes)`. If result is null, return 404. If result has `.error`, return 422 with `{ error: result.error, details: result.details }`. Otherwise return `{ data: result }`.

Params type: same `Promise<{ id: string }>` pattern.
  </action>
  <verify>Run `npx tsc --noEmit -p apps/web/tsconfig.json` — all three route files compile. Verify the directory structure exists: `ls apps/web/src/app/api/v1/carrier/dispatches/` shows route.ts and [id]/ directory.</verify>
  <done>Three dispatch API route files created. GET list defaults to today+tomorrow. POST validates required fields and auto-generates dispatch number. PATCH fields blocked when completed, driver/truck locked when in_progress. Status endpoint enforces state machine with 422 on invalid transitions.</done>
</task>

<task type="auto">
  <name>Task 3: Load API routes (list, create, get, update, revenue)</name>
  <files>
    apps/web/src/app/api/v1/carrier/loads/route.ts
    apps/web/src/app/api/v1/carrier/loads/[id]/route.ts
    apps/web/src/app/api/v1/carrier/loads/[id]/revenue/route.ts
  </files>
  <action>
Same auth + error handling patterns as dispatch routes.

**loads/route.ts (GET + POST):**

GET: Extract query params — client_id, dispatch_id, status, date_from, date_to, page, pageSize. Call `listLoads(orgId, filters)`. Return `{ data: { ...result, page, pageSize } }`.

POST: Zod schema `LoadCreateSchema`:
- clientId: z.string().uuid()
- dispatchId: z.string().uuid().optional()
- contractId: z.string().uuid().optional()
- loadType: z.enum(['ftl', 'ltl', 'partial', 'drayage', 'intermodal']).optional()
- referenceNumber: z.string().optional()
- bolNumber: z.string().optional()
- proNumber: z.string().optional()
- poNumber: z.string().optional()
- commodityDescription: z.string().optional()
- commodityWeightLbs: z.number().optional()
- commodityPieces: z.number().int().optional()
- commodityPallets: z.number().int().optional()
- hazmat: z.boolean().optional()
- hazmatClass: z.string().optional()
- rateType: z.enum(['per_mile', 'flat', 'per_stop', 'per_cwt', 'per_pallet', 'hourly']).optional()
- rateAmount: z.number().optional()
- brokerFlag: z.boolean().optional()
- carrierCost: z.number().optional()
- specialInstructions: z.string().optional()
- notes: z.string().optional()

CRITICAL: If body does not contain clientId (or Zod fails on clientId), catch that specific case and return `{ status: 400, body: { error: "client_id is required — every load must be attributed to a client." } }`. The exact message matters. Simplest approach: check `!body.clientId` before Zod validation and return 400 with exact message. Then proceed with Zod for other fields.

Call `createLoad(orgId, parsed.data)`. If it throws with clientId message, return 400. Otherwise return 201.

**loads/[id]/route.ts (GET + PATCH):**

GET: Call `getLoad(orgId, id)`. Return 404 if null.

PATCH: Zod schema `LoadUpdateSchema` — all fields optional (same as create but all .optional()). Parse, validate. Call `updateLoad(orgId, id, parsed.data)`. Return 404 if null.

Params type: `{ params: Promise<{ id: string }> }`.

**loads/[id]/revenue/route.ts (PATCH only):**

No body needed. Extract id from params. Call `recalculateAndStore(orgId, id)` from revenue-calculator. If load not found, return 404. Return `{ data: { id, totalRevenue, fuelSurcharge } }` with updated values.

Params type: same `Promise<{ id: string }>` pattern.
  </action>
  <verify>Run `npx tsc --noEmit -p apps/web/tsconfig.json` — all three route files compile. Verify: `ls apps/web/src/app/api/v1/carrier/loads/` shows route.ts and [id]/ directory with route.ts and revenue/ subdirectory.</verify>
  <done>Three load API route files created. POST rejects missing clientId with exact error message. Contract auto-populates rate fields. PATCH triggers revenue recalculation on rate field changes. Revenue endpoint triggers on-demand recalculation. All 9 files from the spec are created and compile.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit -p apps/web/tsconfig.json` passes with no errors on all 9 new files.
2. All 9 files exist at the specified paths.
3. Revenue calculator handles: per_mile, flat, per_stop, per_cwt, per_pallet, hourly rate types.
4. FSC handles: percent_of_linehaul, per_mile, none methods.
5. Dispatch status transitions: planned->in_progress, in_progress->completed (with stop check), planned->cancelled (cascades to loads), planned->tonu (tags notes).
6. Load POST without clientId returns 400 with exact message "client_id is required — every load must be attributed to a client."
7. No existing files were modified.
</verification>

<success_criteria>
All 9 files created and compiling. Dispatch CRUD with status machine. Load CRUD with contract auto-populate and revenue calculation. Revenue calculator covers all rate types and FSC methods. Exact error messages match spec.
</success_criteria>

<output>
After completion, create `.planning/quick/160-carrier-ops-api-routes-for-dispatches-an/160-SUMMARY.md`
</output>
