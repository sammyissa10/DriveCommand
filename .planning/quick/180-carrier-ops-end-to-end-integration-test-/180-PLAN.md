---
phase: quick-180
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/tests/carrier/contracted-route-journey.test.ts
autonomous: true
must_haves:
  truths:
    - "Test validates the full 15-step contracted recurring route journey end-to-end"
    - "Step 11 (POD required before completing delivery stop) returns 422 with correct message"
    - "Revenue is calculated using per_stop formula (65 x delivery stop count)"
    - "Pay record is auto-generated for the primary driver after dispatch completes"
    - "All test data is cleaned up in try/finally regardless of test outcome"
  artifacts:
    - path: "apps/web/tests/carrier/contracted-route-journey.test.ts"
      provides: "End-to-end integration test for carrier ops contracted recurring route journey"
      min_lines: 250
  key_links:
    - from: "tests/carrier/contracted-route-journey.test.ts"
      to: "lib/carrier/*.ts service functions"
      via: "direct service function imports"
      pattern: "import.*from.*lib/carrier"
---

<objective>
Create a Vitest integration test that validates the complete "contracted recurring route" journey (spec section 6.1) for carrier ops. This is the acceptance test for the entire carrier ops Phase 1-4 build.

Purpose: Prove the full carrier ops pipeline works end-to-end against a real database -- from client creation through dispatch generation, stop completion with document compliance enforcement, revenue calculation, and driver pay record generation.

Output: `apps/web/tests/carrier/contracted-route-journey.test.ts`
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/vitest.config.ts
@apps/web/tests/isolation/setup.ts
@apps/web/tests/isolation/cross-tenant.test.ts
@apps/web/prisma/schema.prisma (lines 1249-1723 — CarrierClient through DriverPayRecord models)
@apps/web/src/lib/carrier/clients.ts
@apps/web/src/lib/carrier/contracts.ts
@apps/web/src/lib/carrier/facilities.ts
@apps/web/src/lib/carrier/route-templates.ts
@apps/web/src/lib/carrier/dispatch-generator.ts
@apps/web/src/lib/carrier/dispatches.ts
@apps/web/src/lib/carrier/stop-completion.ts
@apps/web/src/lib/carrier/documents.ts
@apps/web/src/lib/carrier/loads.ts
@apps/web/src/lib/carrier/revenue-calculator.ts
@apps/web/src/lib/carrier/pay-calculator.ts
@apps/web/src/lib/carrier/stops.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Write the contracted recurring route journey integration test</name>
  <files>apps/web/tests/carrier/contracted-route-journey.test.ts</files>
  <action>
Create a Vitest integration test file that calls carrier ops service functions DIRECTLY (bypassing HTTP route handlers and auth). This follows the same pattern as `tests/isolation/cross-tenant.test.ts` -- use Prisma directly with `bypass_rls` for setup/teardown, and call service layer functions for the journey steps.

IMPORTANT: The API routes all use `getSession()` which requires Supabase auth cookies -- impossible to mock in integration tests. Instead, call the underlying service functions directly:
- `createClient(orgId, data)` from `@/lib/carrier/clients`
- `createContract(orgId, clientId, data)` from `@/lib/carrier/contracts`
- `createFacility(orgId, data)` from `@/lib/carrier/facilities`
- `createRouteTemplate(orgId, data)` from `@/lib/carrier/route-templates`
- `generateDispatches(orgId, templateId, throughDate)` from `@/lib/carrier/dispatch-generator`
- `listDispatches(orgId, filters)` from `@/lib/carrier/dispatches`
- `transitionDispatchStatus(orgId, id, status)` from `@/lib/carrier/dispatches`
- `arriveStop(orgId, stopId)` from `@/lib/carrier/stop-completion`
- `completeStop(orgId, stopId)` from `@/lib/carrier/stop-completion`
- `uploadDocument(orgId, userId, data)` from `@/lib/carrier/documents`
- `getLoad(orgId, loadId)` from `@/lib/carrier/loads`
- For pay records and dispatches listing: use Prisma directly

STRUCTURE:

```
import { PrismaClient } from '../../src/generated/prisma/client';

const hasDatabase = !!process.env.DATABASE_URL;
const describeWithDb = hasDatabase ? describe : describe.skip;
```

