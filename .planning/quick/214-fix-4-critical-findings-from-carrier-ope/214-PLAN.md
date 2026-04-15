---
phase: quick-214
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts
  - apps/web/src/components/carrier/fleet/CarrierDriverForm.tsx
  - apps/web/src/lib/carrier/loads.ts
  - apps/web/src/lib/carrier/dispatches.ts
  - apps/web/src/lib/carrier/documents.ts
autonomous: true
must_haves:
  truths:
    - "Driver creation succeeds with all 5 pay models used by pay-calculator"
    - "Load creation with a clientId from a different org returns error"
    - "Dispatch creation with a driverId or truckId from a different org returns error"
    - "Document upload with a parentId from a different org returns error"
  artifacts:
    - path: "apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts"
      provides: "Corrected Zod enum for payModel"
      contains: "percentage_gross"
    - path: "apps/web/src/components/carrier/fleet/CarrierDriverForm.tsx"
      provides: "Corrected form dropdown for payModel"
      contains: "percentage_gross"
    - path: "apps/web/src/lib/carrier/loads.ts"
      provides: "clientId and contractId ownership checks"
      contains: "carrierClient.findFirst"
    - path: "apps/web/src/lib/carrier/dispatches.ts"
      provides: "driverId and truckId ownership checks"
      contains: "carrierDriver.findFirst"
    - path: "apps/web/src/lib/carrier/documents.ts"
      provides: "parentId ownership check before upload"
      contains: "orgVerified"
  key_links:
    - from: "apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts"
      to: "apps/web/src/lib/carrier/pay-calculator.ts"
      via: "payModel enum values must match"
      pattern: "percentage_gross.*hourly.*team_split"
    - from: "apps/web/src/lib/carrier/loads.ts"
      to: "prisma.carrierClient"
      via: "ownership check before create"
      pattern: "carrierClient\\.findFirst.*orgId"
    - from: "apps/web/src/lib/carrier/dispatches.ts"
      to: "prisma.carrierDriver + prisma.carrierTruck"
      via: "ownership checks before create"
      pattern: "carrierDriver\\.findFirst.*orgId"
    - from: "apps/web/src/lib/carrier/documents.ts"
      to: "parent entity tables"
      via: "ownership verification before upload"
      pattern: "orgVerified"
---

<objective>
Fix all 4 Critical findings from Carrier Operations audit 213: pay_model enum mismatch causing broken pay generation, and 3 cross-tenant data leakage vectors in createLoad, createDispatch, and uploadDocument.

Purpose: Eliminate 2 guaranteed ISEs on driver form submission and 2 active cross-tenant data leakage risks.
Output: Patched lib functions and API route/form with correct enum values.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/quick/213-carrier-operations-server-actions-audit-/213-REPORT.md
@apps/web/src/lib/carrier/pay-calculator.ts (lines 56-57 show the 5 pay models: per_mile, percentage_gross, hourly, flat_rate, team_split)
@apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts (line 17: incorrect Zod enum)
@apps/web/src/components/carrier/fleet/CarrierDriverForm.tsx (lines 336-339: incorrect form dropdown values)
@apps/web/src/lib/carrier/loads.ts (createLoad function at line 127: no clientId ownership check)
@apps/web/src/lib/carrier/dispatches.ts (createDispatch function at line 151: no driver/truck ownership check)
@apps/web/src/lib/carrier/documents.ts (uploadDocument function at line 30: no parentId ownership check)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix pay_model enum mismatch in Zod schema and form</name>
  <files>
    apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts
    apps/web/src/components/carrier/fleet/CarrierDriverForm.tsx
  </files>
  <action>
The pay-calculator (pay-calculator.ts lines 56-275) uses exactly 5 pay models: `per_mile`, `percentage_gross`, `hourly`, `flat_rate`, `team_split`. There are NO SQL CHECK constraints on the carrier_drivers table (audit confirmed all constraints are app-level only).

