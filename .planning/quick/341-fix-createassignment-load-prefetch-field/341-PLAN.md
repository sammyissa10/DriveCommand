---
phase: quick-341
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/actions/load-driver-assignments.ts
autonomous: true
must_haves:
  truths:
    - "createAssignment notification prefetch returns a non-null load row for any valid loadId that exists in the loads table"
    - "[notif-trace] caller:prefetch-result log emits load=true (not load=false) for valid driver assignments in production"
    - "dispatchNotification('load.assigned', ...) actually fires when a driver is assigned, with loadNumber populated from referenceNumber (fallback empty string)"
    - "originCity and destCity in the dispatched payload are non-empty strings pulled from the pickup/delivery CarrierStop -> CarrierFacility.city, defaulting to '' when no stops exist yet"
    - "TypeScript compiles cleanly via `npx tsc --noEmit` from apps/web"
    - "Notification vitest suite still passes (no regressions in __tests__/notifications/)"
  artifacts:
    - path: "apps/web/src/app/(owner)/actions/load-driver-assignments.ts"
      provides: "createAssignment server action with corrected prefetch using carrierLoad + stops join"
      contains: "defaultPrisma.carrierLoad.findUnique"
  key_links:
    - from: "createAssignment prefetch (apps/web/src/app/(owner)/actions/load-driver-assignments.ts)"
      to: "CarrierLoad Prisma model (apps/web/prisma/schema.prisma:1973, @@map(\"loads\"))"
      via: "defaultPrisma.carrierLoad.findUnique({ where: { id: loadId } })"
      pattern: "defaultPrisma\\.carrierLoad\\.findUnique"
    - from: "createAssignment prefetch"
      to: "CarrierStop -> CarrierFacility.city (apps/web/prisma/schema.prisma:1751)"
      via: "include: { stops: { include: { facility: { select: { city: true } } } } }"
      pattern: "stops:\\s*\\{\\s*include:\\s*\\{\\s*facility"
    - from: "createAssignment prefetch result"
      to: "dispatchNotification('load.assigned') payload"
      via: "loadNumber = load.referenceNumber ?? '', originCity = pickupStop?.facility.city ?? '', destCity = deliveryStop?.facility.city ?? ''"
      pattern: "loadNumber:\\s*\\(?load\\.referenceNumber"
---

<objective>
Fix the silent null prefetch in `createAssignment`. Quick-340 correctly bypassed RLS with `defaultPrisma`, but the prefetch still returns `load=false` in production because it queries the WRONG Prisma model.

**Root cause (confirmed by schema inspection):**
- `apps/web/prisma/schema.prisma` line 2702: `LoadDriverAssignment.load` relation points to `CarrierLoad`, not `Load`.
- `CarrierLoad` is `@@map("loads")` (line 2029) — that's the real `loads` table.
- The legacy `Load` Prisma model (line 1025) is a different model that maps to its own (different) table. Its `loadNumber`/`origin`/`destination` fields exist in *that* model but the `loadId` we have refers to a row in the `loads` table, which Prisma reaches via `prisma.carrierLoad`. So `defaultPrisma.load.findUnique({ where: { id: loadId } })` always returns `null` — the UUID simply doesn't exist in the `Load`-mapped table.

**Schema quotes (verbatim from prisma/schema.prisma):**
- Line 1025–1035 (`Load` model): `loadNumber String`, `origin String`, `destination String` — but this model is irrelevant here.
- Line 1973–2030 (`CarrierLoad` model, `@@map("loads")`): `referenceNumber String? @map("reference_number")`, `bolNumber`, `proNumber`, `poNumber`. NO `loadNumber`, NO `origin`, NO `destination`.
- Line 2032–2079 (`CarrierStop` model, `@@map("stops")`): `stopType String @map("stop_type")`, `sequenceOrder Int @map("sequence_order")`, `facilityId String @map("facility_id")`, and `facility CarrierFacility @relation(...)`.
- Line 1744–1775 (`CarrierFacility` model, `@@map("facilities")`): `city String?`.
- Line 2702: `load CarrierLoad @relation(fields: [loadId], references: [id], onDelete: Restrict)` — proves `LoadDriverAssignment.loadId` points at `CarrierLoad`.

