---
phase: quick-478
plan: 478
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/actions/drivers.ts
  - apps/web/src/app/(owner)/routes/new/page.tsx
  - apps/web/src/app/(owner)/routes/[id]/page.tsx
autonomous: true

must_haves:
  truths:
    - "New Route (create) primary-driver and co-driver pickers list ONLY active drivers (User.isActive = true)"
    - "Route edit page pickers list active drivers PLUS the route's currently-assigned primary driver and existing co-drivers even if now inactive"
    - "Drivers management list still shows deactivated drivers (unchanged)"
    - "Route create/update FormData contract and Route.driverId FK contract unchanged"
  artifacts:
    - path: "apps/web/src/app/(owner)/actions/drivers.ts"
      provides: "listDrivers with optional activeOnly filter, default behavior unchanged"
      contains: "activeOnly"
    - path: "apps/web/src/app/(owner)/routes/new/page.tsx"
      provides: "create page calls listDrivers({ activeOnly: true })"
    - path: "apps/web/src/app/(owner)/routes/[id]/page.tsx"
      provides: "edit page calls listDrivers({ activeOnly: true }) with merge of currently-assigned inactive driver/co-drivers"
  key_links:
    - from: "routes/new/page.tsx"
      to: "listDrivers"
      via: "listDrivers({ activeOnly: true })"
      pattern: "listDrivers\\(\\{ activeOnly: true \\}\\)"
    - from: "routes/[id]/page.tsx"
      to: "listDrivers"
      via: "listDrivers({ activeOnly: true }) + merge missing assigned ids"
      pattern: "listDrivers\\(\\{ activeOnly: true \\}\\)"
---

<objective>
On the owner New Route form, the primary-driver and co-driver pickers must list ONLY active drivers (`User.isActive = true`), not deactivated ones. Co-drivers derive from the same `drivers` source (desktop `route-form.tsx` and mobile `RouteCreateMobile.tsx`), so filtering the source covers both pickers on create and edit.

Pending invitations already don't appear (a `DriverInvitation` is not a `User`), so no change is needed there.

Purpose: A deactivated driver should not be assignable to new/edited routes, but an already-assigned driver (primary or co-driver) that was later deactivated must NOT silently disappear from an existing route's edit form.

Output: `listDrivers` gains an optional `activeOnly` filter (default unchanged); create page filters to active; edit page filters to active but re-merges the route's existing assignments.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@apps/web/src/app/(owner)/actions/drivers.ts
@apps/web/src/app/(owner)/routes/new/page.tsx
@apps/web/src/app/(owner)/routes/[id]/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add activeOnly filter to listDrivers and apply on route create + edit pages (with merge of existing assignments)</name>
  <files>
    apps/web/src/app/(owner)/actions/drivers.ts
    apps/web/src/app/(owner)/routes/new/page.tsx
    apps/web/src/app/(owner)/routes/[id]/page.tsx
  </files>
  <action>
STEP 1 — `apps/web/src/app/(owner)/actions/drivers.ts` (`listDrivers`, ~line 236):
Change the signature to accept an optional param and conditionally add `isActive: true` to the `where` clause. Default (no arg) MUST keep current behavior (no isActive filter) so `drivers/page.tsx` and `tags/page.tsx` are unaffected.

```ts
export async function listDrivers(opts?: { activeOnly?: boolean }) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();
  return prisma.user.findMany({
    take: 100,
    where: {
      role: 'DRIVER',
      ...(opts?.activeOnly ? { isActive: true } : {}),
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}
```
Do NOT change the return shape — same `User[]`.

STEP 2 — `apps/web/src/app/(owner)/routes/new/page.tsx` (~line 16):
Change the single call `listDrivers()` to `listDrivers({ activeOnly: true })`. Leave the `.then(...)` `.filter(d => !d.isSample).map(...)` chain and everything else untouched.

STEP 3 — `apps/web/src/app/(owner)/routes/[id]/page.tsx` (edit page):
FIRST re-read this file to confirm current structure. Key facts already established:
- `listDrivers()` is called at ~line 76 inside the `Promise.all([...])` block; change it to `listDrivers({ activeOnly: true })`.
- `driverAssignments` comes from `listDriverRouteJoinsByRoute(id)` — each join has `driverId` (and `driver.id`); these are the CO-DRIVER user ids.
- `route.driverId` is the PRIMARY driver's User id (may be null).
- `driversForEdit` is built at ~line 167 by mapping `drivers` to `{ id, firstName, lastName, email }` and passed as the `drivers` prop to `RoutePageClient`.

