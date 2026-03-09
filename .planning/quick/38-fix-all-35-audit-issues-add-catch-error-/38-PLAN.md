---
phase: quick-38
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(owner)/routes/page.tsx
  - src/app/(owner)/trucks/page.tsx
  - src/app/(owner)/drivers/page.tsx
  - src/app/(owner)/drivers/[id]/page.tsx
  - src/app/(owner)/drivers/invite/page.tsx
  - src/app/(owner)/trucks/[id]/maintenance/page.tsx
  - src/app/(owner)/trucks/[id]/edit/page.tsx
  - src/app/(owner)/trucks/new/page.tsx
  - src/app/(owner)/invoices/page.tsx
  - src/app/(owner)/invoices/[id]/page.tsx
  - src/app/(owner)/invoices/[id]/edit/page.tsx
  - src/app/(owner)/loads/page.tsx
  - src/app/(owner)/loads/new/page.tsx
  - src/app/(owner)/loads/[id]/page.tsx
  - src/app/(owner)/loads/[id]/edit/page.tsx
  - src/app/(owner)/payroll/page.tsx
  - src/app/(owner)/payroll/[id]/page.tsx
  - src/app/(owner)/payroll/[id]/edit/page.tsx
  - src/app/(owner)/crm/page.tsx
  - src/app/(owner)/crm/[id]/page.tsx
  - src/app/(owner)/crm/[id]/edit/page.tsx
  - src/app/(owner)/settings/integrations/page.tsx
  - src/app/(owner)/compliance/page.tsx
  - src/app/(owner)/fuel/page.tsx
  - src/app/(owner)/safety/page.tsx
  - src/app/(owner)/ifta/page.tsx
  - src/app/(owner)/lane-analytics/page.tsx
  - src/app/(owner)/live-map/page.tsx
  - src/app/(owner)/tags/page.tsx
autonomous: true

must_haves:
  truths:
    - "All 27 pages with unguarded DB calls have error handling so a DB failure renders an empty list or 404 instead of crashing"
    - "payroll/[id] null-guards driver.firstName and driver.lastName with ?? '' so it renders even with null name fields"
    - "live-map/page.tsx calls requireRole([OWNER, MANAGER]) so unauthorized users cannot access it"
    - "trucks/new/page.tsx and drivers/invite/page.tsx have no 'use client' directive (they are static server components wrapping client form components)"
    - "tsc --noEmit passes with zero errors after all edits"
  artifacts:
    - path: "src/app/(owner)/routes/page.tsx"
      provides: "listRoutes() with .catch(() => [])"
    - path: "src/app/(owner)/live-map/page.tsx"
      provides: "requireRole guard + Promise.all with per-item .catch()"
    - path: "src/app/(owner)/trucks/new/page.tsx"
      provides: "server component (no 'use client')"
    - path: "src/app/(owner)/drivers/invite/page.tsx"
      provides: "server component (no 'use client')"
  key_links:
    - from: "primary entity fetch (findUnique)"
      to: "notFound()"
      via: "try/catch — catch block calls notFound()"
    - from: "secondary list fetch"
      to: "fallback []"
      via: ".catch(() => []) or catch block returning []"
---

<objective>
Add error handling to 31 files across the owner portal. Pages that crash on DB failure will instead render empty states or 404. Two page files have illegal 'use client' directives removed. live-map gets a missing requireRole guard. payroll detail gets null guards on driver name.

Purpose: Eliminate server-component crashes from transient DB failures and harden pages that previously had no error handling.
Output: 31 modified page.tsx files, all passing tsc --noEmit.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add .catch() / try/catch to list pages (secondary-list fallback pattern)</name>
  <files>
    src/app/(owner)/routes/page.tsx
    src/app/(owner)/trucks/page.tsx
    src/app/(owner)/drivers/page.tsx
    src/app/(owner)/settings/integrations/page.tsx
    src/app/(owner)/tags/page.tsx
    src/app/(owner)/invoices/page.tsx
    src/app/(owner)/loads/page.tsx
    src/app/(owner)/loads/new/page.tsx
    src/app/(owner)/crm/page.tsx
    src/app/(owner)/payroll/page.tsx
    src/app/(owner)/fuel/page.tsx
    src/app/(owner)/safety/page.tsx
  </files>
  <action>