**Actual data shape:** A load's user-facing identifier is `CarrierLoad.referenceNumber` (the trucking ref/load number). Origin and destination cities live on `CarrierStop.facility.city` filtered by `stopType` ('pickup' for origin, 'delivery' for destination), ordered by `sequenceOrder` (first pickup, last delivery).

**Fix approach (Option A — schema supports a clean fix in ~one query):**
Rewrite the prefetch to use `defaultPrisma.carrierLoad.findUnique` and pull the stops with facility city via a nested `include`. Then in JS derive: `loadNumber = load.referenceNumber ?? ''`, `originCity = firstPickupStop?.facility.city ?? ''`, `destCity = lastDeliveryStop?.facility.city ?? ''`. The notification template already accepts these strings; empty string is a safe fallback (template renders without crashing).

Purpose: actually deliver push notifications to drivers when assigned. Right now the `if (load && driver)` guard always closes (load is null), so `dispatchNotification` is silently skipped.

Output: one-file edit, TypeScript pass, vitest pass, and a real load row prefetched in production.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Target file (the only file modified)
@apps/web/src/app/(owner)/actions/load-driver-assignments.ts

# Schema is the source of truth (DO NOT modify, only read)
@apps/web/prisma/schema.prisma

# Prior fix that swapped to defaultPrisma — preserve its intent
@.planning/quick/340-use-defaultprisma-for-notification-prefe/340-PLAN.md
</context>

<reasoning_confirmation>
Confirmed before writing this plan (schema lines quoted verbatim):

1. **`LoadDriverAssignment.load` -> `CarrierLoad`** (line 2702):
   ```
   load CarrierLoad @relation(fields: [loadId], references: [id], onDelete: Restrict)
   ```
   So `loadId` in `createAssignment` refers to a `CarrierLoad.id`, which lives in the `loads` table (`@@map("loads")` on line 2029).

2. **`CarrierLoad` has NO `loadNumber`/`origin`/`destination`**. It has (line 1980–1983):
   ```
   referenceNumber      String?  @map("reference_number")
   bolNumber            String?  @map("bol_number")
   proNumber            String?  @map("pro_number")
   poNumber             String?  @map("po_number")
   ```
   The user-facing "load number" is `referenceNumber`.

3. **`CarrierLoad.stops` relation** exists (line 2015: `stops CarrierStop[]`). `CarrierStop.stopType` is a string ('pickup' | 'delivery' | etc.) and `CarrierStop.facility` is a `CarrierFacility` with a `city` column.

4. **`Load` (line 1025)** is a different, legacy model with `loadNumber`/`origin`/`destination` but it's NOT the model `loadId` refers to — that's why `defaultPrisma.load.findUnique` returns null.

5. **Existing notification payload contract** (apps/web/src/lib/notifications/types.ts:60):
   ```
   'load.assigned': { loadId: string; loadNumber: string; driverId: string; driverName: string; originCity: string; destCity: string };
   ```
   All four string fields stay required strings. We supply '' when data is missing — the template handles empty strings gracefully (no crash, the message just renders without that detail).

6. **Quick-340 import is preserved**: `import { prisma as defaultPrisma } from '@/lib/db/prisma';` already exists at the top of the file. We don't add or remove imports.

7. **Trace log is preserved**: `[notif-trace] caller:prefetch-result load=... driver=...` log line stays exactly where quick-340 placed it (just before `if (load && driver) {`).
</reasoning_confirmation>

<tasks>

<task type="auto">
  <name>Task 1: Rewrite createAssignment load prefetch to use carrierLoad + stops/facility join</name>
  <files>apps/web/src/app/(owner)/actions/load-driver-assignments.ts</files>
  <action>
Make exactly TWO edits to `apps/web/src/app/(owner)/actions/load-driver-assignments.ts`. No other files. No other functions in this file.

**Edit 1 — Rewrite the prefetch `Promise.all` (currently lines ~239–251).**

The current code is:

```ts
  // Prefetch load/driver data needed for notification payload.
  const [load, driver] = await Promise.all([
    defaultPrisma.load.findUnique({
      where: { id: loadId },
      select: { loadNumber: true, origin: true, destination: true },
    }),
    defaultPrisma.carrierDriver.findUnique({
      where: { id: cd.id },
      select: { firstName: true, lastName: true },
    }),
  ]).catch((err) => {
    console.error('[notifications] createAssignment prefetch failed', err);
    return [null, null] as const;
  });
```

