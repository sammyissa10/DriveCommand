---
phase: quick-520
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/schema.prisma
  - apps/web/prisma/migrations/20260811120000_end_stop_facility_and_matrix_cache/migration.sql
  - apps/web/src/lib/document-import/optimisation-constants.ts
  - apps/web/src/lib/document-import/optimisation-matrix.ts
  - apps/web/src/lib/document-import/optimisation-service.ts
  - apps/web/src/lib/carrier/route-template-save.ts
  - apps/web/src/lib/document-import/end-stop-lookup.ts
  - apps/web/src/lib/document-import/end-stop-service.ts
  - apps/web/src/actions/carrier/save-route-template.ts
  - apps/web/src/components/carrier/templates/RouteTemplateForm.tsx
  - apps/web/src/app/(owner)/carrier/templates/[id]/page.tsx
  - apps/web/src/lib/document-import/__tests__/matrix-cache.test.ts
  - apps/web/src/lib/document-import/__tests__/end-stop-designated-parking.test.ts
autonomous: true

must_haves:
  truths:
    - "A distance matrix computed for a facility set on one process is served from route_matrix_cache on a later, cold process — no provider call."
    - "A GET optimisation request never writes a row to route_matrix_cache; only the two accept-the-suggestion POSTs do."
    - "Changing one facility in the set produces a different key and therefore a fresh provider call."
    - "An L2 row older than MATRIX_L2_CACHE_TTL_MS is a miss; one inside it is a hit; a hit does not rewrite computed_at."
    - "A route template can store a DESIGNATED_PARKING facility, and an import that inherits that template resolves its end stop to that facility with source TEMPLATE."
    - "A stored per-trip DESIGNATED_PARKING choice still outranks the template's column."
    - "Reordering a template through applyTemplateOptimisation preserves its end_stop_facility_id."
    - "The template form's parking picker never offers a driver residence."
    - "No DDL is executed; the migration is written and marked applied, and _prisma_migrations shows it finished."
  artifacts:
    - path: "apps/web/prisma/migrations/20260811120000_end_stop_facility_and_matrix_cache/migration.sql"
      provides: "Idempotent record of the two already-live objects, resolved not run"
      contains: "IF NOT EXISTS"
    - path: "apps/web/src/lib/document-import/optimisation-matrix.ts"
      provides: "L1 in-process + L2 route_matrix_cache read-through, persist-gated write"
      contains: "MatrixStore"
    - path: "apps/web/src/lib/document-import/optimisation-constants.ts"
      provides: "MATRIX_L2_CACHE_TTL_MS, the only place the L2 ceiling is written"
      contains: "MATRIX_L2_CACHE_TTL_MS"
    - path: "apps/web/src/lib/carrier/route-template-save.ts"
      provides: "endStopFacilityId on the one template write path, validated"
      contains: "endStopFacilityId"
    - path: "apps/web/src/lib/document-import/end-stop-lookup.ts"
      provides: "Template parking facility as the second rung of the ladder's target"
      contains: "templateEndStopFacilityId"
    - path: "apps/web/src/components/carrier/templates/RouteTemplateForm.tsx"
      provides: "End stop policy select + conditional designated-parking facility picker"
      contains: "END_STOP_POLICY_LABELS"
    - path: "apps/web/src/lib/document-import/__tests__/matrix-cache.test.ts"
      provides: "Cold-start hit, changed-set miss, TTL boundary, persist:false writes nothing"
      contains: "MATRIX_L2_CACHE_TTL_MS"
    - path: "apps/web/src/lib/document-import/__tests__/end-stop-designated-parking.test.ts"
      provides: "Template DESIGNATED_PARKING resolves, and per-trip beats template"
      contains: "DESIGNATED_PARKING"
  key_links:
    - from: "applyImportOptimisation / applyTemplateOptimisation"
      to: "getDistanceMatrix"
      via: "persist: true threaded through importOptimisationFor / getTemplateOptimisation"
      pattern: "persist: true"
    - from: "getDistanceMatrix"
      to: "route_matrix_cache"
      via: "prismaMatrixStore(db) keyed on (orgId, matrixCacheKey(ids))"
      pattern: "routeMatrixCache"
    - from: "buildEndStopSlot"
      to: "route_templates.end_stop_facility_id"
      via: "EndStopContext.templateEndStopFacilityId as the DESIGNATED_PARKING fallback"
      pattern: "templateEndStopFacilityId"
    - from: "RouteTemplateForm"
      to: "saveRouteTemplateCore"
      via: "saveRouteTemplate server action carrying endStopPolicy + endStopFacilityId"
      pattern: "endStopFacilityId"
---