Read every file before editing. Apply ONLY error handling changes — do not alter any other logic.

**Pattern A — single await returning a list:**
Append `.catch(() => [])` inline on the await expression. Example:
  Before: `const routes = await listRoutes();`
  After:  `const routes = await listRoutes().catch(() => []);`

Apply to:
- routes/page.tsx: `listRoutes()` → `.catch(() => [])`
- trucks/page.tsx: `listTrucks()` → `.catch(() => [])`
- drivers/page.tsx: `listDrivers()` → `.catch(() => [])`
- settings/integrations/page.tsx: `listIntegrations()` → `.catch(() => [])`
- crm/page.tsx: `prisma.customer.findMany(...)` — wrap in try/catch, return `[]` in catch (prisma call cannot use `.catch` chaining directly without losing type)
- invoices/page.tsx: `prisma.invoice.findMany(...)` — wrap in try/catch, return `[]` in catch
- loads/page.tsx: `prisma.load.findMany(...)` — wrap in try/catch, return `[]` in catch
- loads/new/page.tsx: `prisma.customer.findMany(...)` — wrap in try/catch, return `[]` in catch
- payroll/page.tsx: `prisma.payrollRecord.findMany(...)` — wrap in try/catch, return `[]` in catch

**Pattern B — Promise.all with multiple items:**
Add `.catch(() => fallback)` on EACH item inside the Promise.all array (not on the whole Promise.all). This ensures one item's failure does not cancel all others. Example:
  Before: `const [tags, summary] = await Promise.all([listTags(), getSummary()]);`
  After:  `const [tags, summary] = await Promise.all([listTags().catch(() => []), getSummary().catch(() => defaultSummary)]);`

Apply to:
- tags/page.tsx: `listTagsWithAssignments()`, `listTrucks()`, `listDrivers()` — all get `.catch(() => [])`
- fuel/page.tsx: `listTags()`, `getFleetFuelSummary(...)`, `getFuelEfficiencyTrend(...)`, `getCO2Emissions(...)`, `getIdleTimeAnalysis(...)`, `getFuelEfficiencyRankings(...)` — all get `.catch(() => null)` EXCEPT `listTags()` which gets `.catch(() => [])`. For the null-fallback items: the existing render code already receives typed data from the actions so use the same null-safe approach — but note fuel/page.tsx passes these values directly to child components. Check what each action returns and use the appropriate empty fallback: `getFleetFuelSummary` → null (child handles null gracefully if passed), but to avoid a breaking prop type error, match the return type. Simplest safe approach: wrap the entire Promise.all in a try/catch that initializes all to empty/null defaults, rather than per-item .catch. Use whichever approach compiles cleanly with the existing prop types.
- safety/page.tsx: same approach as fuel — wrap entire Promise.all in try/catch OR use per-item .catch with appropriate fallbacks matching component prop types. Safest: try/catch the whole block, initialize defaults above it.

For fuel and safety, use this safe try/catch wrapper pattern that avoids prop type issues:

```ts
// example for fuel
let tags: Awaited<ReturnType<typeof listTags>> = [];
let summary = /* zero-value matching return type */ null as Awaited<ReturnType<typeof getFleetFuelSummary>> | null;
// ... declare all vars with null/[] defaults

try {
  [tags, summary, trend, emissions, idleTime, rankings] = await Promise.all([...]);
} catch {
  // use defaults declared above
}
```

Actually the simplest approach that won't break prop types: add `.catch(() => fallback)` only to `listTags()` (since it returns an array and `[]` is safe). For the action calls that return custom types, wrap the whole Promise.all in try/catch and fall through to zero-value defaults. Read the component imports to understand what type each child prop expects before choosing the fallback.