Replace it with:

```ts
  // Prefetch load/driver data needed for notification payload.
  //
  // IMPORTANT (quick-341): `LoadDriverAssignment.loadId` is a FK to `CarrierLoad`,
  // which is `@@map("loads")` in the schema. The legacy `Load` model is a
  // DIFFERENT table — querying it with this id always returned null (quick-340
  // [notif-trace] showed load=false in prod). Use `carrierLoad` and pull
  // origin/destination cities via the stops -> facility relation. `referenceNumber`
  // is the user-facing load identifier (replaces the non-existent `loadNumber`).
  const [load, driver] = await Promise.all([
    defaultPrisma.carrierLoad.findUnique({
      where: { id: loadId },
      select: {
        referenceNumber: true,
        stops: {
          select: {
            stopType: true,
            sequenceOrder: true,
            facility: { select: { city: true } },
          },
          orderBy: { sequenceOrder: 'asc' },
        },
      },
    }),
    defaultPrisma.carrierDriver.findUnique({
      where: { id: cd.id },
      select: { firstName: true, lastName: true },
    }),
  ]).catch((err) => {
    console.error('[notifications] createAssignment prefetch failed', err);
    return [null, null] as const;
  });
```

Notes on this edit:
- The `select` shape now matches the real `CarrierLoad` model. No invented fields.
- `stops` is included with the `facility.city` join so we can derive origin/destination cities. `orderBy: { sequenceOrder: 'asc' }` ensures the first pickup and last delivery are predictable.
- The `.catch(...)` block is identical to before — do NOT change it.
- The `defaultPrisma` import stays (already imported per quick-340).
- The driver prefetch is unchanged — it already works.

**Edit 2 — Update the dispatch payload (currently lines ~260–271) to derive fields from the new shape.**

The current code is:

```ts
  console.log(`[notif-trace] caller:prefetch-result load=${load != null} driver=${driver != null} loadId=${loadId} driverId=${cd.id}`);
  if (load && driver) {
    console.log(`[notif-trace] caller:before-dispatch trigger=load.assigned load=${loadId} driver=${cd.id}`);
    // Synchronous await — quick-336 (waitUntil wrap) and quick-337 (prefetch outside waitUntil) both
    // failed in production with zero NotificationSendLog rows. The Vercel + Next.js Server Action
    // runtime silently drops background promises here. Accept the ~1-2s extra latency for guaranteed
    // delivery (quick-338).
    await dispatchNotification('load.assigned', {
      tenantId,
      payload: {
        loadId,
        loadNumber: load.loadNumber,
        driverId: cd.id,
        driverName: `${driver.firstName} ${driver.lastName}`,
        originCity: load.origin,
        destCity: load.destination,
      },
      relatedEntity: { type: 'Load', id: loadId },
    }).catch((err) => console.error('[notifications] load.assigned (createAssignment) dispatch failed', err));
    console.log(`[notif-trace] caller:after-dispatch trigger=load.assigned`);
  }
```

Replace ONLY the `if (load && driver) { ... }` block (the prefetch-result log line above it stays exactly as-is) with:

