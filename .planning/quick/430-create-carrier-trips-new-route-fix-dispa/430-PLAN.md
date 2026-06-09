---
phase: quick-430
plan: 430
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/carrier/trips/new/page.tsx
  - apps/web/src/app/(owner)/carrier/trips/new/NewTripFormClient.tsx
  - apps/web/src/app/(owner)/carrier/trips/_grid/columns.tsx
autonomous: true
must_haves:
  truths:
    - "Clicking Add New Trip navigates to /carrier/trips/new and renders a working create form (no UUID crash)"
    - "Submitting the new-trip form creates a trip and navigates to its detail page"
    - "The trips list table column header reads TRIP # (not DISPATCH #)"
  artifacts:
    - path: "apps/web/src/app/(owner)/carrier/trips/new/page.tsx"
      provides: "Server Component for /carrier/trips/new — establishes tenant context, loads driver/truck maps, renders form"
      min_lines: 25
    - path: "apps/web/src/app/(owner)/carrier/trips/new/NewTripFormClient.tsx"
      provides: "Client wrapper supplying onSuccess/onCancel navigation to NewDispatchForm"
      min_lines: 15
  key_links:
    - from: "apps/web/src/app/(owner)/carrier/trips/new/page.tsx"
      to: "@/components/carrier/dispatches/NewDispatchForm"
      via: "NewTripFormClient wrapper"
      pattern: "NewDispatchForm|NewTripFormClient"
    - from: "apps/web/src/app/(owner)/carrier/trips/_grid/columns.tsx"
      to: "list table header"
      via: "header string"
      pattern: "header: 'Trip #'"
---

<objective>
Fix the broken "Add New Trip" flow and a stale column label introduced during the Dispatches→Trips UI rename.

The trips grid's `onNew` handler does `router.push('/carrier/trips/new')`, but there is no static `new/` segment under `trips/`. Next.js resolves `new` through `[id]/page.tsx`, which calls `getTrip(orgId, "new")`; Postgres rejects `"new"` as a UUID and the Server Component throws. This plan adds the missing `new/` route. Separately, the list table header still reads "Dispatch #" (`_grid/columns.tsx:26`) and must read "Trip #".

Purpose: Make the primary "create a trip" entry point work, and finish the user-facing rename.
Output: A working `/carrier/trips/new` page (Server Component + client form wrapper) and a one-word header fix.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Reference (read before editing — already surveyed by planner; re-read only if needed)
# Detail page (tenant context + driver/truck loading pattern):
#   apps/web/src/app/(owner)/carrier/trips/[id]/page.tsx
# List page (driver/truck map loading — copy this exact pattern):
#   apps/web/src/app/(owner)/carrier/trips/page.tsx
# Existing form component to REUSE (client; POSTs to /api/v1/carrier/dispatches itself):
@apps/web/src/components/carrier/dispatches/NewDispatchForm.tsx
# Column definitions (header fix target):
@apps/web/src/app/(owner)/carrier/trips/_grid/columns.tsx
</context>

<key_findings>
Planner already surveyed the codebase. Build on these facts — do not re-discover:

1. **The form already exists and is reusable.** `NewDispatchForm` (`@/components/carrier/dispatches/NewDispatchForm`) is a client component with props:
   `{ driverMap: Record<string,string>; truckMap: Record<string,string>; onSuccess: (newId: string) => void; onCancel: () => void; userRole?: string }`.
   It self-handles the POST to `/api/v1/carrier/dispatches`, the readiness check, the override modal, validation, and the success toast. DO NOT rebuild any of this. Just provide `driverMap`, `truckMap`, `userRole`, and `onSuccess`/`onCancel`.

2. **Driver/truck map loading pattern** is in the list page `trips/page.tsx` (lines 13-30): `prisma.carrierDriver.findMany({ where:{orgId,status:'active'}, ... })` → `driverMap[id] = "First Last"`, and `prisma.carrierTruck.findMany` → `truckMap[id] = unitNumber`. Reuse this exact pattern. Note: the list page uses plain `prisma`; the data layer (`getTrip`/`listTrips`) uses `getTenantPrisma()`. For the new page, establish tenant context the way the data layer does (call `getTenantPrisma()` and query through it) per the task constraint, OR mirror the list page's `prisma` reads scoped by `orgId` — both are tenant-scoped by `where:{orgId}`. Use `getTenantPrisma()` to be safe.

3. **The create API** (`/api/v1/carrier/dispatches` POST) and `createTrip()` are unchanged and correct — the form already targets them. No backend changes needed.

4. **Header fix is a one-string change.** `_grid/columns.tsx` line 26: `header: 'Dispatch #'` → `header: 'Trip #'`. The column `id` (`'dispatchNumber'`), `accessorFn`, `row.dispatchNumber`, the `DC-YYYY-NNNNN` value, and the `[DISPATCH_NUMBER=...]` notes tag MUST NOT change — they are internal/data names.
</key_findings>

<tasks>

<task type="auto">
  <name>Task 1: Create /carrier/trips/new Server Component + client form wrapper</name>
  <files>
    apps/web/src/app/(owner)/carrier/trips/new/page.tsx
    apps/web/src/app/(owner)/carrier/trips/new/NewTripFormClient.tsx
  </files>
  <action>
Create the missing static `new/` segment so `router.push('/carrier/trips/new')` no longer falls through to `[id]/page.tsx` and crashes on `getTrip(orgId, "new")`.

