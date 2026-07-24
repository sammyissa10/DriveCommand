---
phase: quick-504
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/routes/assignable-drivers.ts
  - apps/web/src/lib/routes/assignable-drivers.test.ts
  - apps/web/src/app/(owner)/routes/new/page.tsx
  - apps/web/src/components/routes/route-form.tsx
  - apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx
  - apps/web/src/app/(owner)/routes/[id]/page.tsx
autonomous: false

must_haves:
  truths:
    - "Every real (non-sample, non-deleted, active) driver on the carrier roster appears in the New Route Primary Driver selector"
    - "Drivers who have not accepted their portal invitation appear but are disabled with the reason 'Invitation pending'"
    - "Drivers whose portal access was revoked appear but are disabled with the reason 'Portal access revoked'"
    - "Only a DRIVER-role User.id can ever be submitted as driverId or coDriverIds (no CarrierDriver ids)"
    - "Sample/demo drivers and soft-deleted carrier drivers never appear in the selector"
    - "The driver already assigned to a route still renders in the selector on the route edit form even if now inactive"
  artifacts:
    - path: "apps/web/src/lib/routes/assignable-drivers.ts"
      provides: "Merged carrier-roster + DRIVER-User source for route driver pickers"
      exports: ["listRouteAssignableDrivers", "routeDriverBlockedLabel", "RouteAssignableDriver"]
    - path: "apps/web/src/lib/routes/assignable-drivers.test.ts"
      provides: "Vitest coverage of the pure blocked-label mapper"
    - path: "apps/web/src/app/(owner)/routes/new/page.tsx"
      provides: "New Route page sourcing the full roster"
  key_links:
    - from: "apps/web/src/app/(owner)/routes/new/page.tsx"
      to: "apps/web/src/lib/routes/assignable-drivers.ts"
      via: "listRouteAssignableDrivers(orgId)"
      pattern: "listRouteAssignableDrivers"
    - from: "apps/web/src/components/routes/route-form.tsx"
      to: "option disabled rendering"
      via: "driver.assignable === false"
      pattern: "disabled=\\{.*assignable"
---

<objective>
Fix TKT-0084 (URGENT): not all drivers appear in the Primary Driver selector on `/routes/new`.

**Root cause (confirmed by reading the code path):**
`apps/web/src/app/(owner)/routes/new/page.tsx:16` sources the picker from
`listDrivers({ activeOnly: true, excludeSamples: true })`
(`apps/web/src/app/(owner)/actions/drivers.ts:236`), which is
`prisma.user.findMany({ take: 100, where: { role: 'DRIVER', isActive: true, isSample: false } })`.

A DRIVER-role `User` row is created **only when a driver accepts their invitation email**
(`apps/web/src/app/api/auth/accept-invitation/route.ts:242`, which also back-links
`carrier_drivers.user_id` at line 267). `CarrierDriver.userId` is nullable.

Therefore any driver the owner added at `/carrier/fleet/drivers/new` who has **not yet
accepted** (or has no email, or had `sendInvite: false`, or had portal access revoked —
`revokeCarrierDriverAccess` sets `User.isActive = false`) has no `User` row and is
**silently absent** from the picker. The owner sees the full roster at
`/carrier/fleet/drivers` and at `/carrier/trips/new` (which reads `carrierDriver` directly —
`apps/web/src/app/(owner)/carrier/trips/new/page.tsx:23`) but a shorter list on `/routes/new`.
That mismatch is exactly the reported symptom.

**Why we cannot just repoint the picker at `CarrierDriver`:** `Route.driverId` is a NOT NULL
FK to `User.id` (schema.prisma:500/523) and `RouteDriver.driverId` likewise (schema.prisma:552/563).
Wiring the picker to `CarrierDriver` ids is precisely the TKT-0074 regression fixed in
quick-477 (routes silently failed to save). Do NOT repeat it.