Use a fresh PrismaClient instance (like the isolation tests). For setup, create test data using `$transaction` with `bypass_rls`:
1. Create a Tenant (`name: 'Test Carrier Ops Tenant'`)
2. Create a User (for `uploadedBy` FK on documents -- needs `clerkUserId`, `email`, `role: 'OWNER'`)
3. Create a CarrierDriver (`firstName: 'Test', lastName: 'Driver', orgId, payModel: 'per_mile', payRate: '0.55'`)
4. Create a CarrierTruck (`unitNumber: 'TEST-001', orgId`)

The test is a SINGLE `it()` block (sequential steps depend on prior IDs) wrapped in `try/finally` for cleanup.

STEP-BY-STEP IMPLEMENTATION:

Step 1 - Create client:
```ts
const client = await createClient(orgId, { name: 'Midwest Tire Distributors' });
expect(client).toBeDefined();
expect(client.id).toBeDefined();
```
Note: `createClient` returns the Prisma model directly. There is no `payment_terms_days` field on CarrierClient schema -- skip that assertion. Assert `client.id` is a UUID string and `client.name` matches.

Step 2 - Create contract:
```ts
const contract = await createContract(orgId, client.id, {
  rateType: 'per_stop',
  baseRate: '65.00',
  fuelSurchargeMethod: 'per_mile',
  fuelSurchargeRate: '0.08',
});
expect(contract.contractNumber).toMatch(/^CN-/);
```
Note: `createContract` takes `(orgId, clientId, data)`. The `baseRate` and `fuelSurchargeRate` are strings (Decimal fields). There is no `detention_free_minutes` field in the schema -- skip it.

Step 3 - Create two facilities:
```ts
const warehouse = await createFacility(orgId, {
  name: 'Midwest Tire Warehouse',
  facilityType: 'warehouse',
  city: 'Chicago', state: 'IL',
});
const shop = await createFacility(orgId, {
  name: 'Midwest Tire Shop #1',
  facilityType: 'customer',
  city: 'Milwaukee', state: 'WI',
});
expect(warehouse.id).toBeDefined();
expect(shop.id).toBeDefined();
```

Step 4 - Create route template with stops:
First create the template:
```ts
const template = await createRouteTemplate(orgId, {
  templateName: 'MWT Daily Delivery',
  clientId: client.id,
  contractId: contract.id,
  scheduleType: 'recurring',
  recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
  equipmentType: 'dry_van',
  autoGenerateDaysAhead: 7,
  defaultDriverId: driverId,
  defaultTruckId: truckId,
});
expect(template.id).toBeDefined();
```
Then create RouteTemplateStop records via Prisma directly (no service function exists for this):
```ts
await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
  await tx.routeTemplateStop.create({
    data: {
      routeTemplateId: template.id,
      sequenceOrder: 1,
      stopType: 'pickup',
      facilityId: warehouse.id,
      bolRequired: true,
      podRequired: false,
    },
  });
  await tx.routeTemplateStop.create({
    data: {
      routeTemplateId: template.id,
      sequenceOrder: 2,
      stopType: 'delivery',
      facilityId: shop.id,
      bolRequired: false,
      podRequired: true,
    },
  });
});
```

Step 5 - Generate dispatches:
```ts
// Generate for 14 days ahead to ensure at least 1 weekday is covered
const futureDate = new Date();
futureDate.setDate(futureDate.getDate() + 14);
const throughDate = futureDate.toISOString().split('T')[0];
const genResult = await generateDispatches(orgId, template.id, throughDate);
expect(genResult.dispatchesCreated).toBeGreaterThanOrEqual(1);
```

Step 6 - List dispatches and find our generated one:
```ts
const dispatches = await listDispatches(orgId, {
  routeTemplateId: template.id,
  dateFrom: new Date().toISOString(),
  dateTo: new Date(Date.now() + 14 * 86400000).toISOString(),
});
expect(dispatches.items.length).toBeGreaterThanOrEqual(1);
const dispatch = dispatches.items[0];
expect(dispatch.status).toBe('planned');
expect(dispatch.routeTemplateId).toBe(template.id);
const dispatchId = dispatch.id;
```

Step 7 - Transition dispatch to in_progress:
```ts
const transResult = await transitionDispatchStatus(orgId, dispatchId, 'in_progress');
expect(transResult).not.toBeNull();
expect('error' in transResult!).toBe(false);
// Verify actualDeparture is set by re-fetching
const updatedDispatch = await prisma.carrierDispatch.findFirst({ where: { id: dispatchId } });
expect(updatedDispatch!.actualDeparture).not.toBeNull();
```