**page.tsx (Server Component):**
- `import { redirect } from 'next/navigation'`, `import { getSession } from '@/lib/auth/supabase'`, `import { getTenantPrisma } from '@/lib/context/tenant-context'`.
- `const session = await getSession(); if (!session) redirect('/login');`
- `const orgId = session.tenantId; if (!orgId) redirect('/login');`
- Establish tenant context: `const tenantPrisma = await getTenantPrisma();` BEFORE any query.
- Load driver/truck maps using the SAME shape as `trips/page.tsx` lines 13-30, but through `tenantPrisma`:
  - `tenantPrisma.carrierDriver.findMany({ where: { orgId, status: 'active' }, select: { id:true, firstName:true, lastName:true }, orderBy: { lastName: 'asc' } })` → build `driverMap[d.id] = \`${d.firstName} ${d.lastName}\``.
  - `tenantPrisma.carrierTruck.findMany({ where: { orgId, status: 'active' }, select: { id:true, unitNumber:true }, orderBy: { unitNumber: 'asc' } })` → build `truckMap[t.id] = t.unitNumber`.
- Render a header block consistent with the list/detail pages: an `ArrowLeft` "Back to Trips" `Link href="/carrier/trips"` (copy the back-link markup from `[id]/page.tsx` lines 258-266), an `<h1>New Trip</h1>` title, and below it render `<NewTripFormClient driverMap={driverMap} truckMap={truckMap} userRole={session.role} />`.
- Wrap the form in a reasonable max-width container (e.g. `max-w-2xl`) so it isn't full-bleed.

**NewTripFormClient.tsx (Client Component):**
- `'use client';`
- `import { useRouter } from 'next/navigation';`
- `import { NewDispatchForm } from '@/components/carrier/dispatches/NewDispatchForm';`
- Props: `{ driverMap: Record<string,string>; truckMap: Record<string,string>; userRole?: string }`.
- `const router = useRouter();`
- Render `<NewDispatchForm driverMap={driverMap} truckMap={truckMap} userRole={userRole} onSuccess={(newId) => router.push(\`/carrier/trips/${newId}\`)} onCancel={() => router.push('/carrier/trips')} />`.
- The form already fires its own success toast and POSTs to `/api/v1/carrier/dispatches` — do NOT duplicate that logic here.

Do NOT modify the data layer, the API route, `[id]/page.tsx`, the list page, or `NewDispatchForm` itself.

Error boundary: a parent `error.tsx` is not required if rendering succeeds — the original crash came from `getTrip("new")` in `[id]`, which this static segment now shadows. Only add `new/error.tsx` if you discover during verification that an unhandled render error surfaces; otherwise skip it.
  </action>
  <verify>
Run `cd apps/web; npx tsc --noEmit` and confirm no NEW errors in the two created files (baseline has ~35 pre-existing unrelated errors). Then start the dev server (or rely on type-check) and confirm `/carrier/trips/new` resolves to the new Server Component rather than `[id]` — i.e. `getTrip` is NOT called with `"new"`. Grep confirms the route file exists: `apps/web/src/app/(owner)/carrier/trips/new/page.tsx`.
  </verify>
  <done>
Navigating to /carrier/trips/new renders the New Trip page with a populated driver and truck dropdown (no UUID/Postgres crash). Submitting the form creates a trip and routes to /carrier/trips/{newId}; Cancel routes back to /carrier/trips.
  </done>
</task>

<task type="auto">
  <name>Task 2: Rename list table header "Dispatch #" → "Trip #"</name>
  <files>apps/web/src/app/(owner)/carrier/trips/_grid/columns.tsx</files>
  <action>
On line 26 of `_grid/columns.tsx`, change `header: 'Dispatch #'` to `header: 'Trip #'`.

CHANGE ONLY the display header string. DO NOT touch:
- the column `id: 'dispatchNumber'` (line 24),
- the `accessorFn` / `row.dispatchNumber` / `extractDispatchNumber` references,
- the `[DISPATCH_NUMBER=...]` regex or `DC-YYYY-NNNNN` value rendering (line 34).
These are internal/data identifiers, not user-facing labels.
  </action>
  <verify>
Grep `apps/web/src/app/(owner)/carrier/trips/_grid/columns.tsx` for `header: 'Trip #'` → exactly one match. Grep the same file for `header: 'Dispatch #'` → zero matches. Confirm `id: 'dispatchNumber'` and the `accessorFn` still reference `dispatchNumber` unchanged.
  </verify>
  <done>
The trips list table column header reads "Trip #". No underlying field, accessor, column id, or DC-number value changed.
  </done>
</task>

</tasks>

<verification>
- `cd apps/web; npx tsc --noEmit` introduces no new errors in touched files (compare against ~35-error baseline).
- `/carrier/trips/new` renders the New Trip form (driver + truck dropdowns populated) without throwing.
- Creating a trip from the form redirects to `/carrier/trips/{id}`; Cancel returns to `/carrier/trips`.
- The list table header shows "Trip #"; the `DC-YYYY-NNNNN` value still renders in that column.
</verification>

<success_criteria>
- Static `trips/new/` route exists and shadows `[id]` so `getTrip(orgId, "new")` is never called.
- New page is a Server Component that establishes tenant context via `getTenantPrisma()` before loading driver/truck maps.
- Existing `NewDispatchForm` is reused (not rebuilt) via a thin client wrapper that wires `onSuccess`/`onCancel` navigation.
- Column header reads "Trip #" with all internal names (`dispatchNumber`, `[DISPATCH_NUMBER=...]`, `DC-` values) untouched.
- No changes to data layer, API routes, tenant-context, permission keys, list page, or detail page.
</success_criteria>

<output>
After completion, create `.planning/quick/430-create-carrier-trips-new-route-fix-dispa/430-SUMMARY.md`
</output>