The current Zod enum on line 17 of the drivers route is `['per_mile', 'percentage', 'flat_rate', 'per_stop']` -- this is wrong. `percentage` should be `percentage_gross`, `per_stop` should be removed, and `hourly` + `team_split` must be added.

1. In `apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts`, change the `payModel` Zod enum on line 17 from:
   ```
   z.enum(['per_mile', 'percentage', 'flat_rate', 'per_stop'])
   ```
   to:
   ```
   z.enum(['per_mile', 'percentage_gross', 'hourly', 'flat_rate', 'team_split'])
   ```

2. In `apps/web/src/components/carrier/fleet/CarrierDriverForm.tsx`:

   a. Update `PAY_RATE_LABELS` (line 55-60) from:
   ```ts
   const PAY_RATE_LABELS: Record<string, string> = {
     per_mile: 'Rate per Mile ($)',
     percentage: 'Percentage (%)',
     flat_rate: 'Flat Rate ($)',
     per_stop: 'Rate per Stop ($)',
   };
   ```
   to:
   ```ts
   const PAY_RATE_LABELS: Record<string, string> = {
     per_mile: 'Rate per Mile ($)',
     percentage_gross: 'Percentage of Gross (%)',
     hourly: 'Hourly Rate ($)',
     flat_rate: 'Flat Rate ($)',
     team_split: 'Rate per Mile ($)',
   };
   ```

   b. Update the Pay Model `<Select>` dropdown options (lines 336-339) from:
   ```tsx
   <SelectItem value="per_mile">Per Mile</SelectItem>
   <SelectItem value="percentage">Percentage</SelectItem>
   <SelectItem value="flat_rate">Flat Rate</SelectItem>
   <SelectItem value="per_stop">Per Stop</SelectItem>
   ```
   to:
   ```tsx
   <SelectItem value="per_mile">Per Mile</SelectItem>
   <SelectItem value="percentage_gross">Percentage of Gross</SelectItem>
   <SelectItem value="hourly">Hourly</SelectItem>
   <SelectItem value="flat_rate">Flat Rate</SelectItem>
   <SelectItem value="team_split">Team Split</SelectItem>
   ```
  </action>
  <verify>
1. Run `npx tsc --noEmit` from apps/web -- no new type errors.
2. Grep: `grep -n "percentage_gross\|hourly\|team_split" apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts` shows all 3 new values present.
3. Grep: `grep -n "percentage_gross\|hourly\|team_split" apps/web/src/components/carrier/fleet/CarrierDriverForm.tsx` shows all 3 new values present.
4. Grep: `grep -n "per_stop\|\"percentage\"" apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts` returns NO matches (old incorrect values removed).
  </verify>
  <done>Zod schema and form dropdown both use exactly the 5 pay models from pay-calculator: per_mile, percentage_gross, hourly, flat_rate, team_split. No stale values remain.</done>
</task>

<task type="auto">
  <name>Task 2: Add clientId and contractId ownership checks to createLoad</name>
  <files>apps/web/src/lib/carrier/loads.ts</files>
  <action>
In `apps/web/src/lib/carrier/loads.ts`, in the `createLoad` function (line 127), add ownership verification for `clientId` and `contractId` BEFORE the `prisma.carrierLoad.create()` call on line 156.

After the existing `if (!data.clientId)` check (line 128-130), add:

```ts
// Verify client belongs to this org (cross-tenant isolation)
const client = await prisma.carrierClient.findFirst({
  where: { id: data.clientId, orgId },
});
if (!client) {
  throw new Error('Invalid client');
}
```

The existing contractId block (lines 136-145) already does `findFirst({ where: { id: data.contractId, orgId } })` for auto-populating rate fields. However, if the contract is NOT found (different org), it silently skips and the contractId still gets written to the load on line 162 (`contractId: data.contractId ?? null`). Change the contract block to explicitly reject if contract not found under this org:

