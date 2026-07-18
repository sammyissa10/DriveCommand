---
phase: quick
plan: 390
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/carrier/clients.ts
  - apps/web/src/lib/carrier/contracts.ts
  - apps/web/src/lib/carrier/facilities.ts
  - apps/web/src/lib/carrier/fleet-trucks.ts
  - apps/web/src/lib/carrier/fleet-drivers.ts
  - apps/web/src/lib/carrier/dispatches.ts
  - apps/web/src/lib/carrier/loads.ts
  - apps/web/src/lib/carrier/stops.ts
autonomous: false
ticket: TKT-0034

must_haves:
  truths:
    - "Newly created carrier entities (truck, driver, dispatch, load, client, contract, facility, stop) persist created_by_id = session userId in the DB."
    - "Newly updated carrier entities persist updated_by_id = session userId in the DB."
    - "Carrier entity detail pages render the actor's first/last name (or email) in the AuditTrailFooter for both the 'Created by' and 'Last updated by' lines after a fresh create/update."
    - "Read paths (findFirst / findMany / aggregate / count) in all 8 carrier lib files continue to use the bare prisma singleton — behavior unchanged."
    - "Historical rows with created_by_id IS NULL still render 'Unknown' (no backfill)."
  artifacts:
    - path: "apps/web/src/lib/carrier/clients.ts"
      provides: "createClient / updateClient / softDeleteClient call getTenantPrisma() for the write op only; reads use bare prisma."
    - path: "apps/web/src/lib/carrier/contracts.ts"
      provides: "createContract / updateContract / softDeleteContract call getTenantPrisma() for the write op only."
    - path: "apps/web/src/lib/carrier/facilities.ts"
      provides: "createFacility / updateFacility / softDeleteFacility call getTenantPrisma() for the write op only."
    - path: "apps/web/src/lib/carrier/fleet-trucks.ts"
      provides: "createCarrierTruck / updateCarrierTruck call getTenantPrisma() for the write op only."
    - path: "apps/web/src/lib/carrier/fleet-drivers.ts"
      provides: "createCarrierDriver / updateCarrierDriver / linked-user backfill update use getTenantPrisma() for the write op only; DriverInvitation writes also use getTenantPrisma() so the invitation audit columns (if present) are also stamped."
    - path: "apps/web/src/lib/carrier/dispatches.ts"
      provides: "createDispatch / updateDispatch (and their nested CarrierStop / CarrierLoad write calls) use getTenantPrisma() for the write op only. DispatchOverrideAudit is in EXEMPT_AUDIT_MODELS so behavior is unchanged whether bare or tenant client is used."
    - path: "apps/web/src/lib/carrier/loads.ts"
      provides: "createLoad / updateLoad / persistStops use getTenantPrisma() for the write op only. CarrierStop createMany / updateMany inside the persistStops $transaction must use the tenant client passed into the transaction."
    - path: "apps/web/src/lib/carrier/stops.ts"
      provides: "createStop / updateStop call getTenantPrisma() for the write op only."
  key_links:
    - from: "apps/web/src/lib/carrier/*.ts (write functions)"
      to: "getTenantPrisma() in apps/web/src/lib/context/tenant-context.ts"
      via: "await getTenantPrisma() inside each write function, before the .create/.update/.upsert call"
      pattern: "const tenantPrisma = await getTenantPrisma\\(\\)"
    - from: "createTenantClient(tenantId, userId)"
      to: "withAuditColumns(userId) extension"
      via: "extension chain — already wired, no change needed"
      pattern: "createTenantClient.*userId"
    - from: "AuditTrailFooter render"
      to: "DB created_by_id / updated_by_id columns"
      via: "Detail page's separate findUnique selecting createdBy/updatedBy relations"
      pattern: "createdBy.*select.*firstName"
---

<objective>
Fix TKT-0034 root cause: swap bare `prisma` to `getTenantPrisma()` on every WRITE call inside the 8 carrier data-layer files (clients, contracts, facilities, fleet-trucks, fleet-drivers, dispatches, loads, stops). Reads stay on bare `prisma`. The tenant client carries `withAuditColumns(userId)` which auto-stamps `createdById` / `updatedById`, so no payload field threading is needed.