```ts
  console.log(`[notif-trace] caller:prefetch-result load=${load != null} driver=${driver != null} loadId=${loadId} driverId=${cd.id}`);
  if (load && driver) {
    // Derive origin/destination cities from stops. `stopType` is a free-form string
    // in the schema; we accept the conventional 'pickup' / 'delivery' values
    // (case-insensitive) and fall back to '' when no matching stop exists yet
    // (e.g. load was created without a dispatch). The notification template renders
    // safely with empty strings.
    const pickupStop = load.stops.find((s) => s.stopType?.toLowerCase() === 'pickup');
    const deliveryStops = load.stops.filter((s) => s.stopType?.toLowerCase() === 'delivery');
    const deliveryStop = deliveryStops.length > 0 ? deliveryStops[deliveryStops.length - 1] : undefined;
    const originCity = pickupStop?.facility?.city ?? '';
    const destCity = deliveryStop?.facility?.city ?? '';
    const loadNumber = load.referenceNumber ?? '';

    console.log(`[notif-trace] caller:before-dispatch trigger=load.assigned load=${loadId} driver=${cd.id}`);
    // Synchronous await — quick-336 (waitUntil wrap) and quick-337 (prefetch outside waitUntil) both
    // failed in production with zero NotificationSendLog rows. The Vercel + Next.js Server Action
    // runtime silently drops background promises here. Accept the ~1-2s extra latency for guaranteed
    // delivery (quick-338).
    await dispatchNotification('load.assigned', {
      tenantId,
      payload: {
        loadId,
        loadNumber,
        driverId: cd.id,
        driverName: `${driver.firstName} ${driver.lastName}`,
        originCity,
        destCity,
      },
      relatedEntity: { type: 'Load', id: loadId },
    }).catch((err) => console.error('[notifications] load.assigned (createAssignment) dispatch failed', err));
    console.log(`[notif-trace] caller:after-dispatch trigger=load.assigned`);
  }
```

Notes on this edit:
- Pickup = the first stop with `stopType === 'pickup'` (lowercased). Delivery = the LAST stop with `stopType === 'delivery'` (lowercased) — for multi-stop loads, last delivery is the final destination.
- `s.stopType?.toLowerCase()` defensively handles any null/casing variance.
- `pickupStop?.facility?.city ?? ''` — both the stop AND the facility join are optional in the select shape; chain through and default to ''.
- `loadNumber = load.referenceNumber ?? ''` — `referenceNumber` is nullable in the schema; default to empty string to satisfy the `string` payload contract.
- All three existing trace logs (`caller:prefetch-result`, `caller:before-dispatch`, `caller:after-dispatch`) are preserved verbatim.
- The quick-336/337/338 comment block is preserved verbatim.
- The synchronous `await dispatchNotification(...)` pattern is preserved.
- `relatedEntity: { type: 'Load', id: loadId }` stays as-is — it's a notification-system tag, not a Prisma model reference.

**Constraints — do NOT violate:**
- Do NOT modify `apps/web/prisma/schema.prisma`.
- Do NOT touch `apps/web/src/lib/notifications/dispatcher.ts` or any file in `apps/web/src/lib/notifications/`.
- Do NOT touch any test file.
- Do NOT touch any notification template.
- Do NOT remove or modify the `defaultPrisma` import (preserved from quick-340).
- Do NOT remove or modify any of the three `[notif-trace]` log lines.
- Do NOT change `updateAssignment`, `deleteAssignment`, `listAssignmentsForLoad`, or any other function in this file.
- Do NOT change any `prisma.*` (tenant-scoped) reference elsewhere in the file.
- Keep TypeScript strict mode — no `any`, no `as unknown as`. The shape from Prisma's selected `findUnique` infers correctly; rely on it.
  </action>
  <verify>
Run from repository root:

```bash
cd apps/web && npx tsc --noEmit
```
Expected: exit code 0, no errors.

Then run the notifications vitest suite:

```bash
cd apps/web && npx vitest run __tests__/notifications/
```
Expected: all tests pass. (The dispatcher tests don't exercise this prefetch directly — they hit `dispatchNotification` with synthesized payloads — so they should be unaffected. If they fail, the failure is unrelated to this edit OR you broke a payload-shape contract; investigate before declaring done.)

Then verify the edits landed via grep:

```bash
grep -n "defaultPrisma\.carrierLoad" apps/web/src/app/\(owner\)/actions/load-driver-assignments.ts
```
Expected: exactly 1 match (the new findUnique call).

```bash
grep -n "defaultPrisma\.load\." apps/web/src/app/\(owner\)/actions/load-driver-assignments.ts
```
Expected: ZERO matches (the old wrong-model call is gone).

```bash
grep -n "load\.referenceNumber\|load\.stops" apps/web/src/app/\(owner\)/actions/load-driver-assignments.ts
```
Expected: at least 2 matches inside the `if (load && driver)` block — one for `load.stops.find(...)` and one for `load.referenceNumber`.

```bash
grep -n "caller:prefetch-result\|caller:before-dispatch\|caller:after-dispatch" apps/web/src/app/\(owner\)/actions/load-driver-assignments.ts
```
Expected: exactly 3 matches (one per trace line, unchanged from quick-340 + quick-339).

Build verification:

```bash
cd apps/web && npm run build
```
Expected: build succeeds.

Monorepo build verification (from repo root):

```bash
npx turbo run build
```
Expected: all packages build cleanly.
  </verify>
  <done>
- `npx tsc --noEmit` from `apps/web` exits 0.
- `npx vitest run __tests__/notifications/` from `apps/web` exits 0 (all notification tests pass).
- `npm run build` in `apps/web` exits 0.
- `npx turbo run build` from repo root exits 0.
- `defaultPrisma.load.findUnique` is GONE from the file.
- `defaultPrisma.carrierLoad.findUnique` appears exactly once, with the new `select` shape including `referenceNumber` and `stops -> facility.city`.
- The `if (load && driver) { ... }` block derives `loadNumber`, `originCity`, `destCity` from the new shape and dispatches with the same payload contract.
- All three `[notif-trace]` log lines are intact (`caller:prefetch-result`, `caller:before-dispatch`, `caller:after-dispatch`).
- The quick-336/337/338 explanatory comment block above `await dispatchNotification` is intact.
- The `.catch((err) => { ...; return [null, null] as const; })` handler on the `Promise.all` is intact.
- The `defaultPrisma` import at the top of the file is intact.
- No other functions in the file changed.
- No other files modified anywhere in the repo.
  </done>
</task>

</tasks>

<verification>
Spot-check after Task 1:

1. `git diff apps/web/src/app/\(owner\)/actions/load-driver-assignments.ts` — diff is contained to two adjacent regions (the prefetch and the `if (load && driver)` block). No edits elsewhere in the file.
2. `git diff --stat` — exactly one file changed: `apps/web/src/app/(owner)/actions/load-driver-assignments.ts`.
3. The new code uses ONLY fields that exist on `CarrierLoad` (`referenceNumber`, `stops`) and `CarrierStop` (`stopType`, `sequenceOrder`, `facility`) and `CarrierFacility` (`city`) — cross-check against schema.prisma lines 1973–2030, 2032–2079, and 1744–1775.
4. `tsc --noEmit` green AND vitest green AND build green — all four verification commands in the task's `<verify>` section must pass.
5. Optional smoke (manual, not required to declare done): in dev, create a driver assignment on a load that has dispatched stops; tail server logs and confirm `[notif-trace] caller:prefetch-result load=true driver=true` followed by `caller:before-dispatch` and `caller:after-dispatch` and a new row in `NotificationSendLog`.
</verification>

<success_criteria>
- The createAssignment prefetch reads from the correct Prisma model (`carrierLoad`, which maps to the `loads` table) and selects only fields that exist in the schema.
- `loadNumber`, `originCity`, `destCity` in the dispatched `load.assigned` payload are populated from `referenceNumber`, first-pickup-stop facility city, and last-delivery-stop facility city respectively — with `''` fallbacks that won't crash the template.
- The trace pipeline established by quick-339/340 (`[notif-trace] caller:prefetch-result` etc.) is preserved and will now show `load=true` in production for any valid assignment.
- TypeScript compiles cleanly, vitest passes, web build passes, monorepo build passes.
- Only one file in the entire repo is modified.
- The schema is NOT modified. The dispatcher is NOT modified. Tests are NOT modified. Notification templates are NOT modified.
</success_criteria>

<output>
After completion, create `.planning/quick/341-fix-createassignment-load-prefetch-field/341-SUMMARY.md` documenting:
- The exact edits made (file + line ranges + before/after summary).
- The schema-level root cause (LoadDriverAssignment.load -> CarrierLoad, not legacy Load) with schema line references.
- Why Option A was chosen over Option B (the join is one nested `include`, well within the 5-line threshold in spirit even if literal line count is larger — no extra round trips, no template changes).
- Verification command outputs (tsc, vitest, npm run build, turbo build — paste exit codes / tail of output).
- Expected next observable behavior in production: `[notif-trace] caller:prefetch-result load=true driver=true` for valid assignments, `NotificationSendLog` rows created, drivers receive push notifications when assigned.
- Append a row to `.planning/STATE.md` under the relevant section per the repo's convention.
</output>
