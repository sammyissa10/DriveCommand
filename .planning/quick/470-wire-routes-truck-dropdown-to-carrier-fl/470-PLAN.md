---
phase: quick-470
plan: 470
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/schema.prisma
  - apps/web/prisma/migrations/20260717_route_carrier_truck/migration.sql
  - packages/validation/src/route.ts
  - apps/web/src/app/(owner)/actions/routes.ts
  - apps/web/src/app/(owner)/routes/new/page.tsx
  - apps/web/src/app/(owner)/routes/new/new-route-client.tsx
  - apps/web/src/app/(owner)/routes/[id]/page.tsx
  - apps/web/src/app/(owner)/routes/[id]/route-page-client.tsx
  - apps/web/src/components/routes/route-edit-section.tsx
  - apps/web/src/components/routes/route-form.tsx
  - apps/web/src/components/routes/route-detail.tsx
autonomous: true

must_haves:
  truths:
    - "The Truck dropdown on /routes/new and /routes/{id}?mode=edit lists the carrier fleet (CarrierTruck unit numbers), not an empty list"
    - "A new route can be created with a selected carrier truck and persists Route.carrierTruckId"
    - "Existing legacy routes (with truckId set, carrierTruckId null) still load and display their truck"
    - "The route detail page shows the assigned carrier truck for new routes and the legacy truck for old routes"
  artifacts:
    - path: "apps/web/prisma/migrations/20260717_route_carrier_truck/migration.sql"
      provides: "carrierTruckId column + FK on Route, truckId made nullable"
      contains: "carrierTruckId"
    - path: "apps/web/prisma/schema.prisma"
      provides: "Route.carrierTruck relation + optional truck; CarrierTruck.routes reverse relation"
      contains: "carrierTruckId"
  key_links:
    - from: "apps/web/src/components/routes/route-form.tsx"
      to: "form field name=carrierTruckId"
      via: "select rendering carrier trucks"
      pattern: "carrierTruckId"
    - from: "apps/web/src/app/(owner)/actions/routes.ts"
      to: "Route.carrierTruckId persisted"
      via: "createRoute/updateRoute write carrierTruckId"
      pattern: "carrierTruckId"
    - from: "apps/web/src/app/(owner)/routes/new/page.tsx"
      to: "listCarrierTrucks(orgId)"
      via: "server-side fleet load"
      pattern: "listCarrierTrucks"
---

<objective>
Wire the Routes create/edit truck dropdown to the carrier fleet (`CarrierTruck` / `carrier_trucks`, orgId-scoped) instead of the empty legacy `Truck` table. Add a nullable `carrierTruckId` FK on `Route`, make the legacy `truckId` optional (keep the column and existing rows working), populate the form from `listCarrierTrucks(orgId)`, persist `carrierTruckId`, and display the carrier truck on the route detail (falling back to the legacy truck for old routes).

Purpose: Carrier orgs store their fleet in `CarrierTruck`; the route form currently reads legacy `Truck` via `listTrucks()` which is empty, so the dropdown shows nothing and routes can't be created.
Output: Schema + migration, validation + action changes, form + page + detail UI changes. New routes save a carrier truck; old routes keep working.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md

# Legacy Route model (add carrierTruckId, make truckId optional) — schema.prisma ~L492-539
# CarrierTruck model (add reverse `routes Route[]`) — schema.prisma ~L2076-2120
@apps/web/prisma/schema.prisma

# PRECEDENT — the exact migration pattern to copy (nullable carrier FK + DROP NOT NULL on legacy truckId + index)
@apps/web/prisma/migrations/20260417_add_carrier_truck_id_to_gps_location/migration.sql

# Carrier fleet reader — listCarrierTrucks(orgId) returns { items, total }; items have id, unitNumber, displayName
@apps/web/src/lib/carrier/fleet-trucks.ts

# Validation schema — routeCreateSchema/routeUpdateSchema
@packages/validation/src/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Schema + migration — add nullable carrierTruckId FK on Route, make legacy truckId optional</name>
  <files>apps/web/prisma/schema.prisma, apps/web/prisma/migrations/20260717_route_carrier_truck/migration.sql</files>
  <action>
CRITICAL NAMING FACT (verified): the legacy Route table is PascalCase `"Route"` with a quoted camelCase column `"truckId"` and PK `"id"` — it is NOT `routes.truck_id`. Ignore the snake-case SQL in the ticket description; follow the GPSLocation precedent migration exactly (same pattern was already shipped for that table). `carrier_trucks` PK is `id`.