Purpose: After this fix, every new POST/PATCH against the 8 carrier APIs will populate the audit FK columns the migration `20260517150001` already added, and the AuditTrailFooter on detail pages will show real names instead of "Unknown".

Output: 8 modified carrier lib files. No schema changes. No migrations. No UI changes. No API route changes (routes already extract `session` from `getSession()`; the lib functions call `getTenantPrisma()` which reads its own session via the React-cached `getSession()`).

Approach: Option B from the diagnostic (per CONTEXT.md decision) — swap the Prisma instance for write ops; keep reads on bare `prisma` to honor "DO NOT change READ paths" constraint.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/quick/389-tkt-0034-diagnostic-created-by-unknown-l/389-SUMMARY.md
@apps/web/src/lib/context/tenant-context.ts
@apps/web/src/lib/db/tenant-client.ts
@apps/web/src/lib/db/extensions/audit-columns.ts
@apps/web/src/lib/carrier/clients.ts
@apps/web/src/lib/carrier/contracts.ts
@apps/web/src/lib/carrier/facilities.ts
@apps/web/src/lib/carrier/fleet-trucks.ts
@apps/web/src/lib/carrier/fleet-drivers.ts
@apps/web/src/lib/carrier/dispatches.ts
@apps/web/src/lib/carrier/loads.ts
@apps/web/src/lib/carrier/stops.ts
</context>

<implementation_notes>

## The exact swap pattern to apply

Inside every WRITE function, immediately before the first `.create` / `.update` / `.upsert` / `.createMany` / `.updateMany` call:

```typescript
import { getTenantPrisma } from '@/lib/context/tenant-context';
// ...existing imports including `import { prisma } from '@/lib/db/prisma';` STAY

export async function createClient(orgId: string, data: ClientCreateInput) {
  const tenantPrisma = await getTenantPrisma();   // NEW
  // ...existing pre-write logic (uses bare `prisma` for reads — unchanged)
  return tenantPrisma.carrierClient.create({       // CHANGED: prisma -> tenantPrisma
    data: { ...rest, orgId, ... },                 // NO new fields added to data
  });
}
```

**Rules:**

1. Keep `import { prisma } from '@/lib/db/prisma';` — reads still use it.
2. Add `import { getTenantPrisma } from '@/lib/context/tenant-context';` if not present.
3. Inside each exported WRITE function, call `await getTenantPrisma()` once at the top and bind to `tenantPrisma`.
4. Replace ONLY `.create` / `.update` / `.upsert` / `.createMany` / `.updateMany` instances on `prisma.<model>.` with `tenantPrisma.<model>.` inside that function.
5. Do NOT add `createdById` / `updatedById` to any payload — the extension does it.
6. Do NOT change `findFirst` / `findMany` / `findUnique` / `count` / `aggregate` / `delete*` calls — they pass through the extension untouched anyway, but leaving them on bare `prisma` is the surgical option that respects "DO NOT change READ paths".
7. Do NOT modify private helpers that are read-only (`gridFiltersToPrismaWhere`, `decStr`, etc.).
8. Soft-delete functions ARE writes (`prisma.X.update({ data: { status: 'inactive' } })`) — swap them.

## Per-file write inventory (functions to touch)

Based on the grep at planning time. The exec agent MUST re-verify by reading each file before editing — the list below is the planning baseline, not the source of truth.

| File | Exported functions to swap (write ops only) |
|------|----------------------------------------------|
| `clients.ts` | `createClient`, `updateClient`, `softDeleteClient` |
| `contracts.ts` | `createContract` (inside the retry loop), `updateContract`, `softDeleteContract` |
| `facilities.ts` | `createFacility`, `updateFacility`, `softDeleteFacility` |
| `fleet-trucks.ts` | `createCarrierTruck`, `updateCarrierTruck` |
| `fleet-drivers.ts` | `createCarrierDriver` (the main `.create` plus the linked-user backfill `.update` and the DriverInvitation `updateMany`+`create`), `updateCarrierDriver` |
| `dispatches.ts` | `createDispatch` (carrierDispatch.create + dispatchOverrideAudit.create + the template-stops `carrierStop.create` loop), `updateDispatch` (carrierDispatch.update + template-stops re-create loop) |
| `loads.ts` | `createLoad` (carrierLoad.create + the pendingStopsJson `carrierLoad.update`), `updateLoad` (carrierLoad.update + the migrate-stops `carrierStop.updateMany` + the clear-pending `carrierLoad.update`), `persistStops` (its $transaction must use the tenant client too) |
| `stops.ts` | `createStop`, `updateStop` |