Replace the existing contract block (lines 136-145) with:
```ts
if (data.contractId) {
  const contract = await prisma.carrierContract.findFirst({
    where: { id: data.contractId, orgId },
  });
  if (!contract) {
    throw new Error('Invalid contract');
  }
  if (!rateType) rateType = contract.rateType;
  if (rateAmount == null && contract.baseRate != null) {
    rateAmount = Number(contract.baseRate);
  }
}
```

Then update the API route (`apps/web/src/app/api/v1/carrier/loads/route.ts`) POST handler to catch these new errors. In the catch block (around line 93-98), add catches for the new error messages:

```ts
if (err instanceof Error && (
  err.message === 'Invalid client' ||
  err.message === 'Invalid contract'
)) {
  return NextResponse.json({ error: err.message }, { status: 400 });
}
```

Add this BEFORE the existing `client_id is required` catch on line 93.
  </action>
  <verify>
1. Grep: `grep -n "carrierClient.findFirst" apps/web/src/lib/carrier/loads.ts` shows the ownership check.
2. Grep: `grep -n "Invalid client\|Invalid contract" apps/web/src/lib/carrier/loads.ts` shows both error strings.
3. Grep: `grep -n "Invalid client\|Invalid contract" apps/web/src/app/api/v1/carrier/loads/route.ts` shows both caught in API route.
4. Run `npx tsc --noEmit` from apps/web -- no new type errors.
  </verify>
  <done>createLoad rejects clientId and contractId that do not belong to the authenticated org, returning 400 with descriptive error message.</done>
</task>

<task type="auto">
  <name>Task 3: Add driver and truck ownership checks to createDispatch</name>
  <files>
    apps/web/src/lib/carrier/dispatches.ts
    apps/web/src/app/api/v1/carrier/dispatches/route.ts
  </files>
  <action>
In `apps/web/src/lib/carrier/dispatches.ts`, in the `createDispatch` function (line 151), add ownership verification for `primaryDriverId`, `truckId`, and `coDriverId` BEFORE the `prisma.carrierDispatch.create()` call on line 163.

Add immediately after the function signature (after line 151):

```ts
// Verify primary driver belongs to this org
const driver = await prisma.carrierDriver.findFirst({
  where: { id: data.primaryDriverId, orgId },
});
if (!driver) {
  throw new Error('Invalid driver');
}

// Verify truck belongs to this org
const truck = await prisma.carrierTruck.findFirst({
  where: { id: data.truckId, orgId },
});
if (!truck) {
  throw new Error('Invalid truck');
}

// Verify co-driver belongs to this org (if provided)
if (data.coDriverId) {
  const coDriver = await prisma.carrierDriver.findFirst({
    where: { id: data.coDriverId, orgId },
  });
  if (!coDriver) {
    throw new Error('Invalid co-driver');
  }
}
```

Then update the API route (`apps/web/src/app/api/v1/carrier/dispatches/route.ts`) POST handler. In the catch block (around line 77), add error catching BEFORE the generic 500:

```ts
if (err instanceof Error && (
  err.message === 'Invalid driver' ||
  err.message === 'Invalid truck' ||
  err.message === 'Invalid co-driver'
)) {
  return NextResponse.json({ error: err.message }, { status: 400 });
}
```
  </action>
  <verify>
1. Grep: `grep -n "carrierDriver.findFirst\|carrierTruck.findFirst" apps/web/src/lib/carrier/dispatches.ts` shows both ownership checks.
2. Grep: `grep -n "Invalid driver\|Invalid truck\|Invalid co-driver" apps/web/src/lib/carrier/dispatches.ts` shows all 3 error strings.
3. Grep: `grep -n "Invalid driver\|Invalid truck\|Invalid co-driver" apps/web/src/app/api/v1/carrier/dispatches/route.ts` shows all 3 caught in API route.
4. Run `npx tsc --noEmit` from apps/web -- no new type errors.
  </verify>
  <done>createDispatch rejects primaryDriverId, truckId, and coDriverId that do not belong to the authenticated org, returning 400 with descriptive error message.</done>