Step 8 - Get stops and arrive at pickup:
```ts
const stops = await prisma.carrierStop.findMany({
  where: { dispatchId },
  orderBy: { sequenceOrder: 'asc' },
});
const pickupStop = stops.find(s => s.stopType === 'pickup')!;
const deliveryStop = stops.find(s => s.stopType === 'delivery')!;

// Link stops to load (dispatch-generator creates the load but not stop-load links)
const load = await prisma.carrierLoad.findFirst({ where: { dispatchId, orgId } });
expect(load).not.toBeNull();
const loadId = load!.id;

// Update stops to link to load (needed for cascade completion)
await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
  await tx.carrierStop.update({ where: { id: pickupStop.id }, data: { loadId } });
  await tx.carrierStop.update({ where: { id: deliveryStop.id }, data: { loadId } });
});

const arriveResult = await arriveStop(orgId, pickupStop.id);
expect('data' in arriveResult).toBe(true);
if ('data' in arriveResult) {
  expect(arriveResult.data.arrivedAt).not.toBeNull();
  expect(arriveResult.data.status).toBe('arrived');
}
```

Step 9 - Upload BOL document for pickup stop:
The `uploadDocument` function requires a `File` object and uploads to Supabase Storage. In integration tests, the Supabase storage bucket may not exist. Instead, create the `CarrierDocument` record directly via Prisma AND set `bolNumber` on the stop (both are checked by `completeStop`):
```ts
await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
  await tx.carrierDocument.create({
    data: {
      parentType: 'stop',
      parentId: pickupStop.id,
      stopId: pickupStop.id,
      documentType: 'bol',
      fileUrl: 'test://bol.pdf',
      filename: 'test-bol.pdf',
      uploadedBy: userId,
    },
  });
  await tx.carrierStop.update({
    where: { id: pickupStop.id },
    data: { bolNumber: 'BOL-TEST-001' },
  });
});
```
Assert: verify via Prisma that the document exists and bolNumber is set.

Step 10 - Complete pickup stop:
```ts
const completePickupResult = await completeStop(orgId, pickupStop.id);
expect('data' in completePickupResult).toBe(true);
if ('data' in completePickupResult) {
  expect(completePickupResult.data.status).toBe('completed');
  const notes = JSON.parse(completePickupResult.data.notes ?? '{}');
  expect(notes.dwell_minutes).toBeGreaterThanOrEqual(0);
}
```

Step 11 - CRITICAL: Attempt to complete delivery stop WITHOUT POD -- must get 422:
```ts
// First arrive at delivery stop
const arriveDeliveryResult = await arriveStop(orgId, deliveryStop.id);
expect('data' in arriveDeliveryResult).toBe(true);

// Now try to complete WITHOUT POD document
const failResult = await completeStop(orgId, deliveryStop.id);
expect('error' in failResult).toBe(true);
if ('error' in failResult) {
  expect(failResult.status).toBe(422);
  expect(failResult.error).toBe('POD document required before completing this stop.');
}
```

Step 12 - Upload POD document:
```ts
await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
  await tx.carrierDocument.create({
    data: {
      parentType: 'stop',
      parentId: deliveryStop.id,
      stopId: deliveryStop.id,
      documentType: 'pod',
      fileUrl: 'test://pod.pdf',
      filename: 'test-pod.pdf',
      uploadedBy: userId,
    },
  });
  await tx.carrierStop.update({
    where: { id: deliveryStop.id },
    data: { podNumber: 'POD-TEST-001' },
  });
});
```

Step 13 - Complete delivery stop (should now succeed and cascade):
```ts
const completeDeliveryResult = await completeStop(orgId, deliveryStop.id);
expect('data' in completeDeliveryResult).toBe(true);
if ('data' in completeDeliveryResult) {
  expect(completeDeliveryResult.data.status).toBe('completed');
}
```

Step 14 - Verify load status and revenue:
```ts
const finalLoad = await prisma.carrierLoad.findFirst({ where: { id: loadId } });
expect(finalLoad!.status).toBe('delivered');
expect(Number(finalLoad!.totalRevenue)).toBeGreaterThan(0);
// per_stop formula: 65 * delivery_stop_count (1 delivery stop) = 65
expect(Number(finalLoad!.totalRevenue)).toBe(65);
```
Note: The `recalculateAndStore` function is called by `completeStop` cascade when load goes to delivered. It counts delivery stops on the dispatch and multiplies by rateAmount (65). With 1 delivery stop, totalRevenue = 65. The FSC won't add because `fuelSurchargeMethod` is `per_mile` and there are 0 actual/planned miles on the dispatch (dispatch-generator only sets plannedMiles from template.estimatedMiles which we didn't set). So total = 65.