**Fix shape (mirrors the quick-503 "show it, but explain the block" pattern):** list the full
carrier roster, but render un-linked drivers as **disabled** options carrying the reason, so
the value submitted is always a real `User.id`.

Purpose: owner can see and correctly reason about every driver on their roster when creating a route.
Output: a shared assignable-driver source + updated desktop/mobile route driver pickers.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/src/app/(owner)/routes/new/page.tsx
@apps/web/src/app/(owner)/actions/drivers.ts
@apps/web/src/components/routes/route-form.tsx
@apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx
@apps/web/src/app/(owner)/carrier/trips/new/page.tsx
@apps/web/src/lib/dispatch/driver-readiness-label.ts

Guardrails that must not regress:
- quick-477: route driver ids are DRIVER-role `User.id`, never `CarrierDriver.id`.
- quick-478/479: `isSample` records and deactivated drivers stay out of assignment
  selectors, but a record already assigned to the entity being edited must still render.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add listRouteAssignableDrivers + pure blocked-label helper (with Vitest)</name>
  <files>
    apps/web/src/lib/routes/assignable-drivers.ts
    apps/web/src/lib/routes/assignable-drivers.test.ts
  </files>
  <action>
Create `apps/web/src/lib/routes/assignable-drivers.ts`.

Export the type:
```ts
export interface RouteAssignableDriver {
  /** DRIVER-role User.id — the ONLY value that may be submitted as Route.driverId. */
  id: string | null;
  carrierDriverId: string | null;
  firstName: string | null;
  lastName: string | null;
  assignable: boolean;
  blockedReason: 'INVITE_PENDING' | 'ACCESS_REVOKED' | null;
}
```

Export a **pure** mapper (no imports, testable — mirror `apps/web/src/lib/dispatch/driver-readiness-label.ts`):
```ts
export function routeDriverBlockedLabel(
  reason: RouteAssignableDriver['blockedReason']
): string | null
```
- `'INVITE_PENDING'` -> `'Invitation pending'`
- `'ACCESS_REVOKED'` -> `'Portal access revoked'`
- `null` -> `null`

Export the data source:
```ts
export async function listRouteAssignableDrivers(
  orgId: string,
  opts?: { includeUserIds?: string[] }
): Promise<RouteAssignableDriver[]>
```
Implementation:
1. `const tenantPrisma = await getTenantPrisma()` from `@/lib/context/tenant-context` (same
   pattern as `apps/web/src/app/(owner)/carrier/trips/new/page.tsx`).
2. Query the carrier roster:
   ```ts
   tenantPrisma.carrierDriver.findMany({
     where: { orgId, status: 'active', isSample: false, deletedAt: null },
     select: {
       id: true, firstName: true, lastName: true, userId: true,
       user: { select: { id: true, role: true, isActive: true, isSample: true } },
     },
     orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
   })
   ```