IMPORTANT: Do not change any logic, routing, or UI. Only add error handling wrappers.
  </action>
  <verify>
    Run: `npx tsc --noEmit 2>&1 | head -40`
    Expect: zero TypeScript errors related to the modified files (null | undefined type mismatches would indicate wrong fallback type).
  </verify>
  <done>
    All list pages render an empty list instead of crashing when a DB call fails. tsc passes.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add try/catch for primary-entity fetches (notFound on null/error)</name>
  <files>
    src/app/(owner)/trucks/[id]/edit/page.tsx
    src/app/(owner)/trucks/[id]/maintenance/page.tsx
    src/app/(owner)/invoices/[id]/page.tsx
    src/app/(owner)/invoices/[id]/edit/page.tsx
    src/app/(owner)/loads/[id]/page.tsx
    src/app/(owner)/loads/[id]/edit/page.tsx
    src/app/(owner)/payroll/[id]/page.tsx
    src/app/(owner)/payroll/[id]/edit/page.tsx
    src/app/(owner)/crm/[id]/page.tsx
    src/app/(owner)/crm/[id]/edit/page.tsx
    src/app/(owner)/drivers/[id]/page.tsx
    src/app/(owner)/compliance/page.tsx
    src/app/(owner)/ifta/page.tsx
    src/app/(owner)/lane-analytics/page.tsx
  </files>
  <action>
Read every file before editing. Apply ONLY error handling changes.

**Pattern — primary entity fetch: wrap in try/catch, call notFound() on null or exception:**

For pages with a single primary entity fetch (findUnique / getTruck / getRoute / etc.):

```ts
// Before:
const record = await prisma.payrollRecord.findUnique({ where: { id }, include: { ... } });
if (!record) { notFound(); }

// After:
let record;
try {
  record = await prisma.payrollRecord.findUnique({ where: { id }, include: { ... } });
} catch {
  notFound();
}
if (!record) { notFound(); }
```

Apply this to:
- trucks/[id]/edit/page.tsx: `getTruck(id)` — wrap in try/catch, notFound() in catch; existing `if (!truck) notFound()` stays
- trucks/[id]/maintenance/page.tsx: `getTruck(id)` primary fetch — wrap in try/catch, notFound() in catch; for the Promise.all([listMaintenanceEvents, listScheduledServices]) add `.catch(() => [])` on each item
- invoices/[id]/page.tsx: primary `prisma.invoice.findUnique(...)` — try/catch → notFound()
- invoices/[id]/edit/page.tsx: primary invoice fetch — try/catch → notFound()
- loads/[id]/page.tsx: primary `prisma.load.findUnique(...)` — try/catch → notFound(); the conditional PENDING Promise.all for drivers/trucks wraps each item with `.catch(() => [])`
- loads/[id]/edit/page.tsx: `Promise.all([prisma.load.findUnique(...), prisma.customer.findMany(...)])` — wrap entire Promise.all in try/catch → notFound() in catch. Existing `if (!load) notFound()` stays outside try.
- payroll/[id]/page.tsx: primary `prisma.payrollRecord.findUnique(...)` — try/catch → notFound(); ALSO add null guard on driver name: change `record.driver.firstName` and `record.driver.lastName` to `record.driver.firstName ?? ''` and `record.driver.lastName ?? ''` in the h1 render (two occurrences in the JSX: the title line `{record.driver.firstName} {record.driver.lastName}` becomes `{record.driver.firstName ?? ''} {record.driver.lastName ?? ''}`)
- payroll/[id]/edit/page.tsx: primary record fetch — try/catch → notFound()
- crm/[id]/page.tsx: primary `prisma.customer.findUnique(...)` — try/catch → notFound()
- crm/[id]/edit/page.tsx: primary customer fetch — try/catch → notFound()
- drivers/[id]/page.tsx: `listDriverDocuments(id)` is a secondary list — add `.catch(() => [])` (primary driver entity fetch already has handling or uses a server action; check file first)
- compliance/page.tsx: `getComplianceDashboard()` — wrap in try/catch. On catch: notFound() is too destructive for a dashboard; instead initialize `data` to a zero-value default matching ComplianceDashboard type. Inspect what ComplianceDashboard returns from the action and create a matching empty default: `{ summary: { ok: 0, expiringSoon: 0, expired: 0, total: 0 }, alerts: [], drivers: [], trucks: [] }` (adjust field names to match the actual return type after reading the file)
- ifta/page.tsx: wrap `getIFTAReport(quarter, year)` in try/catch. On catch: initialize `reportData` to `{ rows: [], totals: { miles: 0, gallons: 0, mpg: 0 } }` (inspect actual totals shape from the file). Also wrap `generateIFTACSV(...)` in try/catch returning `''` on failure.
- lane-analytics/page.tsx: wrap `getLaneAnalytics(safeDays)` in try/catch. On catch: initialize `data` to `{ lanes: [], summary: { totalLanes: 0, totalLoads: 0, totalRevenue: 0, totalProfit: 0, avgMargin: 0 } }` (inspect actual shape from the file before writing fallback).