## $transaction handling (loads.ts persistStops)

`persistStops` runs writes inside `prisma.$transaction(async (tx) => { ... })`. The `tx` parameter inside that callback IS the transaction client of whichever Prisma instance `$transaction` was called on. So:

- Replace `prisma.$transaction(async (tx) => {...})` with `tenantPrisma.$transaction(async (tx) => {...})`.
- Inside the transaction callback, all `tx.carrierStop.create` / `tx.carrierStop.updateMany` / `tx.carrierStop.deleteMany` calls AUTOMATICALLY get the audit-column injection because `tx` inherits the extension chain.

## Other write paths that are intentionally OUT OF SCOPE

These touch carrier-adjacent models but are explicitly excluded by CONTEXT.md / scope:

- `dispatch-generator.ts` — cron-driven dispatch generation; not a user write (no session).
- `stop-completion.ts` — driver-side stop status flips; separate ticket scope.
- `expenses.ts`, `documents.ts`, `document-types.ts`, `route-templates.ts`, `compliance.ts`, `pay-calculator.ts`, `revenue-calculator.ts`, `in-app-notifications.ts`, `notifications.ts` — not in the 8-entity scope.
- API route files themselves — no changes; they already use `getSession()` for auth, and the lib functions now self-source the userId via `getTenantPrisma()`.

</implementation_notes>

<tasks>

<task type="auto">
  <name>Task 1: Swap WRITE ops to getTenantPrisma() in clients, contracts, facilities, fleet-trucks, stops</name>
  <files>
    apps/web/src/lib/carrier/clients.ts
    apps/web/src/lib/carrier/contracts.ts
    apps/web/src/lib/carrier/facilities.ts
    apps/web/src/lib/carrier/fleet-trucks.ts
    apps/web/src/lib/carrier/stops.ts
  </files>
  <action>
    For each of the 5 files above, apply the swap pattern documented in `<implementation_notes>`:

    1. Add `import { getTenantPrisma } from '@/lib/context/tenant-context';` near the existing `import { prisma } from '@/lib/db/prisma';` line. KEEP the bare `prisma` import — reads still use it.

    2. Inside EVERY exported write function, add `const tenantPrisma = await getTenantPrisma();` at the top (right after input destructuring, before the first DB call). Specifically:
       - `clients.ts`: createClient, updateClient, softDeleteClient
       - `contracts.ts`: createContract, updateContract, softDeleteContract
       - `facilities.ts`: createFacility, updateFacility, softDeleteFacility
       - `fleet-trucks.ts`: createCarrierTruck, updateCarrierTruck
       - `stops.ts`: createStop, updateStop

    3. Within each of those functions, replace ONLY the WRITE Prisma calls — `.create` / `.update` / `.upsert` / `.createMany` / `.updateMany` — by changing the receiver from `prisma` to `tenantPrisma`. Example: `prisma.carrierClient.create(...)` becomes `tenantPrisma.carrierClient.create(...)`.

    4. Do NOT touch any `findFirst` / `findMany` / `findUnique` / `count` / `aggregate` calls — they stay on bare `prisma`.

    5. Do NOT add `createdById` or `updatedById` fields to any `data:` payload. The `withAuditColumns` extension stamps them automatically. Adding them manually would be redundant and wrong if the caller has a stale session.

    6. For `contracts.ts.createContract`, the write lives inside a 5-attempt retry loop — swap the `prisma.carrierContract.create` call inside the `try` block. The `prisma.carrierContract.findFirst` inside the same loop stays on bare `prisma`.

    7. For `facilities.ts.softDeleteFacility`, the function does `prisma.carrierFacility.update({ data: { facilityType: newType } })` — swap that. The findFirst stays.

    8. For `stops.ts.createStop`, the read of `carrierFacility` for address-snapshot stays on bare `prisma`; only swap the `prisma.carrierStop.create` call near the end.

    Reference existing code:
    - `apps/web/src/lib/context/tenant-context.ts` lines 38-42 — getTenantPrisma() signature returns Promise<PrismaClient>.
    - `apps/web/src/lib/db/extensions/audit-columns.ts` — read once to internalize that the extension self-skips when userId is null and self-skips on EXEMPT_AUDIT_MODELS, so swapping for non-target models is always safe.
    - `.planning/quick/389-tkt-0034-diagnostic-created-by-unknown-l/389-SUMMARY.md` — full diagnostic.

    DO NOT run `vercel --prod`, `git push`, or any deploy command. User deploys manually.
  </action>
  <verify>
    From repo root, run these in PowerShell:

    1. TypeScript check — must pass with zero errors related to the changed files:
       `cd apps/web; npx tsc --noEmit`

    2. Confirm the new import was added in all 5 files:
       `git diff apps/web/src/lib/carrier/clients.ts apps/web/src/lib/carrier/contracts.ts apps/web/src/lib/carrier/facilities.ts apps/web/src/lib/carrier/fleet-trucks.ts apps/web/src/lib/carrier/stops.ts | findstr "getTenantPrisma"`
       Expect at least 10 matches (5 new imports + 5+ usages).

    3. Confirm bare `prisma` is still used for at least one read in each file:
       `git diff apps/web/src/lib/carrier/clients.ts | findstr "prisma.carrierClient.find"`
       Expect NO diff lines on findFirst/findMany/count/aggregate — they should be unchanged.
  </verify>
  <done>
    All 5 files (clients, contracts, facilities, fleet-trucks, stops) have:
    - `getTenantPrisma` imported
    - `const tenantPrisma = await getTenantPrisma()` in every exported write function
    - Every `.create`/`.update`/`.upsert`/`.createMany`/`.updateMany` inside those functions calls through `tenantPrisma` not `prisma`
    - Every `.findFirst`/`.findMany`/`.findUnique`/`.count`/`.aggregate` still calls through bare `prisma`
    - No new fields added to `data:` payloads (no manual `createdById:` / `updatedById:` insertion)
    - `npx tsc --noEmit` from `apps/web` passes
  </done>
