---
phase: quick-217
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/carrier/contracts.ts
  - apps/web/src/lib/carrier/dispatches.ts
  - apps/web/src/lib/carrier/loads.ts
autonomous: true
must_haves:
  truths:
    - "Contract numbers never collide even under concurrent creation or after deletions"
    - "Dispatch numbers increment correctly regardless of deletion history"
    - "Load reference numbers increment correctly regardless of deletion history"
  artifacts:
    - path: "apps/web/src/lib/carrier/contracts.ts"
      provides: "MAX-based contract number generation with retry"
      contains: "findFirst"
    - path: "apps/web/src/lib/carrier/dispatches.ts"
      provides: "MAX-based dispatch number generation via notes parsing"
      contains: "findFirst"
    - path: "apps/web/src/lib/carrier/loads.ts"
      provides: "MAX-based load reference number generation"
      contains: "findFirst"
  key_links: []
---

<objective>
Replace COUNT-based auto-number generators with MAX-based generators in contracts, dispatches, and loads.

Purpose: COUNT-based sequence generation produces duplicate numbers when records are deleted or concurrent inserts race. MAX-based generation always picks the next number after the highest existing one.
Output: Three files patched, no schema changes needed.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/carrier/contracts.ts
@apps/web/src/lib/carrier/dispatches.ts
@apps/web/src/lib/carrier/loads.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix contract number generator (contracts.ts)</name>
  <files>apps/web/src/lib/carrier/contracts.ts</files>
  <action>
In `createContract`, replace the COUNT-based sequence generator (lines ~131-137) with a MAX-based query.

Replace:
```ts
const count = await prisma.carrierContract.count({
  where: { orgId, createdAt: { gte: yearStart, lt: yearEnd } },
});
const seq = String(count + 1 + attempt).padStart(5, '0');
const contractNumber = `CN-${year}-${seq}`;
```

With:
```ts
const last = await prisma.carrierContract.findFirst({
  where: { orgId, contractNumber: { startsWith: `CN-${year}-` } },
  orderBy: { contractNumber: 'desc' },
  select: { contractNumber: true },
});
const lastSeq = last ? parseInt(last.contractNumber.slice(-5), 10) : 0;
const seq = String(lastSeq + 1 + attempt).padStart(5, '0');
const contractNumber = `CN-${year}-${seq}`;
```

Keep the existing for-loop retry (up to 5 attempts) and the P2002 catch block exactly as-is. The `contractNumber` field has `@unique` in the schema so the retry loop is essential.

The `yearStart` and `yearEnd` variables above this block may become unused — remove them if so, or leave if used elsewhere in the function.
  </action>
  <verify>TypeScript compiles: `cd apps/web && npx tsc --noEmit`</verify>
  <done>Contract number generation uses findFirst + orderBy desc instead of count. Retry loop preserved.</done>
</task>

<task type="auto">
  <name>Task 2: Fix dispatch and load number generators</name>
  <files>apps/web/src/lib/carrier/dispatches.ts, apps/web/src/lib/carrier/loads.ts</files>
  <action>
**dispatches.ts** — In `createDispatch`, replace lines ~179-181:

Replace:
```ts
const existingCount = await prisma.carrierDispatch.count({ where: { orgId } });
const year = new Date().getFullYear();
const dispatchNumber = `DC-${year}-${String(existingCount + 1).padStart(5, '0')}`;
```

With:
```ts
const year = new Date().getFullYear();
const last = await prisma.carrierDispatch.findFirst({
  where: { orgId, notes: { contains: `DC-${year}-` } },
  orderBy: { createdAt: 'desc' },
  select: { notes: true },
});
let lastSeq = 0;
if (last?.notes) {
  const match = last.notes.match(/\[DISPATCH_NUMBER=DC-\d{4}-(\d{5})\]/);
  if (match) lastSeq = parseInt(match[1], 10);
}
const dispatchNumber = `DC-${year}-${String(lastSeq + 1).padStart(5, '0')}`;
```

No retry loop needed — dispatch number is embedded in notes, not a unique-constrained column.

**loads.ts** — In `createLoad`, replace lines ~159-162:

Replace:
```ts
const existingCount = await prisma.carrierLoad.count({ where: { orgId } });
const year = new Date().getFullYear();
referenceNumber = `LD-${year}-${String(existingCount + 1).padStart(5, '0')}`;
```

With:
```ts
const year = new Date().getFullYear();
const last = await prisma.carrierLoad.findFirst({
  where: { orgId, referenceNumber: { startsWith: `LD-${year}-` } },
  orderBy: { referenceNumber: 'desc' },
  select: { referenceNumber: true },
});
const lastSeq = last?.referenceNumber ? parseInt(last.referenceNumber.slice(-5), 10) : 0;
referenceNumber = `LD-${year}-${String(lastSeq + 1).padStart(5, '0')}`;
```

No retry loop needed — `referenceNumber` has no unique constraint in the schema.
  </action>
  <verify>TypeScript compiles: `cd apps/web && npx tsc --noEmit`</verify>
  <done>Dispatch and load number generators use MAX-based queries instead of count. No regressions.</done>
</task>

</tasks>

<verification>
Run `cd apps/web && npx tsc --noEmit` — zero errors.
Grep all three files for `.count(` to confirm no count-based generators remain:
`grep -n "\.count(" apps/web/src/lib/carrier/contracts.ts apps/web/src/lib/carrier/dispatches.ts apps/web/src/lib/carrier/loads.ts`
— should return zero matches related to sequence generation (other count calls for pagination etc. are fine).
</verification>

<success_criteria>
- All three auto-number generators use findFirst + orderBy desc (MAX pattern)
- Contract retry loop with P2002 catch preserved
- TypeScript compiles cleanly
- No schema or migration changes
</success_criteria>

<output>
After completion, create `.planning/quick/217-fix-duplicate-contract-number-unique-con/217-SUMMARY.md`
</output>