For compliance, ifta, and lane-analytics: read the action files to understand the return type shape before writing the fallback object, so props remain type-compatible. Adjust the zero-value fallback fields to match exactly.

IMPORTANT: Do not change any logic, routing, display, or business rules. Only add error handling.
  </action>
  <verify>
    Run: `npx tsc --noEmit 2>&1 | head -40`
    Expect: zero TypeScript errors.
    Also verify: `grep -r "driver\.firstName}" src/app/\(owner\)/payroll/` shows `?? ''` guards are present.
  </verify>
  <done>
    Primary entity page crashes on DB failure now show 404. payroll detail handles null driver names. tsc passes.
  </done>
</task>

<task type="auto">
  <name>Task 3: requireRole on live-map, remove 'use client' from trucks/new and drivers/invite, final tsc check</name>
  <files>
    src/app/(owner)/live-map/page.tsx
    src/app/(owner)/trucks/new/page.tsx
    src/app/(owner)/drivers/invite/page.tsx
  </files>
  <action>
Read all three files before editing.

**live-map/page.tsx — add requireRole and error handling:**
1. Add import at top: `import { requireRole } from '@/lib/auth/server';` and `import { UserRole } from '@/lib/auth/roles';` (check if already imported — if so, skip duplicate import)
2. As the FIRST line inside `LiveMapPage()`, before the `searchParams` await, add: `await requireRole([UserRole.OWNER, UserRole.MANAGER]);`
3. Add `.catch(() => [])` to `listTags()` inside the Promise.all
4. Add `.catch(() => [])` to `getLatestVehicleLocations(tagId)` inside the Promise.all
Result:
```ts
const [tags, vehicles] = await Promise.all([
  listTags().catch(() => []),
  getLatestVehicleLocations(tagId).catch(() => []),
]);
```

**trucks/new/page.tsx — remove 'use client':**
The file currently starts with `'use client';`. Remove that line entirely. The page component itself has no client-side hooks — it only renders JSX and passes a server action to `TruckForm`. The `TruckForm` component is a client component in its own file. Removing `'use client'` makes this a server component (correct for a page.tsx).

**drivers/invite/page.tsx — remove 'use client':**
Same as above — remove the `'use client';` directive from line 1. The page only renders markup and passes `inviteDriver` server action to `DriverForm`. No hooks or browser APIs are used in this file.

After all three edits, run tsc to confirm no regressions.
  </action>
  <verify>
    1. `grep -n "use client" src/app/\(owner\)/trucks/new/page.tsx` — should return no output
    2. `grep -n "use client" src/app/\(owner\)/drivers/invite/page.tsx` — should return no output
    3. `grep -n "requireRole" src/app/\(owner\)/live-map/page.tsx` — should show the call
    4. `npx tsc --noEmit` — exits 0 with zero errors
  </verify>
  <done>
    live-map requires OWNER or MANAGER role. trucks/new and drivers/invite are clean server components. tsc passes with zero errors.
  </done>
</task>

</tasks>

<verification>
After all tasks complete:
- `npx tsc --noEmit` exits with zero errors
- No file has logic changes — only error handling wrappers added
- Two files no longer have 'use client' at the top
- live-map page has requireRole as first statement in the function body
- payroll/[id]/page.tsx has `?? ''` on both driver name fields
</verification>

<success_criteria>
All 31 audit issues resolved: 27 pages have DB error handling (try/catch or .catch()), payroll detail has null-guarded driver names, live-map has requireRole, trucks/new and drivers/invite have no 'use client'. tsc --noEmit exits clean.
</success_criteria>

<output>
After completion, create `.planning/quick/38-fix-all-35-audit-issues-add-catch-error-/38-SUMMARY.md` using the summary template.
Update `.planning/STATE.md` Quick Tasks Completed table with Quick-38 entry.
</output>
