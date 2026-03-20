---
phase: quick-85
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(owner)/crm/[id]/page.tsx
autonomous: true
must_haves:
  truths:
    - "CRM customer detail page shows correct Total Loads count from invoiced loads"
    - "CRM customer detail page shows correct Total Revenue summed from invoiced load rates"
    - "CRM customer detail page shows Last Load date from most recent invoiced load"
  artifacts:
    - path: "src/app/(owner)/crm/[id]/page.tsx"
      provides: "Live-computed performance stats from Load table"
      contains: "prisma.load.aggregate"
  key_links:
    - from: "src/app/(owner)/crm/[id]/page.tsx"
      to: "prisma.load"
      via: "aggregate query on INVOICED loads"
      pattern: "prisma\\.load\\.aggregate"
---

<objective>
Fix the CRM Performance section to compute stats live from INVOICED loads instead of reading stale stored fields (totalLoads, totalRevenue, lastLoadDate) that were never backfilled.

Purpose: Existing customers with historical loads show 0/0 because the stored fields were never populated. Computing live ensures accuracy.
Output: Updated customer detail page with live stats.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/app/(owner)/crm/[id]/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace stored performance fields with live aggregate query</name>
  <files>src/app/(owner)/crm/[id]/page.tsx</files>
  <action>
In `src/app/(owner)/crm/[id]/page.tsx`, make these changes:

1. Inside the try block (after the `prisma.customer.findUnique` call on line 16), add a parallel aggregate query using `Promise.all` to avoid sequential awaits. Refactor so both the customer query and the load aggregate run in parallel:

```ts
const [customer, loadStats] = await Promise.all([
  prisma.customer.findUnique({
    where: { id },
    include: {
      interactions: {
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
    },
  }),
  prisma.load.aggregate({
    where: { customerId: id, status: 'INVOICED' },
    _count: { id: true },
    _sum: { rate: true },
    _max: { updatedAt: true },
  }),
]);
```

Remove the separate `let customer;` declaration and the standalone query. Declare `customer` and `loadStats` via the destructured Promise.all result.

2. After the `if (!customer) notFound()` check, derive display values:

```ts
const totalLoads = loadStats._count.id;
const totalRevenue = loadStats._sum.rate ?? 0;
const lastLoadDate = loadStats._max.updatedAt;
```

3. In the Performance JSX section (lines 130-146), replace:
- `{customer.totalLoads}` with `{totalLoads}`
- `{Number(customer.totalRevenue).toLocaleString()}` with `{Number(totalRevenue).toLocaleString()}`
- `{customer.lastLoadDate && (` with `{lastLoadDate && (`
- `{new Date(customer.lastLoadDate).toLocaleDateString()}` with `{new Date(lastLoadDate).toLocaleDateString()}`

No new imports needed. The `prisma` instance is already tenant-scoped via `getTenantPrisma()`.
  </action>
  <verify>Run `npx next build` or `npx tsc --noEmit` to confirm no type errors. Visually confirm the Performance section references `totalLoads`, `totalRevenue`, `lastLoadDate` (local variables) instead of `customer.totalLoads`, `customer.totalRevenue`, `customer.lastLoadDate`.</verify>
  <done>CRM customer detail page computes Total Loads, Total Revenue, and Last Load Date live from INVOICED loads in the Load table. No stale stored fields used.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no errors
- The file contains `prisma.load.aggregate` with `status: 'INVOICED'` filter
- The Performance JSX uses local `totalLoads`, `totalRevenue`, `lastLoadDate` variables
- No references to `customer.totalLoads`, `customer.totalRevenue`, or `customer.lastLoadDate` remain in the Performance section
</verification>

<success_criteria>
CRM customer detail page shows accurate, live-computed performance stats from invoiced loads instead of stale stored fields.
</success_criteria>

<output>
After completion, create `.planning/quick/85-tkt-0035-follow-up-fix-crm-performance-s/85-SUMMARY.md`
</output>