</task>

<task type="auto">
  <name>Task 4: Add parentId ownership check to uploadDocument</name>
  <files>apps/web/src/lib/carrier/documents.ts</files>
  <action>
In `apps/web/src/lib/carrier/documents.ts`, in the `uploadDocument` function (line 30), add ownership verification for `parentId` BEFORE the storage upload (line 57). The `listDocuments` and `deleteDocument` functions already have this pattern -- reuse the same approach.

Add after the file size validation (after line 50, before the storage path build on line 53):

```ts
// Verify parent entity belongs to this org (cross-tenant isolation)
let orgVerified = false;

if (parentType === 'stop') {
  const stop = await prisma.carrierStop.findFirst({
    where: { id: parentId, dispatch: { orgId } },
  });
  orgVerified = !!stop;
} else if (parentType === 'load') {
  const load = await prisma.carrierLoad.findFirst({ where: { id: parentId, orgId } });
  orgVerified = !!load;
} else if (parentType === 'dispatch') {
  const dispatch = await prisma.carrierDispatch.findFirst({ where: { id: parentId, orgId } });
  orgVerified = !!dispatch;
} else if (parentType === 'contract') {
  const contract = await prisma.carrierContract.findFirst({ where: { id: parentId, orgId } });
  orgVerified = !!contract;
} else if (parentType === 'expense') {
  const expense = await prisma.carrierExpense.findFirst({ where: { id: parentId, orgId } });
  orgVerified = !!expense;
}

if (!orgVerified) {
  return { error: 'Invalid parent', status: 400 };
}
```

This mirrors the pattern used in `listDocuments` (line 112-128) and `deleteDocument` (line 152-166), but adds `contract` and `expense` parent types that the upload action also accepts. The check runs BEFORE the storage upload so no orphan files are created for rejected requests.
  </action>
  <verify>
1. Grep: `grep -n "orgVerified" apps/web/src/lib/carrier/documents.ts` shows the variable appears in uploadDocument, listDocuments, deleteDocument, and verifyDocument.
2. Grep: `grep -c "Invalid parent" apps/web/src/lib/carrier/documents.ts` returns 1 (in uploadDocument).
3. Grep: `grep -n "parentType === 'contract'\|parentType === 'expense'" apps/web/src/lib/carrier/documents.ts` shows both new parent types handled.
4. Run `npx tsc --noEmit` from apps/web -- no new type errors.
  </verify>
  <done>uploadDocument verifies parentId ownership through the parent entity chain for all 5 parent types (stop, load, dispatch, contract, expense) before uploading to storage or creating the document record. Cross-tenant uploads return 400 "Invalid parent".</done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx tsc --noEmit` -- zero new TypeScript errors
2. All 5 pay-calculator pay models (`per_mile`, `percentage_gross`, `hourly`, `flat_rate`, `team_split`) appear in both the Zod schema and the form dropdown
3. No stale pay model values (`percentage`, `per_stop`) remain in the codebase for the driver route/form
4. createLoad checks clientId + contractId ownership via `carrierClient.findFirst` and `carrierContract.findFirst` with orgId
5. createDispatch checks primaryDriverId + truckId + coDriverId ownership via `carrierDriver.findFirst` and `carrierTruck.findFirst` with orgId
6. uploadDocument checks parentId ownership via parent entity chain for all accepted parent types before upload
</verification>

<success_criteria>
- All 4 Critical findings from audit 213 are resolved
- No new TypeScript errors introduced
- Ownership checks use orgId from session (never from request payload)
- DB schema and migration files are NOT modified
- No Medium or Low findings are touched
</success_criteria>

<output>
After completion, create `.planning/quick/214-fix-4-critical-findings-from-carrier-ope/214-SUMMARY.md`
</output>