</task>

<task type="auto">
  <name>Task 2: Swap WRITE ops to getTenantPrisma() in fleet-drivers, dispatches, loads (including $transaction)</name>
  <files>
    apps/web/src/lib/carrier/fleet-drivers.ts
    apps/web/src/lib/carrier/dispatches.ts
    apps/web/src/lib/carrier/loads.ts
  </files>
  <action>
    Apply the same swap pattern as Task 1, but to the 3 more complex files. These have multiple write call-sites per function and (in loads.ts) a `$transaction` block that must also be re-targeted.

    **fleet-drivers.ts:**
    1. Add `import { getTenantPrisma } from '@/lib/context/tenant-context';`.
    2. In `createCarrierDriver`:
       - Add `const tenantPrisma = await getTenantPrisma();` at the top of the function.
       - Swap `prisma.carrierDriver.create({ data: ... })` → `tenantPrisma.carrierDriver.create(...)`.
       - Swap the linked-user backfill `prisma.carrierDriver.update({ where: { id: driver.id }, data: { userId: existingUser.id } })` → `tenantPrisma.carrierDriver.update(...)`.
       - Swap the DriverInvitation block: `prisma.driverInvitation.updateMany({ ..., status: 'CANCELLED' })` and `prisma.driverInvitation.create({ data: ... })` → both use `tenantPrisma`.
       - Leave `prisma.carrierDriver.findFirst` (existing-user check), `prisma.carrierFacility.findFirst` (homeTerminal check), `prisma.user.findFirst` (linked-user lookup), `prisma.tenant.findUnique` (tenant name fetch) on bare `prisma`.
    3. In any other exported write functions in this file (resend-invitation create, `updateCarrierDriver` at line ~516, etc.):
       - Add `const tenantPrisma = await getTenantPrisma();` at the top.
       - Swap their write ops (`prisma.driverInvitation.updateMany`+`prisma.driverInvitation.create` in the resend flow; `prisma.carrierDriver.update` in updateCarrierDriver).

    **dispatches.ts:**
    1. Add the import.
    2. In `createDispatch`:
       - Add `const tenantPrisma = await getTenantPrisma();` at the top.
       - Swap `prisma.carrierDispatch.create(...)` → `tenantPrisma.carrierDispatch.create(...)`.
       - Swap `prisma.dispatchOverrideAudit.create({ ... })` → `tenantPrisma.dispatchOverrideAudit.create(...)`. Note: DispatchOverrideAudit is in `EXEMPT_AUDIT_MODELS` so the extension will pass-through — this is a no-op for audit injection but keeps the call routed consistently and ensures RLS coverage. Either way is functionally equivalent; using tenantPrisma is fine.
       - Swap the template-stops loop `await prisma.carrierStop.create({ ... })` → `await tenantPrisma.carrierStop.create(...)`.
       - Leave the template lookup `prisma.routeTemplate.findFirst` and `prisma.routeTemplateStop.findMany` on bare `prisma`.
    3. In `updateDispatch`:
       - Add `const tenantPrisma = await getTenantPrisma();` at the top.
       - Swap `prisma.carrierDispatch.update(...)` → `tenantPrisma.carrierDispatch.update(...)`.
       - Swap `prisma.carrierStop.deleteMany` — leave on bare `prisma` (delete is not an audit-injection operation; CONTEXT says don't change reads, but delete is not a read either; treat deletes as "neutral" and leave them on bare `prisma` to minimize diff).
       - Swap the template-stops re-create loop `prisma.carrierStop.create(...)` → `tenantPrisma.carrierStop.create(...)`.
       - Leave the validation `findFirst` / `findUnique` reads on bare `prisma`.
    4. In any other exported close/cancel/route-recurrence functions in this file that perform `.update` or `.create` (e.g. closeDispatch around line ~636, the recurrence-generation `prisma.carrierDispatch.create` around line ~722 and its nested `prisma.carrierStop.create` around line ~758, the `prisma.carrierLoad.updateMany` around line ~826 with the dispatch.update at line ~831 and ~848):
       - Add `const tenantPrisma = await getTenantPrisma();` once at the top of each exported function.
       - Swap each `.update`/`.create`/`.updateMany` to use `tenantPrisma`.
       - NOTE: Some of these flows may run inside `after(() => ...)` callbacks. The `getTenantPrisma()` call MUST happen synchronously inside the request scope (i.e. before the `after()` returns) — DO NOT call `getTenantPrisma()` inside the `after()` callback because the request headers may not be available. If a write happens inside `after()`, hoist `const tenantPrisma = await getTenantPrisma();` to before the `after()` registration and close over it.

    **loads.ts:**
    1. Add the import.
    2. In `createLoad`:
       - Add `const tenantPrisma = await getTenantPrisma();` at the top.
       - Swap `prisma.carrierLoad.create(...)` → `tenantPrisma.carrierLoad.create(...)`.
       - Swap the pendingStopsJson `prisma.carrierLoad.update(...)` → `tenantPrisma.carrierLoad.update(...)`.
       - Leave `prisma.carrierLoad.findFirst` (for referenceNumber sequence + final return) on bare `prisma`.
       - When calling `await persistStops(orgId, load.id, load.dispatchId, data.stops)`, pass `tenantPrisma` in — see persistStops change below.
    3. In `updateLoad`:
       - Add `const tenantPrisma = await getTenantPrisma();` at the top.
       - Swap `prisma.carrierLoad.update(...)` (the main update) → `tenantPrisma.carrierLoad.update(...)`.
       - Swap the migrate-stops `prisma.carrierStop.updateMany(...)` → `tenantPrisma.carrierStop.updateMany(...)`.
       - Swap the clear-pending `prisma.carrierLoad.update(...)` → `tenantPrisma.carrierLoad.update(...)`.
       - Swap the dispatchId-detach `prisma.carrierStop.deleteMany` — leave on bare `prisma` (delete is neutral).
       - Swap the pending-stops-from-JSON `prisma.carrierLoad.update({ data: { pendingStopsJson: null } })` → `tenantPrisma.carrierLoad.update(...)`.
       - Swap the JSON-mode `prisma.carrierLoad.update({ data: { pendingStopsJson: ... } })` → `tenantPrisma.carrierLoad.update(...)`.
       - When calling `persistStops`, pass `tenantPrisma` in.
       - Leave the existence-check `prisma.carrierLoad.findFirst` and the pendingStopsJson read on bare `prisma`.
    4. In `persistStops`:
       - Change its signature to accept a tenant Prisma client as the first parameter: `async function persistStops(tenantPrisma: PrismaClient, orgId: string, loadId: string, dispatchId: string, stops: StopInput[])` — adjust the import for PrismaClient: `import type { PrismaClient } from '@/generated/prisma/client';`.
       - Inside, replace `prisma.$transaction(async (tx) => { ... })` with `tenantPrisma.$transaction(async (tx) => { ... })`. The `tx` variable inherits the extension chain — `tx.carrierStop.create` / `.createMany` / `.updateMany` will auto-stamp audit columns.
       - Update both call sites (`createLoad` and `updateLoad`) to pass `tenantPrisma` as the new first argument.
    5. Other exported functions in loads.ts that perform writes (e.g. status transitions, the cascading `prisma.carrierDispatch.update` around line ~570):
       - Same pattern: `const tenantPrisma = await getTenantPrisma();` at function top; swap each write op; leave reads alone.

    **General rules (apply across all 3 files):**
    - NEVER add `createdById` / `updatedById` to a `data:` payload. The extension handles it.
    - NEVER call `getTenantPrisma()` inside a callback that runs after the request — hoist the call to synchronous request scope.
    - Hover any `import type` block: ensure no unused imports are added. If `PrismaClient` is only used as a type, use `import type`.
    - Reference: `.planning/quick/389-tkt-0034-diagnostic-created-by-unknown-l/389-SUMMARY.md` for the full root cause analysis.

    DO NOT run `vercel --prod`, `git push`, or any deploy command. User deploys manually.
  </action>
  <verify>
    From repo root:

    1. TypeScript check from `apps/web`:
       `cd apps/web; npx tsc --noEmit`
       Expect zero new errors.

    2. Confirm `getTenantPrisma` import was added in all 3 files:
       `git diff apps/web/src/lib/carrier/fleet-drivers.ts apps/web/src/lib/carrier/dispatches.ts apps/web/src/lib/carrier/loads.ts | findstr "getTenantPrisma"`
       Expect numerous matches.

    3. Confirm `persistStops` signature change in loads.ts:
       `git diff apps/web/src/lib/carrier/loads.ts | findstr "persistStops"`
       Expect to see the new first parameter (tenant client) added to the signature and to both call sites.

    4. Confirm no `createdById:` / `updatedById:` was added to any payload (the extension does it):
       `git diff apps/web/src/lib/carrier/ | findstr /R "createdById: updatedById:"`
       Expect ZERO added lines (only removals would be OK, but there shouldn't be any).
  </verify>
  <done>
    All 3 files (fleet-drivers, dispatches, loads) have:
    - `getTenantPrisma` imported
    - `const tenantPrisma = await getTenantPrisma()` once at the top of every exported write function
    - Every `.create`/`.update`/`.upsert`/`.createMany`/`.updateMany` inside write functions calls through `tenantPrisma` not `prisma`
    - All reads (`.findFirst`/`.findMany`/`.findUnique`/`.count`/`.aggregate`) and deletes still call through bare `prisma`
    - No `createdById` / `updatedById` added to any payload manually
    - `persistStops` accepts a tenant client parameter and uses it for `$transaction`; both call sites pass it
    - No `getTenantPrisma()` calls inside `after()` callbacks
    - `npx tsc --noEmit` passes
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    Swapped bare `prisma` to `getTenantPrisma()` for every WRITE op in the 8 carrier data-layer files. Reads unchanged. No schema or migration changes. The `withAuditColumns` extension now sees the session userId on every carrier write and stamps `created_by_id` / `updated_by_id` automatically.
  </what-built>
  <how-to-verify>
    Start the web dev server: `cd apps/web; npm run dev`

    Then, signed in as a real owner user (NOT a system/cron context — must have a session.userId), execute the following end-to-end checks. For each, the AuditTrailFooter at the bottom of the detail page should show your name (or email) instead of "Unknown" for the line you just produced.

    1. **CarrierTruck CREATE:** Navigate to `/carrier/fleet/trucks`, click "Add Truck", fill the form, save. Open the newly created truck's detail page. Confirm "Created by [your name]" appears in the footer (not "Unknown").

    2. **CarrierTruck UPDATE:** Edit the same truck, change any field, save. Refresh detail page. Confirm "Last updated by [your name]" appears.

    3. **CarrierDriver CREATE + UPDATE:** Repeat for `/carrier/fleet/drivers`.

    4. **CarrierClient CREATE + UPDATE:** Repeat for `/carrier/clients`.

    5. **CarrierContract CREATE + UPDATE:** Repeat for `/carrier/contracts`.

    6. **CarrierFacility CREATE + UPDATE:** Repeat for `/carrier/facilities`.

    7. **CarrierDispatch CREATE + UPDATE:** Repeat for `/carrier/dispatches`.

    8. **CarrierLoad CREATE + UPDATE:** Repeat for `/carrier/loads`.

    9. **CarrierStop CREATE + UPDATE:** Create a load with stops, then edit a stop, and view the stop detail page (if there is one) or verify in the database that `created_by_id` and `updated_by_id` are populated on the `stops` row.

    10. **Historical row sanity:** Open any entity created BEFORE this fix (e.g. an old truck). Confirm it STILL shows "Unknown" — historical rows must NOT be backfilled.

    11. **DB spot-check (optional but recommended):** From Supabase SQL editor or Prisma Studio, run:
        ```sql
        SELECT id, created_by_id, updated_by_id, created_at, updated_at
        FROM carrier_trucks
        ORDER BY created_at DESC
        LIMIT 5;
        ```
        Confirm the newest row has non-NULL `created_by_id` / `updated_by_id` matching your user id.

    If any of the 8 entities still shows "Unknown" after a fresh create/update, the swap was missed for that file — report which entity failed.
  </how-to-verify>
  <resume-signal>Type "approved — all 8 entities show actor name" or describe which entities still show "Unknown".</resume-signal>
</task>

</tasks>

<verification>
- `cd apps/web; npx tsc --noEmit` passes with zero new errors
- All 8 carrier lib files have both `prisma` (for reads) and `getTenantPrisma` (for writes) imported
- No `createdById:` or `updatedById:` literal added to any `data:` payload in the diff
- Human verification confirms newly-created carrier entities (all 8 types) show actor name in AuditTrailFooter
- Human verification confirms updated carrier entities show actor name on "Last updated by"
- Historical rows still show "Unknown" (no backfill happened)
</verification>

<success_criteria>
- POST /api/v1/carrier/{trucks,fleet/drivers,dispatches,loads,clients,contracts,facilities,stops} → DB row has non-NULL `created_by_id` matching session userId
- PATCH /api/v1/carrier/{...}/[id] → DB row has non-NULL `updated_by_id` matching session userId
- Detail pages for the 8 carrier entities render `<name>` (or `<email>`) in AuditTrailFooter for both Created by and Last updated by lines after a fresh write
- Read behavior (list pages, detail page initial loads, dropdown options) is unchanged — bare `prisma` is still used for all reads
- No schema, migration, route, or UI files were modified
- Pre-existing rows with NULL audit columns still render "Unknown" (no backfill performed)
</success_criteria>

<output>
After completion, create `.planning/quick/390-tkt-0034-fix-swap-bare-prisma-to-gettena/390-SUMMARY.md` documenting:
- The 8 files modified + which write functions in each were swapped
- The decision to leave reads on bare `prisma` and the rationale (CONTEXT.md constraint)
- The decision to leave deletes on bare `prisma` (no audit injection applies)
- The persistStops signature change and rationale (tx inherits extension chain)
- Any write paths discovered during execution that were intentionally NOT swapped, with reason
- Spot-check evidence: the IDs of one newly-created row per entity with non-NULL audit columns
</output>