Because the picker source is now filtered to active drivers, an already-assigned PRIMARY driver or CO-DRIVER that was later deactivated would be missing from `drivers`, silently dropping the selection. Prevent this:

After the `Promise.all` completes and BEFORE building `driversForEdit`, compute the set of ids that must be present:
- `route.driverId` (if non-null)
- every co-driver id from `driverAssignments` (use `d.driverId` — fall back to `d.driver?.id`)

Determine which of those ids are NOT already in the fetched `drivers` list. If any are missing, fetch exactly those User records (role DRIVER, by id, current tenant) and merge them into the list used for `driversForEdit`. Example:

```ts
// Preserve already-assigned primary/co-drivers even if now deactivated —
// the active-only picker source would otherwise drop an existing selection.
const assignedIds = new Set<string>();
if (route.driverId) assignedIds.add(route.driverId);
for (const a of driverAssignments as Array<{ driverId?: string | null; driver?: { id?: string | null } }>) {
  const cid = a.driverId ?? a.driver?.id;
  if (cid) assignedIds.add(cid);
}
const presentIds = new Set(drivers.map((d: { id: string }) => d.id));
const missingIds = [...assignedIds].filter((id) => !presentIds.has(id));
let mergedDrivers = drivers;
if (missingIds.length > 0) {
  const extra = await prisma.user
    .findMany({ where: { id: { in: missingIds }, role: 'DRIVER' } })
    .catch((err) => {
      logger.error('Failed to load already-assigned inactive drivers for route edit:', err);
      return [] as typeof drivers;
    });
  mergedDrivers = [...drivers, ...extra];
}
```

Then build `driversForEdit` from `mergedDrivers` instead of `drivers` (keep the same `.map(d => ({ id, firstName, lastName, email }))` shape). `prisma` is already available in scope (line ~34), so reuse it — do not create a new client.

Do NOT touch `apps/web/src/app/(owner)/actions/routes.ts` — it must stay zero-diff (verify with `git diff --stat` in STEP 4).
Do NOT change `drivers/page.tsx` or `tags/page.tsx` — they must remain `listDrivers()` (no args). Note: `drivers/page.tsx` uses `listDrivers().catch(...)` and `tags/page.tsx` uses `listDrivers().catch(() => [])` — leave both exactly as-is.
  </action>
  <verify>
Run in `apps/web`:
1. `cd apps/web && npx tsc --noEmit` — 0 new errors vs baseline (see MEMORY: ~35 pre-existing errors from missing @types; only flag regressions or errors in the 3 touched files).
2. `git diff --stat` — confirm ONLY the 3 files in this plan changed; `apps/web/src/app/(owner)/actions/routes.ts` must NOT appear.
3. `git grep -n "listDrivers()" apps/web/src/app/(owner)/drivers/page.tsx apps/web/src/app/(owner)/tags/page.tsx` — both still call `listDrivers()` with no args.
4. `git grep -n "listDrivers({ activeOnly: true })" apps/web/src/app/(owner)/routes` — matches in both `new/page.tsx` and `[id]/page.tsx`.
  </verify>
  <done>
- `listDrivers(opts?: { activeOnly?: boolean })` filters `isActive: true` only when `activeOnly` is true; no-arg behavior unchanged.
- Route create page and route edit page both call `listDrivers({ activeOnly: true })`.
- Edit page merges the route's assigned primary driver + co-driver ids that are missing from the active list, so existing (now-inactive) assignments are never dropped.
- `drivers/page.tsx` and `tags/page.tsx` unchanged; `routes.ts` zero-diff.
- `tsc --noEmit` clean for touched files (0 new errors).
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` in `apps/web`: no new errors, touched files clean.
- `git diff --stat`: exactly 3 files changed (drivers.ts action, routes/new/page.tsx, routes/[id]/page.tsx). `actions/routes.ts` absent.
- `drivers/page.tsx` + `tags/page.tsx` still call `listDrivers()` (no args) — deactivated drivers still visible in management list.
- Both route pages call `listDrivers({ activeOnly: true })`.
</verification>

<success_criteria>
- Deactivated DRIVER-role users no longer appear in the primary-driver or co-driver pickers on the New Route form (create) — desktop and mobile.
- Editing an existing route whose assigned primary or co-driver was deactivated still shows that driver as the current selection (not silently dropped).
- No change to route create/update FormData contract or `Route.driverId` FK contract.
- Committed atomically. Executor does NOT `git push` and does NOT run `vercel` — the orchestrator handles typecheck gate / push / deploy.
</success_criteria>

<output>
After completion, create `.planning/quick/478-new-route-driver-co-driver-pickers-list-/478-SUMMARY.md`.
</output>