3. Query DRIVER-role Users that have **no** carrier record, so legacy drivers invited via
   `/drivers/invite` are not lost (this must be additive — the list may never shrink versus
   today's behavior):
   ```ts
   tenantPrisma.user.findMany({
     where: { role: 'DRIVER', isSample: false, carrierDriver: { is: null } },
     select: { id: true, firstName: true, lastName: true, isActive: true },
     orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
   })
   ```
   Check the relation field name on `User` for `CarrierDriver` in `apps/web/prisma/schema.prisma`
   (relation name `CarrierDriverUser`, ~line 2082) and use the actual field name; if the back-relation
   is not queryable as `is: null`, fall back to fetching all DRIVER users and filtering out ids
   already present in the roster result in JS. Do NOT add a `take` cap; if you want a safety
   bound use `take: 500`, not 100.
4. Merge into `RouteAssignableDriver[]`, de-duped by `user.id`:
   - `assignable = Boolean(user) && user.role === 'DRIVER' && user.isActive && !user.isSample`
   - `blockedReason`: no linked user -> `'INVITE_PENDING'`; linked user but `!isActive` -> `'ACCESS_REVOKED'`; else `null`
   - `id = user?.id ?? null` (null for INVITE_PENDING — deliberately unselectable)
5. `opts.includeUserIds`: for each id not already in the merged list, fetch that `User`
   (`role: 'DRIVER'`) and append it with `assignable: true`. This preserves the currently
   assigned driver on edit forms (quick-479), including deactivated ones.
6. Sort assignable-first, then by last name, then first name.

Do NOT modify `listDrivers()` in `apps/web/src/app/(owner)/actions/drivers.ts` — `/drivers`
and `/tags` still depend on its current behavior.

Create `apps/web/src/lib/routes/assignable-drivers.test.ts` (Vitest, colocated, same style as
`apps/web/src/lib/dispatch/driver-readiness-label.test.ts`) covering all three
`routeDriverBlockedLabel` branches.
  </action>
  <verify>
`npx vitest run apps/web/src/lib/routes/assignable-drivers.test.ts` passes.
`npx tsc --noEmit` from `apps/web` shows no NEW errors (baseline is ~35 pre-existing).
  </verify>
  <done>`listRouteAssignableDrivers` and `routeDriverBlockedLabel` exist and are typed; the pure helper's tests pass.</done>
</task>

<task type="auto">
  <name>Task 2: Wire the New Route + route edit driver pickers to the full roster</name>
  <files>
    apps/web/src/app/(owner)/routes/new/page.tsx
    apps/web/src/components/routes/route-form.tsx
    apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx
    apps/web/src/app/(owner)/routes/[id]/page.tsx
  </files>
  <action>
**`apps/web/src/app/(owner)/routes/new/page.tsx`** — replace the `listDrivers({ activeOnly: true,
excludeSamples: true })` branch (lines 12-25) with `listRouteAssignableDrivers(orgId)`, keeping the
existing `.catch(...)` + `logger.error` fallback to `[]`. Update the leading comment to record the
TKT-0084 root cause: the picker must show the full carrier roster, but only rows with a linked
DRIVER-role `User.id` are selectable, because `Route.driverId` FKs to `User.id` (quick-477).
Remove the now-redundant `.filter((d) => !d.isSample)` (the query already excludes samples).

**`apps/web/src/components/routes/route-form.tsx`** (desktop; also used by the route edit
section) — widen the `drivers` prop at line 46 to:
```ts
drivers: Array<{
  id: string | null;
  firstName: string | null;
  lastName: string | null;
  assignable?: boolean;
  blockedReason?: 'INVITE_PENDING' | 'ACCESS_REVOKED' | null;
}>;
```
Keep the new fields OPTIONAL so `edit-route-client.tsx` / `route-edit-section.tsx` keep compiling;
treat `assignable === undefined` as `true`.

In the Primary Driver `<select>` (lines ~472-500):
- Render every driver. For a blocked driver emit
  `<option key={d.carrierDriverId ?? d.id} value="" disabled>` with the label
  `` `${first} ${last} — ${routeDriverBlockedLabel(d.blockedReason)}` `` .
- Keep the `disabled` attribute on the `<select>` only when the list is empty.
- Below the select, when `drivers.some(d => d.assignable === false)`, render a muted helper line:
  "Drivers with a pending invitation can't be assigned until they accept their portal invite."
  with a link to `/carrier/fleet/drivers` (reuse the existing `<Link>` styling from lines 491-497).

In the Co-Drivers checkbox list (lines ~536-544) filter to `d.assignable !== false && d.id` —
`RouteDriver.driverId` is also a `User` FK, so blocked drivers must not be checkable at all.

**`apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx`** — apply the identical treatment to
its `Driver` interface (line 27), the Primary Driver select (lines ~420-450) and the co-driver
list (lines ~483-489), using the mobile design-system classes already in that file (`dsLabelClass`,
`text-ds-txt3`, etc.). Do not introduce new class patterns.

**`apps/web/src/app/(owner)/routes/[id]/page.tsx`** — replace the `listDrivers({ activeOnly: true,
excludeSamples: true })` call at line 76 with
`listRouteAssignableDrivers(orgId, { includeUserIds: [route.driverId, ...coDriverIds] })`
so the currently-assigned primary and co-drivers always render on the edit form even if now
deactivated (quick-479). Source the co-driver ids from the data already loaded on that page; if
they are not available at that point, pass just `[route.driverId]`.
  </action>
  <verify>
`npx tsc --noEmit` from `apps/web` — no NEW errors versus the ~35-error baseline.
`grep -rn "listDrivers(" apps/web/src/app/\(owner\)/routes` returns nothing.
Run the dev server, open `/routes/new` on desktop: the Primary Driver dropdown lists the same
number of names as `/carrier/fleet/drivers` (active, non-sample), with un-invited ones greyed out
and suffixed "— Invitation pending". Create a route with an assignable driver and confirm it saves
(guards against the quick-477 FK regression).
  </verify>
  <done>
Every active non-sample roster driver is visible on `/routes/new` (desktop and mobile); blocked
drivers are disabled with a reason; only real `User.id` values can be submitted; route creation
still succeeds.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
Full carrier driver roster now renders in the `/routes/new` Primary Driver selector. Drivers who
have not accepted their portal invitation (or whose access was revoked) appear greyed out with the
reason instead of being silently omitted — which was the TKT-0084 bug. Route.driverId still only
ever receives a DRIVER-role User.id, preserving the quick-477 fix.
  </what-built>
  <how-to-verify>
1. Open `/carrier/fleet/drivers` and note the count of active, non-sample drivers.
2. Open `/routes/new` on desktop. The Primary Driver dropdown must list that same set of names.
3. Confirm any driver who has not accepted their invite shows greyed out with "— Invitation pending"
   and cannot be selected.
4. Select a real driver, fill the required fields, and submit. The route must save (no silent failure).
5. Resize to phone width (or open on mobile) and confirm the same list and greyed-out states.
6. Open an existing route -> Edit Route. The already-assigned driver must still be shown and selected.

If any expected driver is STILL missing, run this SQL against Supabase project `oqdhberkghtnszrkdvfm`
(replace `:orgId`) and report the output — it distinguishes a roster/link gap from a query bug:
```sql
select cd.id as carrier_driver_id, cd.first_name, cd.last_name, cd.email,
       cd.status, cd.is_sample, cd.deleted_at, cd.user_id,
       u.role, u."isActive", u."isSample"
from carrier_drivers cd
left join "User" u on u.id = cd.user_id
where cd.org_id = :orgId
order by cd.last_name;
```
  </how-to-verify>
  <resume-signal>Type "approved" or describe which drivers are still missing (paste the SQL output).</resume-signal>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` from `apps/web`: no new errors versus baseline.
- `npx vitest run apps/web/src/lib/routes/assignable-drivers.test.ts`: passes.
- No `CarrierDriver.id` is ever placed in a `driverId` / `coDriverIds` form value (quick-477).
- No `isSample: true` record and no soft-deleted carrier driver appears in the selector (quick-478).
- The currently assigned driver renders on the route edit form even if deactivated (quick-479).
</verification>

<success_criteria>
- `/routes/new` Primary Driver selector lists every active, non-sample carrier roster driver plus
  any DRIVER-role User with no carrier record.
- Un-linked / revoked drivers render disabled with "Invitation pending" / "Portal access revoked".
- Creating a route with a selectable driver still saves successfully.
- Desktop and mobile views behave identically.
- Human verification approved.
</success_criteria>

<output>
After completion, create `.planning/quick/504-tkt-0084-new-route-driver-selector-missi/504-SUMMARY.md`.
Commit with `fix(quick-504): show full driver roster in New Route selector with blocked-state reasons`.
Do NOT push — the orchestrator handles the single final push.
</output>
</content>
</invoke>