1. In apps/web/prisma/schema.prisma, edit the `Route` model (~L492-539):
   - Change `truckId String @db.Uuid` → `truckId String? @db.Uuid` (nullable).
   - Change relation `truck Truck @relation(fields: [truckId], references: [id])` → `truck Truck? @relation(fields: [truckId], references: [id])`.
   - Add field `carrierTruckId String? @db.Uuid` (no `@map` — this model uses Prisma default column naming, matching `"carrierTruckId"` quoted identifier).
   - Add relation `carrierTruck CarrierTruck? @relation(fields: [carrierTruckId], references: [id])`.
   - Add `@@index([carrierTruckId])` alongside the other `@@index` lines.

2. In the `CarrierTruck` model (~L2076-2120), add a reverse relation field among the other relations: `routes Route[]`. (No back-reference name needed since Route only has one relation to CarrierTruck.)

3. Create the migration file apps/web/prisma/migrations/20260717_route_carrier_truck/migration.sql with content (copy the GPSLocation precedent's identifier style — quoted PascalCase table, quoted camelCase columns):
   ```sql
   -- Add nullable carrier_truck FK to Route (carrier orgs store fleet in carrier_trucks)
   ALTER TABLE "Route"
     ADD COLUMN "carrierTruckId" UUID REFERENCES "carrier_trucks"(id) ON DELETE SET NULL;

   -- Make legacy truckId nullable — carrier routes have no legacy Truck row
   ALTER TABLE "Route"
     ALTER COLUMN "truckId" DROP NOT NULL;

   -- Index for carrier truck route lookups
   CREATE INDEX "Route_carrierTruckId_idx" ON "Route"("carrierTruckId");
   ```
   NOTE: writing migration.sql triggers the auto-deploy hook (`prisma migrate deploy`) per project convention. If the hook does not fire, apply the SQL via the Supabase MCP manually. Do NOT drop the `truckId` column.

4. Regenerate the Prisma client so `carrierTruck` / `carrierTruckId` are typed: run `cd apps/web && npx prisma generate`.
  </action>
  <verify>
`cd apps/web && npx prisma generate` succeeds. Confirm the migration applied: query the DB (Supabase MCP) — `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'Route' AND column_name IN ('truckId','carrierTruckId');` should show `truckId` is_nullable=YES and `carrierTruckId` present.
  </verify>
  <done>Route has a nullable `carrierTruckId` UUID FK to carrier_trucks(id), `truckId` is nullable, Route_carrierTruckId_idx exists, and the generated Prisma types expose `route.carrierTruck` / `carrierTruckId`.</done>
</task>

<task type="auto">
  <name>Task 2: Validation + server actions — accept, validate (org-scoped), and persist carrierTruckId</name>
  <files>packages/validation/src/route.ts, apps/web/src/app/(owner)/actions/routes.ts</files>
  <action>
1. packages/validation/src/route.ts — in `routeCreateSchema`:
   - Change `truckId: z.string().uuid('Invalid truck ID')` to `truckId: z.string().uuid('Invalid truck ID').optional()` (legacy, no longer required).
   - Add `carrierTruckId: z.string().uuid('Invalid truck ID'),` (required — the fleet truck the user picks).
   `routeUpdateSchema` is `routeCreateSchema.partial()` so it inherits both as optional automatically — no change needed there.

2. apps/web/src/app/(owner)/actions/routes.ts — `createRoute`:
   - In `rawData`, replace the `truckId` line with `carrierTruckId: formData.get('carrierTruckId') as string,` (keep reading `truckId` out entirely — the form no longer submits it).
   - Destructure `carrierTruckId` from `result.data` instead of `truckId`.
   - Replace the legacy "Validate truck exists" block (`prisma.truck.findUnique`) with a carrier-truck ownership check scoped to the org. orgId === tenantId for a given org, and `tenantId` is already fetched via `requireTenantId()`. Use the tenant-scoped prisma client:
     ```ts
     const carrierTruck = await prisma.carrierTruck.findFirst({
       where: { id: carrierTruckId, orgId: tenantId, deletedAt: null },
       select: { id: true },
     });
     if (!carrierTruck) {
       return { error: { carrierTruckId: ['Truck not found'] } };
     }
     ```
     (CarrierTruck is in EXEMPT_MODELS for tenant-RLS, so it MUST be filtered by orgId explicitly — this query does. getTenantPrisma() still sets the tenant GUC.)
   - In `prisma.route.create({ data: { ... } })`, remove `truckId,` and add `carrierTruckId,`. Do NOT set the legacy `truckId` (it is now nullable).

3. `updateRoute` in the same file:
   - Replace the `truckId` FormData read with `const carrierTruckId = formData.get('carrierTruckId') as string; if (carrierTruckId) rawData.carrierTruckId = carrierTruckId;`. Remove the `truckId` rawData block.
   - Replace the legacy "Validate truck if provided" block (`prisma.truck.findUnique`) with the same org-scoped carrier-truck check, guarded by `if (result.data.carrierTruckId)`:
     ```ts
     if (result.data.carrierTruckId) {
       const carrierTruck = await prisma.carrierTruck.findFirst({
         where: { id: result.data.carrierTruckId, orgId: tenantId, deletedAt: null },
         select: { id: true },
       });
       if (!carrierTruck) return { error: { carrierTruckId: ['Truck not found'] } };
     }
     ```
   - In the `updateData` builder, replace `if (result.data.truckId) updateData.truckId = result.data.truckId;` with `if (result.data.carrierTruckId) updateData.carrierTruckId = result.data.carrierTruckId;`.

4. `getRoute` in the same file — add the carrier truck to the `include` so detail/edit can read it, and keep the legacy `truck` include for old routes:
   ```ts
   carrierTruck: {
     select: { id: true, unitNumber: true, displayName: true, year: true, make: true, model: true, vin: true, licensePlate: true },
   },
   ```
   (Leave the existing `truck: { select: {...} }` include as-is for legacy fallback.)
  </action>
  <verify>`cd apps/web && npx tsc --noEmit` shows no NEW errors in routes.ts or route.ts (repo has ~35 pre-existing baseline errors; only regressions in touched files count).</verify>
  <done>routeCreateSchema requires carrierTruckId (truckId optional); createRoute/updateRoute validate the carrier truck belongs to the org and persist Route.carrierTruckId; getRoute returns route.carrierTruck.</done>
</task>

<task type="auto">
  <name>Task 3: Form + pages + detail UI — load carrier fleet, render unit numbers, submit carrierTruckId, display with fallback</name>
  <files>apps/web/src/app/(owner)/routes/new/page.tsx, apps/web/src/app/(owner)/routes/new/new-route-client.tsx, apps/web/src/app/(owner)/routes/[id]/page.tsx, apps/web/src/app/(owner)/routes/[id]/route-page-client.tsx, apps/web/src/components/routes/route-edit-section.tsx, apps/web/src/components/routes/route-form.tsx, apps/web/src/components/routes/route-detail.tsx</files>
  <action>
Goal: change the `trucks` prop shape everywhere from legacy `{ id, make, model, year, licensePlate }` to carrier `{ id, unitNumber, displayName }`, load it from `listCarrierTrucks(orgId)`, and make the form submit `name="carrierTruckId"`.

1. Shared truck prop type: define/update as `Array<{ id: string; unitNumber: string; displayName: string | null }>` in each file that declares a `trucks` prop (route-form.tsx, new-route-client.tsx, route-page-client.tsx, route-edit-section.tsx). Use a small local `Truck`/inline type — keep it consistent across the chain.

2. apps/web/src/components/routes/route-form.tsx:
   - Update the `RouteFormProps.trucks` type to the carrier shape above.
   - Add `carrierTruckId?: string` to the `initialData` type (for edit prefill); keep `truckId` in initialData optional or remove it — it is no longer used by the select.
   - In the Truck `<select>` (currently `name="truckId"`, id `truckId`): change `name` and `id` to `carrierTruckId`, `defaultValue={initialData?.carrierTruckId || ''}`, and render options as:
     ```tsx
     {trucks.map((truck) => (
       <option key={truck.id} value={truck.id}>
         {truck.displayName || truck.unitNumber}
       </option>
     ))}
     ```
   - Add an empty-state hint mirroring the drivers one: if `trucks.length === 0`, show "Add trucks to your fleet first before creating routes." and set the select `disabled` when empty.
   - Update `fieldErrors?.truckId` reference to `fieldErrors?.carrierTruckId`.

3. apps/web/src/app/(owner)/routes/new/page.tsx:
   - Replace `import { listTrucks } from '@/app/(owner)/actions/trucks'` with `import { listCarrierTrucks } from '@/lib/carrier/fleet-trucks'` and `import { requireTenantId } from '@/lib/context/tenant-context'`.
   - Load fleet: `const orgId = await requireTenantId();` then in the Promise.all replace the `listTrucks()` call with `listCarrierTrucks(orgId).then(r => r.items).catch(err => { logger.error('Failed to load carrier trucks for route form:', err); return [] as any[]; })`.
   (requireTenantId can be awaited before Promise.all, or fetched inside — keep it simple and await it first.)

4. apps/web/src/app/(owner)/routes/[id]/page.tsx:
   - Same swap: replace `listTrucks()` in the Promise.all with `listCarrierTrucks(orgId).then(r => r.items)` (import listCarrierTrucks + requireTenantId; `const orgId = await requireTenantId();`). Keep the `.catch(() => [])` guard.

5. new-route-client.tsx, route-page-client.tsx, route-edit-section.tsx:
   - Update their `Truck` interface / `trucks` prop type to the carrier shape `{ id, unitNumber, displayName }`. These just pass `trucks` through to RouteForm — no logic change beyond the type.
   - In route-edit-section.tsx, the `initialData` passed to RouteForm currently sets `truckId: route.truck.id`. Change it to `carrierTruckId: route.carrierTruckId ?? undefined` (read the FK id off the route, not the relation). Also update its local `route` prop type: make `truck` optional and add `carrierTruckId: string | null` (+ optional `carrierTruck`).

6. apps/web/src/components/routes/route-detail.tsx (Section 3 "Assigned Truck", ~L233-269):
   - Update the `Route` interface: make `truck` optional (`truck?: Truck | null`) and add `carrierTruck?: { id: string; unitNumber: string; displayName: string | null; year: number | null; make: string | null; model: string | null; vin: string | null; licensePlate: string | null } | null`.
   - Render the carrier truck when present, else fall back to the legacy truck, else an empty state. Prefer `carrierTruck.displayName || carrierTruck.unitNumber` for the vehicle label; show make/model/year/plate/VIN only when available (null-safe). If neither truck is present, render "No truck assigned" instead of crashing on `route.truck.year`.
   - The "View Truck Details" link: point to `/trucks/{carrierTruck.id}` when carrier truck exists (or keep legacy link for legacy routes). If the carrier truck detail route differs, a link to the fleet page is acceptable — do not invent a broken route; prefer linking to the carrier truck id only if a `/trucks/{id}` page renders it, otherwise omit the link for carrier trucks.

7. Null-safety audit: grep for other `route.truck.` / `.truck.` dereferences that assume a non-null truck now that it can be null for carrier routes:
   `grep -rn "route\.truck\.\|\.truck\." apps/web/src/app/\(owner\)/routes apps/web/src/components/routes` — add optional chaining / fallbacks where a carrier route (truck === null) would otherwise crash (e.g. route-list.tsx, _grid/columns.tsx if they show truck). Old routes keep a non-null truck so they are unaffected; only guard the null path.
  </action>
  <verify>
1. `cd apps/web && npx tsc --noEmit` — no NEW errors in the touched files.
2. Run the dev server (`cd apps/web && npm run dev`), open /routes/new: the Truck dropdown lists carrier fleet unit numbers (not empty), drivers still populate.
3. Create a route selecting a carrier truck + driver + origin/destination/date → it saves and redirects to /routes/{id}; the detail page "Assigned Truck" shows the selected carrier truck.
4. Open an existing legacy route detail (if any exist) → its truck still displays (fallback path), no crash.
  </verify>
  <done>The route create/edit Truck dropdown is populated from the carrier fleet, the form submits carrierTruckId, a route persists with carrierTruckId, the detail page shows the carrier truck (with legacy fallback), and no null-truck crash occurs on list/detail views.</done>
</task>

</tasks>

<verification>
- `cd apps/web && npx tsc --noEmit` — no NEW errors in touched files (baseline ~35 pre-existing errors unrelated to this change are acceptable).
- DB: `Route.carrierTruckId` column exists (nullable UUID FK to carrier_trucks), `Route.truckId` is nullable.
- Functional: /routes/new Truck dropdown shows carrier trucks; creating a route with a carrier truck persists `carrierTruckId` and the detail page displays it; existing legacy routes still render their truck.
</verification>

<success_criteria>
- Truck dropdown on /routes/new and /routes/{id}?mode=edit is populated from CarrierTruck, showing unitNumber/displayName.
- New routes create successfully with a `carrierTruckId` and no longer require legacy `truckId`.
- Legacy `truckId` column preserved and nullable; existing routes keep working and displaying their truck.
- Route detail shows the carrier truck for new routes, legacy truck for old routes, and does not crash when truck is null.
- Migration follows the shipped GPSLocation precedent (PascalCase `"Route"`, quoted camelCase `"carrierTruckId"`/`"truckId"`).
- Executor commits only; does NOT git push and does NOT run `vercel --prod` (user deploys).
</success_criteria>

<output>
After completion, create `.planning/quick/470-wire-routes-truck-dropdown-to-carrier-fl/470-SUMMARY.md` summarizing schema/migration, backend, and UI changes, plus any null-safety sites that were guarded.
</output>