Step 15 - Verify pay record:
```ts
const payRecords = await prisma.driverPayRecord.findMany({
  where: { dispatchId, orgId },
});
expect(payRecords.length).toBeGreaterThanOrEqual(1);
const primaryPayRecord = payRecords.find(pr => pr.driverId === driverId);
expect(primaryPayRecord).toBeDefined();
expect(primaryPayRecord!.status).toBe('pending');
```

TEARDOWN (in finally block):
Delete in reverse dependency order using bypass_rls:
```ts
await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
  await tx.driverPayRecord.deleteMany({ where: { orgId } });
  await tx.carrierDocument.deleteMany({ where: { stopId: { in: [pickupStop?.id, deliveryStop?.id].filter(Boolean) } } });
  await tx.carrierStop.deleteMany({ where: { dispatchId: { in: dispatchIds } } });
  await tx.carrierLoad.deleteMany({ where: { orgId } });
  await tx.carrierDispatch.deleteMany({ where: { orgId } });
  await tx.routeTemplateStop.deleteMany({ where: { routeTemplateId: template?.id } });
  await tx.routeTemplate.deleteMany({ where: { orgId } });
  await tx.carrierContract.deleteMany({ where: { orgId } });
  await tx.carrierFacility.deleteMany({ where: { orgId } });
  await tx.carrierClient.deleteMany({ where: { orgId } });
  await tx.carrierTruck.deleteMany({ where: { orgId } });
  await tx.carrierDriver.deleteMany({ where: { orgId } });
  await tx.user.deleteMany({ where: { tenantId: orgId } });
  await tx.tenant.deleteMany({ where: { id: orgId } });
});
await prisma.$disconnect();
```

Use `let` declarations at the top of the describe block for all IDs that need to be accessible in finally. Wrap the entire test body in try/finally.

IMPORTANT SCHEMA NOTES:
- CarrierClient has NO `payment_terms_days` field -- skip that assertion
- CarrierContract has NO `detention_free_minutes` field -- skip that assertion  
- `completeStop` checks `bolRequired`/`podRequired` from `RouteTemplateStop` (matched by routeTemplateId + sequenceOrder), AND requires both the document record AND the bolNumber/podNumber string on the stop
- The dispatch-generator does NOT create stop-to-load links. Stops are created without loadId. We must manually link stops to loads for the cascade to work properly in step 13.
- The `listDispatches` function defaults to today/tomorrow date range, so pass explicit dateFrom/dateTo spanning the generation window

VITEST CONFIG: The existing `vitest.config.ts` already includes `tests/**/*.test.ts` with 30s timeout and `@` alias. The test file at `tests/carrier/contracted-route-journey.test.ts` will be picked up automatically. Increase timeout for this specific test using `describe` or `it` level timeout since it involves many DB operations -- use `{ timeout: 120000 }`.
  </action>
  <verify>
Run `cd apps/web && npx vitest run tests/carrier/contracted-route-journey.test.ts` (requires DATABASE_URL). If DATABASE_URL is not set, verify the file compiles with `npx tsc --noEmit` from the web app root, and confirm the test is properly skipped with `describe.skip`.
  </verify>
  <done>
Test file exists at `apps/web/tests/carrier/contracted-route-journey.test.ts`, contains all 15 sequential steps, Step 11 explicitly asserts 422 + "POD document required before completing this stop.", try/finally cleanup covers all created records, and the test either passes against a real database or gracefully skips when DATABASE_URL is absent.
  </done>
</task>

</tasks>

<verification>
- File exists: `apps/web/tests/carrier/contracted-route-journey.test.ts`
- TypeScript compiles: `cd apps/web && npx tsc --noEmit` passes (or only has pre-existing errors)
- Test structure: Single describe block with `describeWithDb` pattern, single sequential `it()` block, try/finally cleanup
- Step 11 is the critical assertion: POD enforcement returns 422
- Revenue assertion: totalRevenue = 65 (per_stop rate 65 x 1 delivery stop)
- Pay record assertion: at least 1 pending pay record for the primary driver
</verification>

<success_criteria>
- All 15 journey steps implemented with correct service function calls and assertions
- Step 11 (POD required) is the most thoroughly tested assertion
- Test is self-contained: creates all test data, cleans up in finally block
- Gracefully skips when DATABASE_URL is not set (no test failures in local dev)
- No application code is modified -- test file only
</success_criteria>

<output>
After completion, create `.planning/quick/180-carrier-ops-end-to-end-integration-test-/180-SUMMARY.md`
</output>