<objective>
Wire the two columns Phase 7 reported as gaps and that have since been applied to
production: `route_templates.end_stop_facility_id` (so a template can carry a
DESIGNATED_PARKING facility instead of degrading to a per-trip choice) and
`route_matrix_cache` (so the OSRM distance matrix survives a deploy and a cold
start instead of living only in one process's memory).

Purpose: spec Section 9 names three layers for the end stop policy — tenant
default, **template override**, per-trip choice — and the template rung could not
express `DESIGNATED_PARKING` because it had nowhere to put the facility id. Same
section says *"cache the matrix per ordered facility set"* so that "optimise once,
reuse daily" is true; in-process it is only true within one process.

Output: Prisma models + a resolved-not-run migration, a two-layer matrix cache, a
validated template parking facility on the one save path, the read path that
consumes it, the per-template UI control, and four new tests.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@apps/web/src/lib/document-import/optimisation-matrix.ts
@apps/web/src/lib/document-import/optimisation-constants.ts
@apps/web/src/lib/document-import/optimisation-service.ts
@apps/web/src/lib/document-import/end-stop-lookup.ts
@apps/web/src/lib/document-import/end-stop-service.ts
@apps/web/src/lib/document-import/end-stop-constants.ts
@apps/web/src/lib/carrier/route-template-save.ts
@apps/web/src/components/carrier/templates/RouteTemplateForm.tsx
@apps/web/prisma/migrations/20260806040500_add_resolution_provenance/migration.sql
</context>

<established_facts>
**Already verified. Do not re-derive; do not re-litigate. Read the files to write
accurate code, not to reopen these decisions.**

### The database — read off production (project `oqdhberkghtnszrkdvfm`) already
Both objects are **ALREADY LIVE**. This task runs **NO DDL**.

1. `route_templates.end_stop_facility_id uuid NULL`, FK
   `route_templates_end_stop_facility_id_fkey → facilities(id) ON DELETE SET NULL`.
2. `route_matrix_cache`: `id uuid PK default gen_random_uuid()`, `org_id uuid NOT NULL`,
   `facility_key text NOT NULL`, `miles jsonb NOT NULL`, `minutes jsonb NOT NULL`,
   `computed_at timestamptz NOT NULL default now()`.
   Constraints: `route_matrix_cache_pkey`, `route_matrix_cache_org_key_unique UNIQUE (org_id, facility_key)`.
   Indexes: pkey, org_key_unique, `route_matrix_cache_org_idx`.
   **There is NO `updated_at` column** — the Prisma model must not carry `@updatedAt`.
   `route_matrix_cache` has RLS disabled, zero policies, and grantees
   `anon,authenticated,postgres,service_role` — **no `app_user` grant**. Consistent
   with the incomplete RLS Phase 2 cutover. **Report it in the summary; do not run
   GRANT or ALTER.**

### The code, as it stands
- `optimisation-matrix.ts` (139 lines): in-process `Map`, `matrixCacheKey()` =
  `[...new Set(ids)].sort().join('>')`, `clearMatrixCache()`, `matrixCacheSize()`,
  `getDistanceMatrix(points)`. TTL + LRU already there.
- `getDistanceMatrix` has exactly two callers, both in `optimisation-service.ts`:
  line ~272 inside `importOptimisationFor`, line ~445 inside `getTemplateOptimisation`.
  **Both are read paths served by GETs** (`handleGetOptimisation`,
  `handleGetTemplateOptimisation` in `handlers.ts`, ~lines 890 and 908).
- The two mutations — `applyImportOptimisation` (line ~304) and
  `applyTemplateOptimisation` (line ~469) — reach the provider *through* those same
  two read functions. That is why `persist` has to be threaded, not just set at the
  bottom.
- `end-stop-lookup.ts`: `buildEndStopSlot` sets
  `designatedParkingFacilityId: stored?.policy === 'DESIGNATED_PARKING' ? stored.facilityId : null`
  and its comment says the template half *"has no column to hold a facility id"*.
  **That comment is now false and must be replaced, not left.**
- `end-stop-service.ts`: `ensureEndStopCommitted` hardcodes
  `designatedParkingFacilityId: null` (~line 330). `endStopCommitPlan` goes through
  `buildEndStopSlot`, so it inherits whatever the lookup resolves.
- `end-stop-constants.ts`: `DESIGNATED_PARKING_FACILITY_TYPES = ['yard','terminal','drop_yard']`;
  `DRIVER_RESIDENCE_FACILITY_TYPE = 'driver_residence'`. **A residence's type is not
  one of the three**, so filtering a picker by those three excludes residences
  structurally — that is "the Phase 7 filter" and it is why the picker is safe.
- `route-template-save.ts`: `saveRouteTemplateCore(db, orgId, data)` is the ONE place
  a template is written. It already carries `endStopPolicy?: string | null` with the
  documented `undefined` = leave alone / explicit `null` = clear distinction, and
  validates against its own local five-value list (deliberately not imported from the
  feature module).
- Other `saveRouteTemplateCore` callers: `template-service.ts` lines ~658 and ~1038
  (both **omit** `endStopPolicy` → undefined → column untouched; leave them alone),
  and `applyTemplateOptimisation` (**reconstructs a full payload — this is the trap**).
- `RouteTemplateForm.tsx` (774 lines) has **no end-stop control at all** today. It
  fetches its dropdown data client-side from `/api/v1/carrier/*`.
  `/api/v1/carrier/facilities?facility_type=X&pageSize=200` exists, applies
  `facilityVisibilityWhere(viewer)` and excludes `inactive_` server-side, and returns
  full facility rows at `data.items`.
- `templates/[id]/page.tsx` builds `RouteTemplateFormData` from `getRouteTemplate`
  (a `findFirst` with `include` and no `select`, so new scalars arrive free after
  `prisma generate`), and renders `<ResponsiveSwitch mobile={<TemplateEditMobile/>}
  desktop={<RouteTemplateForm/>}>`. **The mobile-web twins are out of scope** — they
  do not send the two fields, so `undefined` preserves the columns. Report the gap.
- The RN app has no route-template form (`endStop` appears in exactly one mobile
  file, the import card). Confirm before concluding; there is no mobile mirror here.
- Prisma `RouteTemplate` is at `apps/web/prisma/schema.prisma` ~line 2202,
  `@@map("route_templates")`, already carrying `endStopPolicy String? @map("end_stop_policy")`.
  The facility model is `CarrierFacility` (table `facilities`).
</established_facts>

<design_decisions>
**Settled. Encode them.**

### D1 — The cache is L1 (process) + L2 (`route_matrix_cache`), and a GET never writes L2
The suggestion path computes on read. So:
- Read order on every call: **L1 → L2 → provider.** Both layers are read from GETs
  and mutations alike; reading is not writing.
- On a provider compute: **always write L1. Write L2 only when `persist` is true.**
- `persist: true` is passed ONLY from `applyImportOptimisation` and
  `applyTemplateOptimisation`. Every GET path passes nothing and defaults to false.
- **State the honest consequence in the file header and in the summary:** a facility
  set that is only ever *viewed* and never accepted still pays one provider call per
  cold start, exactly as today. Making that case free would need a write from a GET
  (forbidden) or a background warm job (no cron/queue in scope). What L2 buys is that
  once a dispatcher **accepts** an order for a facility set, that set is free forever
  after — across deploys, cold starts and instances — which is the "optimise once,
  reuse daily" case Section 9 names.
- **Do NOT warm the cache from `saveRouteTemplateCore`.** `optimisation-service.ts`'s
  own header already argues this: a save that reached a routing provider would make
  writing a template depend on a network call.

### D2 — L2 shape, key, tenancy
- Same key as L1: `matrixCacheKey(ids)`. Structural invalidation unchanged.
- **Every L2 read and write carries `orgId` in the where clause.** The unique
  constraint is `(org_id, facility_key)`; the upsert targets that pair.
- **A hit must NOT refresh `computed_at`** — that would be a write on a read path.
  That is exactly why the L2 TTL is generous (D3).
- Make the store **injectable**: an exported `MatrixStore` interface plus a
  Prisma-backed implementation in the same file. That is what lets the cold-start
  test run without a database. CLAUDE.md's rule stands — a faked DB in a unit test is
  not evidence about SQL, so the fake proves the **layering**, and the column names
  were verified against `information_schema` (done), not inferred.
- **Degrade, never throw.** An L2 read or write that fails is logged and treated as a
  miss / a no-op. The matrix is a suggestion; an unreachable cache table must never
  become an error a dispatcher sees.

### D3 — `MATRIX_L2_CACHE_TTL_MS = 30 days`, and it is a different number on purpose
New constant in `optimisation-constants.ts`, in the existing "The matrix cache"
section beside `MATRIX_CACHE_TTL_MS`. Document in that file's voice:
- The L1 TTL (24h) is a backstop **inside one process's lifetime**, and a process
  rarely lives that long anyway.
- The L2 row's entire purpose is to survive deploys and cold starts, so giving it the
  L1 TTL would defeat the feature for any template that runs weekly rather than daily.
- The ceiling exists at all for the one thing the structural key cannot see: a
  facility that gets **re-geocoded**. The key is the id list, and an id whose
  coordinates were corrected has the same id — so the only thing that eventually
  retires a wrong matrix is time. 30 days bounds how long a corrected geocode can be
  masked while still letting a daily or weekly template hit indefinitely.
- Because a read does not refresh `computed_at`, a row is recomputed once every 30
  days per set and no more.
- **Report as a gap, do not build:** re-geocoding a facility should ideally delete
  that org's cache rows naming it. No such hook exists and inventing one is out of scope.
- Tests import the constant. **No tuned number restated as a literal anywhere**, per
  that file's header rule.

### D4 — DESIGNATED_PARKING storage
- **Prisma:** `endStopFacilityId String? @map("end_stop_facility_id") @db.Uuid` on
  `RouteTemplate`. **Scalar only — no Prisma relation field**, which would force a
  back-relation on `CarrierFacility` for no benefit; the FK exists in the database and
  the drift scan compares columns. New `RouteMatrixCache` model per the verified
  column list: **no `@updatedAt`**, `@@unique([orgId, facilityKey])`, `@@index([orgId])`,
  `@@map("route_matrix_cache")`, **no tenant relation**.
- **Save path:** `SaveRouteTemplateCore` gains `endStopFacilityId?: string | null` with
  the SAME `undefined`/`null` semantics `endStopPolicy` documents. Validation before write:
  the facility must belong to `orgId`, must not be `inactive_`-prefixed, and must not
  be a driver residence (mirror `setEndStopChoice`'s rule and message). It is only
  meaningful under `DESIGNATED_PARKING`: when the policy being written is any other
  value, the facility is cleared to `null` rather than left dangling.
- **TRAP — `applyTemplateOptimisation` must not wipe it.** It re-saves the whole
  template through `saveRouteTemplateCore` from an explicit `select` list. If
  `endStopFacilityId` is missing from BOTH the select and the payload, reordering a
  template silently deletes its designated parking.
- **Read path:** `EndStopContext` gains the template's parking facility id;
  `loadEndStopContext` selects it and adds it to `wanted` so its display row loads.
  `buildEndStopSlot` resolves `designatedParkingFacilityId` as **the stored per-trip
  MANUAL choice first, falling back to the template's column** — the per-trip rung
  outranks the template rung, which is Section 9's order and must not be inverted.
- **`ensureEndStopCommitted`** must pass the template's column instead of `null`;
  today a template-level DESIGNATED_PARKING commits as `NEEDS_CHOICE` with no facility.
- **`getTemplateOptimisation`** resolves `endFacilityId` for `HOME_BASE` and
  `RETURN_TO_ORIGIN` only. Add `DESIGNATED_PARKING → template.endStopFacilityId`.
- **UI:** `RouteTemplateForm.tsx` gains a policy select over the five values labelled
  from `END_STOP_POLICY_LABELS` (the two surfaces must not name a policy differently)
  plus a facility picker shown **only** when the policy is `DESIGNATED_PARKING`. The
  candidate list uses the Phase 7 filter. Match the form's existing field markup
  exactly; introduce no new pattern.

### D5 — Migration, resolved not run
One directory under `apps/web/prisma/migrations/`, timestamped today, covering BOTH
items, idempotent `IF NOT EXISTS` SQL mirroring exactly what is live, with a header
comment in the style of `20260806040500_add_resolution_provenance`. Marked applied
with `npx prisma migrate resolve --applied` (which writes only to `_prisma_migrations`
— not DDL) and **verified with a real `SELECT` through the Supabase MCP**, pasted into
the summary. `npx prisma generate` must run so `db.routeMatrixCache` and the new field
typecheck.
</design_decisions>

<constraints>
- **Run NO DDL.** Both objects are live. `prisma migrate resolve --applied` and
  `prisma generate` are allowed. `migrate deploy`, `migrate dev`, `db push`, and any
  `ALTER` / `CREATE` / `GRANT` are **forbidden**.
- **Install nothing** on either app.
- Tenant-scope every cache read and write.
- **No writes in view paths.**
- Do not weaken or delete any existing test or fixture to make a run green.
- Do NOT commit at the end of Tasks 1–4 — leave each in a consistent state and let
  Task 5 make one code commit with the exact message below.
- Do NOT `git push`. The orchestrator pushes once at the end.
</constraints>

<tasks>

<task type="auto">
  <name>Task 1: Prisma models + resolved-not-run migration</name>
  <files>
apps/web/prisma/schema.prisma
apps/web/prisma/migrations/20260811120000_end_stop_facility_and_matrix_cache/migration.sql
  </files>
  <action>
Schema (`apps/web/prisma/schema.prisma`):

1. On `model RouteTemplate` (~line 2202), in the existing "Document Import (Phase 1,
   spec Sections 6 + 8 + 9)" block directly under `endStopPolicy`, add:

   `endStopFacilityId String? @map("end_stop_facility_id") @db.Uuid`

   with a short comment saying it is only read when the policy is
   `DESIGNATED_PARKING`, and that it is a **scalar with no Prisma relation
   deliberately** — the FK `route_templates_end_stop_facility_id_fkey →
   facilities(id) ON DELETE SET NULL` exists in the database, and declaring a
   relation would force a back-relation on `CarrierFacility` for no benefit.
   **Do not add any field to `CarrierFacility`.**

2. Add a new model, placed near the other document-import models:

   ```
   model RouteMatrixCache {
     id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
     orgId       String   @map("org_id") @db.Uuid
     facilityKey String   @map("facility_key")
     miles       Json
     minutes     Json
     computedAt  DateTime @default(now()) @map("computed_at") @db.Timestamptz

     @@unique([orgId, facilityKey], map: "route_matrix_cache_org_key_unique")
     @@index([orgId], map: "route_matrix_cache_org_idx")
     @@map("route_matrix_cache")
   }
   ```

   Header comment must state three things: **there is no `updated_at` column**, so
   no `@updatedAt` (a hit deliberately does not refresh `computed_at` — see D1/D3);
   **no tenant relation**, because the table is a derived cache and a relation would
   invent an FK the database does not have; and that the columns were read off
   production, not inferred.

Migration — create
`apps/web/prisma/migrations/20260811120000_end_stop_facility_and_matrix_cache/migration.sql`
in the style of `20260806040500_add_resolution_provenance/migration.sql`: a header
comment saying ADDITIVE ONLY, that both objects were already applied to production
before this file was written and are marked applied with
`prisma migrate resolve --applied` rather than replayed (per DEC-3 rules 1 and 4 —
there is no non-production database to replay against), and that it is idempotent
regardless. Body, mirroring exactly what is live:

```sql
ALTER TABLE route_templates ADD COLUMN IF NOT EXISTS end_stop_facility_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'route_templates_end_stop_facility_id_fkey') THEN
    ALTER TABLE route_templates
      ADD CONSTRAINT route_templates_end_stop_facility_id_fkey
      FOREIGN KEY (end_stop_facility_id) REFERENCES facilities(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS route_matrix_cache (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL,
  facility_key TEXT NOT NULL,
  miles        JSONB NOT NULL,
  minutes      JSONB NOT NULL,
  computed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS route_matrix_cache_org_key_unique ON route_matrix_cache (org_id, facility_key);
CREATE INDEX IF NOT EXISTS route_matrix_cache_org_idx ON route_matrix_cache (org_id);
```

Then, from `apps/web`:
- `npx prisma migrate resolve --applied 20260811120000_end_stop_facility_and_matrix_cache`
- `npx prisma generate`

Finally, verify through the **Supabase MCP** (one statement per call — CLAUDE.md:
`execute_sql` returns only the last statement's result):
`SELECT migration_name, applied_steps_count, finished_at FROM _prisma_migrations WHERE migration_name = '20260811120000_end_stop_facility_and_matrix_cache';`
Keep the real output verbatim for the summary.
  </action>
  <verify>
`npx prisma generate` succeeds and `apps/web/src/generated/prisma` exposes
`routeMatrixCache` and `RouteTemplate.endStopFacilityId`. The `_prisma_migrations`
SELECT returns one row with a non-null `finished_at`. No `ALTER`/`CREATE` was executed
against the database by you.
  </verify>
  <done>
Both Prisma models compile, the migration directory exists and is marked applied, and
the real `_prisma_migrations` row is captured for the summary.
  </done>
</task>

<task type="auto">
  <name>Task 2: Two-layer matrix cache, with L2 written only from the accept paths</name>
  <files>
apps/web/src/lib/document-import/optimisation-constants.ts
apps/web/src/lib/document-import/optimisation-matrix.ts
apps/web/src/lib/document-import/optimisation-service.ts
  </files>
  <action>
**`optimisation-constants.ts`** — add `MATRIX_L2_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000`
to the existing "The matrix cache" section, directly after `MATRIX_CACHE_TTL_MS`.
Doc comment in that file's established voice, carrying D3's whole argument: why it is
deliberately a **different** number from the 24h L1 TTL (L1 is a backstop inside one
process's lifetime; L2's entire purpose is to survive deploys, so copying the L1 value
would defeat the feature for a weekly template); why there is a ceiling at all (a
**re-geocoded** facility keeps its id, so the structural key cannot see the change and
only time retires a wrong matrix); and that because a hit does not refresh
`computed_at`, a set is recomputed once every 30 days and no more. Also update the
`MATRIX_CACHE_MAX_ENTRIES` comment, which currently asserts "there is no cache table
and this phase writes no DDL" — there is one now, and this bound is only about L1.

**`optimisation-matrix.ts`** — rewrite the "WHY THE CACHE IS IN PROCESS" header section
into "L1 IN PROCESS, L2 IN `route_matrix_cache`". It must state, plainly:
read order is L1 → L2 → provider; a provider compute always writes L1 but writes L2
**only when the caller passes `persist: true`**; `persist: true` comes only from the
two accept-the-suggestion POSTs; and therefore **a facility set that is only ever
viewed and never accepted still pays one provider call per cold start, exactly as
before** — making that free would need a write from a GET or a background warm job,
neither of which is in scope. What L2 buys is that an accepted set is free forever
after, across deploys and instances, which is Section 9's "optimise once, reuse daily".

Then:

1. Export the store seam:
   ```ts
   export interface MatrixStoreRow { miles: number[][]; minutes: number[][]; computedAt: Date }
   export interface MatrixStore {
     read(orgId: string, key: string): Promise<MatrixStoreRow | null>;
     write(orgId: string, key: string, row: { miles: number[][]; minutes: number[][] }): Promise<void>;
   }
   export function prismaMatrixStore(db: PrismaClient): MatrixStore
   ```
   `prismaMatrixStore.read` → `db.routeMatrixCache.findFirst({ where: { orgId, facilityKey: key }, select: { miles: true, minutes: true, computedAt: true } })`.
   `prismaMatrixStore.write` → `db.routeMatrixCache.upsert({ where: { orgId_facilityKey: { orgId, facilityKey: key } }, create: {...}, update: { miles, minutes, computedAt: new Date() } })`.
   Confirm the generated compound-unique input name against
   `apps/web/src/generated/prisma` rather than assuming `orgId_facilityKey`.
   **Both methods wrap their body in try/catch, log through `logger`, and return
   `null` / resolve quietly on failure.** Degrade, never throw — an unreachable cache
   table must never surface as an error a dispatcher sees.

2. `getDistanceMatrix(points, options?)` where
   `options?: { orgId: string; store?: MatrixStore | null; persist?: boolean }`.
   Omitting `options` must behave exactly as today (L1 only) so nothing silently
   changes for a caller that has no org in hand.

   After the existing L1 miss and before the provider call, when `options?.store` and
   `options.orgId` are present:
   - `const row = await store.read(orgId, key)`
   - miss if `null`, or if `now - row.computedAt.getTime() > MATRIX_L2_CACHE_TTL_MS`,
     or if the grids fail a dimension check. Write a small local
     `asMatrixGrid(value: unknown, size: number): number[][] | null` that rejects
     anything that is not `size × size` of finite numbers — jsonb comes back as
     `Prisma.JsonValue`, and a row written by an older code version must be a miss
     rather than a cast.
   - on a hit, seed L1 **with the row's `computedAt`, not `now`**, so the 24h L1
     backstop is measured from when the matrix was actually computed; then return
     `{ ids, miles, minutes }`. Build `ids` from the `ids` array already in scope —
     do not reconstruct it by splitting the key.
   - **Never call `store.write` on a hit.** `computed_at` is not refreshed by a read.

3. After a successful provider compute: `writeCache(...)` as today (L1, always), then
   `if (options?.persist && options.store && options.orgId) await store.write(...)`.

**`optimisation-service.ts`**:
- Update the file header's closing line — it currently says "NO DDL. Nothing in this
  file adds a column; the matrix cache is in process". Replace with the L1/L2 + persist
  rule and keep the NO DDL claim true for this file.
- `importOptimisationFor(orgId, userId, record, viewer, options?: { persist?: boolean })`.
  At the `getDistanceMatrix` call (~line 272) pass
  `{ orgId, store: prismaMatrixStore(db), persist: options?.persist === true }`.
- `getTemplateOptimisation(orgId, userId, templateId, options?: { persist?: boolean })`,
  same treatment at ~line 445.
- `applyImportOptimisation` → `importOptimisationFor(orgId, userId, record, viewer, { persist: true })`.
- `applyTemplateOptimisation` → `getTemplateOptimisation(orgId, userId, templateId, { persist: true })`.
- Leave the read wrapper at line ~216 and **every call site in `handlers.ts`
  unchanged** — the GET paths must keep the default `persist: false`. Grep
  `handlers.ts` afterwards to confirm no GET handler acquired a `persist` argument.
  </action>
  <verify>
`npx tsc --noEmit` in `apps/web` is clean (see the close-out probe rule in Task 5 —
do not trust a green run yet). Grep confirms `persist: true` appears in exactly two
places, both inside `apply*` functions. Grep confirms `MATRIX_L2_CACHE_TTL_MS` appears
in `optimisation-constants.ts` (definition), `optimisation-matrix.ts` (import), and
nowhere else outside tests.
  </verify>
  <done>
`getDistanceMatrix` reads L1 → L2 → provider, writes L1 always and L2 only under
`persist: true`, never refreshes `computed_at` on a hit, tenant-scopes both L2
operations, and degrades to a miss on any store failure.
  </done>
</task>

<task type="auto">
  <name>Task 3: DESIGNATED_PARKING storage — save path, read path, and the reorder trap</name>
  <files>
apps/web/src/lib/carrier/route-template-save.ts
apps/web/src/lib/document-import/optimisation-service.ts
apps/web/src/lib/document-import/end-stop-lookup.ts
apps/web/src/lib/document-import/end-stop-service.ts
  </files>
  <action>
**`route-template-save.ts`** — add `endStopFacilityId?: string | null` to
`SaveRouteTemplateCore`, doc-commented with the same `undefined` = leave alone /
explicit `null` = clear distinction `endStopPolicy` already carries, plus: it is only
read when the policy is `DESIGNATED_PARKING`, and it is validated rather than trusted
because it is a raw uuid arriving from a form.

Validation, placed with the other ownership checks:

- Resolve what to write into a local `endStopFacilityUpdate: string | null | undefined`.
- If `endStopFacilityId` is a non-empty string:
  - **Require `endStopPolicy === 'DESIGNATED_PARKING'` in the SAME payload.** Otherwise
    return `{ success: false, error: 'Only designated parking takes a facility.' }`.
    This deliberately avoids a second read of the existing row to discover the current
    policy; every caller that sets a facility also states the policy. Say so in a comment.
  - Load it: `db.carrierFacility.findFirst({ where: { id, orgId, NOT: { facilityType: { startsWith: 'inactive_' } } }, select: { id: true, isDriverResidence: true } })`.
    Not found → `'That facility is not available.'`
  - `isDriverResidence` → mirror `setEndStopChoice`'s message exactly:
    `'A driver’s home cannot be designated parking. Choose the driver’s home policy instead.'`
    (`end-stop-service.ts` ~line 238 — copy the string including the typographic
    apostrophe). This core has no `viewer`, so the rule is unconditional; note in a
    comment that the residence check here guards the *write*, the same division
    `setEndStopChoice` documents.
- Else if `endStopFacilityId === null` → clear.
- **And regardless of the above: if `endStopPolicy` is being written to any value
  other than `'DESIGNATED_PARKING'`, force `endStopFacilityUpdate = null`** — a
  template must not carry a parking facility its policy will never read. Comment it.
- Spread into `templateData` as
  `...(endStopFacilityUpdate !== undefined ? { endStopFacilityId: endStopFacilityUpdate } : {})`.

**`optimisation-service.ts` — the two changes that keep this from being silently lost:**

1. `applyTemplateOptimisation` (~line 485): add `endStopFacilityId: true` to the
   `select`, and `endStopFacilityId: template.endStopFacilityId ?? undefined` to the
   `saveRouteTemplateCore` payload, immediately after the existing `endStopPolicy`
   line. Add a comment naming the failure this prevents: without it, reordering a
   template deletes its designated parking. Then check `template-service.ts` lines
   ~658 and ~1038: both **omit** the field, so both leave the column alone — confirm
   that by reading, and leave them unchanged.

2. `getTemplateOptimisation` (~line 380): add `endStopFacilityId: true` to the template
   `select`, and extend the `endFacilityId` resolution with
   `resolution.policy === 'DESIGNATED_PARKING' ? template.endStopFacilityId : ...`.

   **TRAP — `startFacilityId = endFacilityId` on the next line is only correct today
   because `endFacilityId` is null for the other three policies.** Adding
   DESIGNATED_PARKING would turn an open route into a closed loop starting at the
   yard. Mirror `importOptimisationFor` exactly:
   ```ts
   const closedLoop = resolution.policy === 'HOME_BASE' || resolution.policy === 'RETURN_TO_ORIGIN';
   const startFacilityId = closedLoop ? endFacilityId : null;
   ```
   with a comment pointing at the sibling in `importOptimisationFor` (~line 238).

**`end-stop-lookup.ts`**:
- `EndStopContext` gains `templateEndStopFacilityId: string | null`, doc-commented as
  `route_templates.end_stop_facility_id` on the selected template.
- `loadEndStopContext`: add `endStopFacilityId: true` to the `routeTemplate.findFirst`
  select; add `template?.endStopFacilityId ?? null` to the `wanted` array so the
  display row is loaded; return it on the context.
- `buildEndStopSlot`: **replace** the now-false comment (*"the template half has no
  column to hold a facility id (see 07-SUMMARY.md)"*) with the real rule, and change
  the field to:
  ```ts
  designatedParkingFacilityId:
    (stored?.policy === 'DESIGNATED_PARKING' ? stored.facilityId : null)
    ?? context.templateEndStopFacilityId,
  ```
  Comment: the per-trip rung outranks the template rung — Section 9's order — and the
  `??` is safe because a stored decision that is not `DESIGNATED_PARKING` resolves to
  a different policy anyway, so the fallback can never smuggle a parking facility into
  a trip that chose `NONE`.

**`end-stop-service.ts`** — `ensureEndStopCommitted` (~line 330): replace
`designatedParkingFacilityId: null` with `context.templateEndStopFacilityId`, and
comment that a template-level `DESIGNATED_PARKING` previously committed as
`NEEDS_CHOICE` with no facility. Then **read** `endStopCommitPlan` and confirm it
inherits the same resolution through `buildEndStopSlot` — verify, do not assume; say
which line proves it in the summary.
  </action>
  <verify>
Grep `endStopFacilityId` across `apps/web/src` and confirm it appears in: the schema,
the save core (type + validation + spread), `applyTemplateOptimisation` (select AND
payload), `getTemplateOptimisation` (select AND the policy ternary), and
`loadEndStopContext`. Confirm `startFacilityId` in `getTemplateOptimisation` is now
gated on `closedLoop`. Confirm no `designatedParkingFacilityId: null` literal remains
in `end-stop-service.ts`.
  </verify>
  <done>
A template can store a validated parking facility; the ladder reads it as the second
rung with the per-trip choice still winning; `ensureEndStopCommitted` commits it; the
template optimiser targets it without turning the route into a false loop; and
reordering a template preserves it.
  </done>
</task>

<task type="auto">
  <name>Task 4: The per-template end-stop override UI</name>
  <files>
apps/web/src/actions/carrier/save-route-template.ts
apps/web/src/components/carrier/templates/RouteTemplateForm.tsx
apps/web/src/app/(owner)/carrier/templates/[id]/page.tsx
  </files>
  <action>
**`actions/carrier/save-route-template.ts`** — add `endStopPolicy?: string | null;` and
`endStopFacilityId?: string | null;` to `SaveRouteTemplateInput`. Nothing else changes;
the action already spreads `data` straight into `saveRouteTemplateCore`.

**`RouteTemplateForm.tsx`**:
- Import `END_STOP_POLICIES`, `END_STOP_POLICY_LABELS` and
  `DESIGNATED_PARKING_FACILITY_TYPES` from
  `@/lib/document-import/end-stop-constants`. (This is a UI component, not the carrier
  lib layer — `route-template-save.ts` restates its list deliberately so the carrier
  layer does not depend on a feature module; a component may import labels, and D4
  requires it so the two surfaces cannot name a policy differently. Note this in a
  one-line comment so the next reader does not "fix" the apparent inconsistency.)
- `RouteTemplateFormData` gains `endStopPolicy: string | null` and
  `endStopFacilityId: string | null`.
- Two state vars, defaulting from `initialData` (`?? ''`). Use a sentinel for "no
  override" — Radix `Select` cannot hold an empty string value — e.g. `'__default__'`,
  mapped back to `null` on submit.
- A new field group, placed after "Notes" and before the stop builder, matching the
  file's existing `Label` + `Select` + `SelectTrigger`/`SelectContent`/`SelectItem`
  markup byte-for-byte in shape:
  - **End stop** select: first item "Use company default", then the five policies in
    `END_STOP_POLICIES` order labelled from `END_STOP_POLICY_LABELS`. Helper text
    under it: one sentence saying this overrides the company default and that a
    dispatcher can still choose differently for a single trip.
  - **Designated parking** select, rendered **only** when the policy state is
    `'DESIGNATED_PARKING'` — the picker must not be reachable without the select.
    Its options come from a `useEffect` that runs when the policy becomes
    `DESIGNATED_PARKING`, issuing one `fetch` per entry in
    `DESIGNATED_PARKING_FACILITY_TYPES`:
    `/api/v1/carrier/facilities?facility_type=${type}&pageSize=200`, then concat,
    de-duplicate by id, and sort by name. Follow the existing loaders' shape exactly:
    `Promise.all`, `if (!res.ok) return`, read `data.data?.items ?? []`, swallow errors.
    Comment why three fetches: the endpoint takes a single `facility_type`, and the
    three-type filter **is** the Phase 7 filter — a driver residence carries
    `facilityType === 'driver_residence'` (`DRIVER_RESIDENCE_FACILITY_TYPE`), which is
    not one of the three, so residences are excluded structurally rather than by a
    client-side hide. Option label: `name` plus `city, state` when present, matching
    how the stop builder renders a facility.
  - Clear the facility state whenever the policy moves away from
    `DESIGNATED_PARKING`, so a stale id is never submitted.
- `validate()`: if the policy is `DESIGNATED_PARKING` and no facility is chosen, set
  `errors.endStopFacilityId = 'Pick where the truck parks at the end of the day.'` and
  fail. Render the error the same way the other fields do.
- `handleSubmit`: send
  `endStopPolicy: endStopPolicy === '__default__' ? null : endStopPolicy` and
  `endStopFacilityId: endStopPolicy === 'DESIGNATED_PARKING' ? (endStopFacilityId || null) : null`.

**`templates/[id]/page.tsx`** — add `endStopPolicy: template.endStopPolicy ?? null` and
`endStopFacilityId: template.endStopFacilityId ?? null` to the `formData` object.
`getRouteTemplate` is a `findFirst` with `include` and no `select`, so both scalars are
already on `template` after Task 1's `prisma generate`. `templates/new/page.tsx` needs
no change — it renders `<RouteTemplateForm />` with no `initialData`.

**Out of scope, and to be REPORTED in the summary rather than built:**
`TemplateEditMobile.tsx` and `NewTemplateMobile.tsx` (the `lg:hidden` mobile-web twins
rendered by `ResponsiveSwitch`) do not gain the control. Read both and **confirm**
neither sends `endStopPolicy` or `endStopFacilityId` — omitted means `undefined` means
the columns are preserved, so editing a template on a phone browser cannot wipe an
override. State that verification explicitly. Also confirm the RN app has no
route-template form (grep `apps/mobile` for `routeTemplate`/`saveRouteTemplate`), so
there is no native mirror to keep in step.
  </action>
  <verify>
`npx tsc --noEmit` in `apps/web`. Manually reason through the render: with the policy
unset the parking picker is absent from the tree entirely (not merely hidden). Grep
`TemplateEditMobile.tsx` and `NewTemplateMobile.tsx` for `endStop` and confirm zero hits.
  </verify>
  <done>
The desktop template form can set an end-stop override, and can set a parking facility
only under `DESIGNATED_PARKING`, chosen from a list that structurally cannot contain a
driver residence. Editing a template on the mobile-web twin preserves both columns.
  </done>
</task>

<task type="auto">
  <name>Task 5: Tests, close-out gates, and the single code commit</name>
  <files>
apps/web/src/lib/document-import/__tests__/matrix-cache.test.ts
apps/web/src/lib/document-import/__tests__/end-stop-designated-parking.test.ts
  </files>
  <action>
**`matrix-cache.test.ts`** — a header in the established voice stating what these pin.
Import `MATRIX_L2_CACHE_TTL_MS` from `../optimisation-constants`; **no literal
restatement of any tuned number**, per that file's header rule. Build an in-memory
fake `MatrixStore` (a `Map` plus a settable `computedAt`) and a stubbed provider —
`vi.mock('@/lib/geo/osrm')` for `getOSRMMatrix`, with a call counter. Call
`clearMatrixCache()` in `beforeEach` so every case starts from a genuinely cold L1.

1. **Cold-start hit.** Fake store pre-seeded with the row for `matrixCacheKey(ids)`;
   `getDistanceMatrix(points, { orgId, store, persist: false })` returns the matrix
   intact (ids in sorted order, grids equal) and the provider counter is **0**.
2. **Changed set is a miss.** One facility id different ⇒ a different
   `matrixCacheKey` ⇒ the seeded row does not match ⇒ the provider is called once.
   Also assert the key's own properties directly: order-insensitive and
   duplicate-insensitive for the same set, different for a different set.
3. **TTL boundary.** `computedAt = now - MATRIX_L2_CACHE_TTL_MS - 1000` is a miss (the
   provider is called); `now - MATRIX_L2_CACHE_TTL_MS + 1000` is a hit (it is not).
   Drive the clock with `vi.setSystemTime` rather than sleeping.
4. **`persist: false` never writes.** Cold L1, empty store, provider returns a matrix;
   afterwards the fake store's write count is **0** and `matrixCacheSize()` is 1.
   Then the same call with `persist: true` writes exactly one row keyed on
   `(orgId, matrixCacheKey(ids))`. This is the "no writes in view paths" rule made
   executable — say so in the test name.
5. **A hit does not rewrite `computed_at`.** After case 1, the fake store's write
   count is still 0.
6. **A throwing store is a miss, not an error.** A store whose `read` rejects still
   produces a matrix via the provider; a store whose `write` rejects still returns the
   matrix. Nothing propagates.

**`end-stop-designated-parking.test.ts`** — pure, no database:
1. A template-level `DESIGNATED_PARKING` with the template's facility resolves
   `RESOLVED` at that facility, with `source: 'TEMPLATE'`, driven through
   `resolveEndStopPolicy` → `endStopTargetFor` → `buildEndStopSlot` on a hand-built
   `EndStopContext` (mirror the fixture style already in `end-stop.test.ts`).
2. **Precedence:** a stored per-trip `DESIGNATED_PARKING` choice naming a different
   facility beats the template's column. Assert the resolved facility is the trip's.
3. A stored decision of a **different** policy (e.g. `NONE`) with the template column
   still set does not smuggle the parking facility in — the resolved policy is `NONE`
   and the facility is null.
4. With no stored decision and no template column, `DESIGNATED_PARKING` still reports
   `NEEDS_CHOICE` exactly as `end-stop.test.ts` already asserts — confirm that existing
   test still passes untouched.

**Do not weaken or delete any existing test or fixture.**

---

**CLOSE-OUT — carry out and report VERBATIM, not summarised:**

1. **`tsc --noEmit` in BOTH apps, with a deliberate probe.** CLAUDE.md's blind-gate
   rule: a parse error anywhere in the program suppresses semantic checking of
   everything, so a clean run must be *proved*, not believed.
   - In `apps/web`: inject `const __probe: number = 'y';` into a file you actually
     edited (e.g. `optimisation-matrix.ts`), run `npx tsc --noEmit`, and confirm tsc
     reports **that** error at that line. **Delete the probe.** Re-run and paste the
     real output. If the only errors are inside `.next/`, the gate is blind: delete
     `apps/web/.next/dev/types/validator.ts` and `apps/web/tsconfig.tsbuildinfo`, then
     re-run. Also check for and delete any stray `__probe.ts` left by an earlier run.
   - Repeat the same probe-and-delete cycle in `apps/mobile`.
2. **`npx vitest run src/lib/document-import` from `apps/web`.** Paste the real output,
   including the pass/fail counts. Every pre-existing test must still pass.
3. **Commit — one commit for all code work, exactly:**
   `feat: designated parking storage and persistent matrix cache (quick-520)`
   **Do not `git push`.** The orchestrator pushes once at the end.
4. **Report as gaps in the summary; do not fix:**
   - `route_matrix_cache` has RLS disabled, zero policies, and **no `app_user` grant**
     (grantees are `anon, authenticated, postgres, service_role`) — consistent with the
     incomplete RLS Phase 2 cutover, and it will return zero rows the day
     `DATABASE_URL` flips to `app_user`.
   - No hook invalidates cache rows when a facility is **re-geocoded**; only
     `MATRIX_L2_CACHE_TTL_MS` retires them.
   - A viewed-but-never-accepted facility set still pays one provider call per cold
     start, by design (D1).
   - The mobile-web template twins have no end-stop control (columns preserved, not
     editable there).
   - `DocumentProfile.defaultEndStopPolicy` remains deliberately unwired.
5. Include the real `_prisma_migrations` SELECT output from Task 1.
  </action>
  <verify>
Both `tsc` runs are clean **and probed** (the probe error was observed and then
removed). `npx vitest run src/lib/document-import` passes with the new files included
and no pre-existing test regressed. `git log -1` shows the exact commit message and
`git status` is clean.
  </verify>
  <done>
Four behaviours are pinned by tests that import their constants rather than restating
them, both type gates are proved rather than assumed, the work is in one commit, and
the five gaps are written down.
  </done>
</task>

</tasks>

<verification>
1. `npx prisma generate` in `apps/web` succeeds; `db.routeMatrixCache` and
   `RouteTemplate.endStopFacilityId` typecheck.
2. `_prisma_migrations` contains
   `20260811120000_end_stop_facility_and_matrix_cache` with a non-null `finished_at`,
   proved by a real Supabase MCP query pasted into the summary.
3. `persist: true` appears exactly twice, both inside `apply*` functions; no GET
   handler in `handlers.ts` passes it.
4. `MATRIX_L2_CACHE_TTL_MS` is defined once and imported everywhere else, tests included.
5. `endStopFacilityId` is present in `applyTemplateOptimisation`'s **select and
   payload** — the reorder-wipes-parking trap.
6. `getTemplateOptimisation`'s `startFacilityId` is gated on `closedLoop`, not equal to
   `endFacilityId`.
7. The parking picker's option list is filtered to
   `DESIGNATED_PARKING_FACILITY_TYPES`, which excludes `driver_residence` structurally.
8. `npx vitest run src/lib/document-import` passes, new tests included, nothing weakened.
9. `tsc --noEmit` clean in both apps, each proved with an injected-then-deleted probe.
10. No DDL was executed; no dependency was installed.
</verification>

<success_criteria>
- A template stores a validated `DESIGNATED_PARKING` facility, and the Section 9 ladder
  reads it as the template rung with the per-trip choice still outranking it.
- Reordering a template through the optimiser does not delete that facility.
- An accepted optimisation writes one `route_matrix_cache` row scoped to its org; a
  later cold process serves the same facility set from it with no provider call.
- No GET writes to `route_matrix_cache`, and no read refreshes `computed_at`.
- The migration is recorded and marked applied without a single DDL statement being run
  by this task.
- The five known gaps are reported in the summary rather than silently absorbed.
</success_criteria>

<output>
After completion, create
`.planning/quick/520-wire-the-two-applied-columns-designated-/520-SUMMARY.md`.
It must contain, verbatim rather than summarised: the probed `tsc` output for both
apps, the `npx vitest run src/lib/document-import` output, and the real
`_prisma_migrations` SELECT result. Plus the five reported gaps and any CLAUDE.md
"Phase History (Document Import)" line worth adding for the L1/L2 persist rule.
</output>
</content>
</invoke>
