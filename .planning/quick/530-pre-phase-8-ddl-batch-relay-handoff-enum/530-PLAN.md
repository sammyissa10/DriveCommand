---
phase: quick-530
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/migrations/20260823120000_route_template_stops_relay_handoff/migration.sql
  - apps/web/prisma/migrations/20260823120100_facilities_deleted_at/migration.sql
  - apps/web/prisma/migrations/20260823120200_facilities_country_normalise/migration.sql
  - apps/web/prisma/schema.prisma
  - apps/web/src/lib/carrier/facilities.ts
  - apps/web/src/lib/carrier/facility-visibility.ts
  - apps/web/src/lib/carrier/loads.ts
  - apps/web/src/lib/carrier/route-template-save.ts
  - apps/web/src/lib/carrier/stops.ts
  - apps/web/src/lib/carrier/fleet-drivers.ts
  - apps/web/src/lib/document-import/facility-lookup.ts
  - apps/web/src/lib/document-import/end-stop-lookup.ts
  - apps/web/src/lib/document-import/end-stop-service.ts
  - apps/web/src/app/(owner)/carrier/loads/new/page.tsx
  - apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx
  - apps/web/src/app/(owner)/carrier/templates/new/page.tsx
  - apps/web/src/app/(owner)/carrier/templates/[id]/page.tsx
  - apps/web/src/app/(owner)/carrier/trips/[id]/page.tsx
  - apps/web/src/app/(owner)/carrier/trips/[id]/plan/page.tsx
  - apps/web/src/app/(owner)/carrier/trips/[id]/stops/page.tsx
  - apps/web/src/app/(driver)/carrier/driver/trips/page.tsx
autonomous: true

must_haves:
  truths:
    - "route_template_stops accepts a stop_type of 'relay_handoff' and its CHECK reads identically in shape to stops_stop_type_check"
    - "A facility can be soft-deleted by stamping facilities.deleted_at, and its facility_type is left untouched and constraint-legal"
    - "A soft-deleted facility disappears from every picker and every ownership/validation lookup"
    - "A soft-deleted facility still hydrates by name on a trip, load or itinerary it is already attached to"
    - "facilities.country holds only 'US' in production"
    - "All three new migrations are recorded in _prisma_migrations as resolved-not-run"
  artifacts:
    - path: "apps/web/prisma/migrations/20260823120000_route_template_stops_relay_handoff/migration.sql"
      provides: "Mirror of the route_template_stops CHECK rebuild"
      contains: "relay_handoff"
    - path: "apps/web/prisma/migrations/20260823120100_facilities_deleted_at/migration.sql"
      provides: "Mirror of the facilities.deleted_at column add"
      contains: "deleted_at"
    - path: "apps/web/prisma/migrations/20260823120200_facilities_country_normalise/migration.sql"
      provides: "Mirror of the data-only country normalisation"
      contains: "United States"
    - path: "apps/web/prisma/schema.prisma"
      provides: "deletedAt on model CarrierFacility"
      contains: "deleted_at"
    - path: "apps/web/src/lib/carrier/facilities.ts"
      provides: "softDeleteFacility writing deletedAt, and read guards filtering on it"
      contains: "deletedAt"
  key_links:
    - from: "apps/web/src/lib/carrier/facilities.ts"
      to: "facilities.deleted_at"
      via: "softDeleteFacility update + deletedAt: null read guards"
      pattern: "deletedAt"
    - from: "apps/web/src/lib/document-import/facility-lookup.ts"
      to: "facilities.deleted_at"
      via: "T2/T3 candidate set excludes soft-deleted rows"
      pattern: "deletedAt: null"
---

<objective>
Ship the three pre-Phase-8 database items as one batch, so Phase 8's commit path lands on a schema that already says what the app means:

1. **`route_template_stops.stop_type` gains `relay_handoff`** — today the template table admits four values and `stops` admits five, so a relay handoff that is legal on a trip is a Postgres 23514 the moment anyone tries to save it back onto a template.
2. **`facilities` gains `deleted_at`, and soft delete stops lying** — `softDeleteFacility` currently writes `inactive_<type>` into `facility_type`, which `facilities_facility_type_check` has always rejected. Soft delete has therefore never worked, and the paired read predicate (`NOT facilityType startsWith 'inactive_'`) has always been a no-op. This task makes the write legal and makes the reads real.
3. **`facilities.country` normalised to `'US'`** — 5 rows across 2 orgs hold the literal `'United States'`. Data fix plus a written report on where that value will come from in future. **No code change for item 3.**

Purpose: remove three known 23514 / silent-no-op hazards before Phase 8 starts materialising stops and committing trips.

Output: 2 DDL migrations + 1 data migration (all applied via Supabase MCP, all mirrored as resolved-not-run), a `deletedAt` field on `CarrierFacility`, 18 corrected read sites, a rewritten `softDeleteFacility`, and a SUMMARY carrying the required proof artifacts.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@apps/web/prisma/migrations/20260811120000_end_stop_facility_and_matrix_cache/migration.sql
@apps/web/src/lib/carrier/facilities.ts
</context>

<investigation_already_done>
**Do NOT re-run any of this. It was read live and is authoritative. Encode it; do not re-derive it.**

### The three constraints, verbatim from `pg_get_constraintdef` (pre-change)

```
facilities_facility_type_check
  CHECK ((facility_type = ANY (ARRAY['terminal'::text, 'yard'::text, 'warehouse'::text, 'drop_yard'::text, 'customer_site'::text, 'driver_residence'::text])))
route_template_stops_stop_type_check
  CHECK ((stop_type = ANY (ARRAY[('pickup'::character varying)::text, ('delivery'::character varying)::text, ('fuel_stop'::character varying)::text, ('layover'::character varying)::text])))
stops_stop_type_check
  CHECK ((stop_type = ANY (ARRAY[('pickup'::character varying)::text, ('delivery'::character varying)::text, ('fuel_stop'::character varying)::text, ('layover'::character varying)::text, ('relay_handoff'::character varying)::text])))
```

### Facilities table facts
- `facilities` has **no** `active` column and **no** `deleted_at` column.
- `country` is `NOT NULL DEFAULT 'US'`; holds `'US'` x46 (11 orgs) and `'United States'` x5 (2 orgs, all Indiana).
- The **only** unique index on `facilities` is `facilities_pkey` on `id`. **No natural-key uniqueness exists, so there is nothing to convert into a partial unique index. Report that fact; do not create one.**
- Sibling convention on carrier snake_case tables is `deleted_at timestamptz` (some also carry `deleted_by_id uuid`). **This task's scope is `deleted_at` ONLY — no `deleted_by_id`.**
- `CarrierFacility` is **already** in `EXEMPT_MODELS` in `apps/web/src/lib/db/extensions/tenant-rls.ts`. This task adds a column to an existing model, not a new model, so **no `EXEMPT_MODELS` edit is required** — but the executor must still state that as a verified check, citing quick-528 (where a missing `EXEMPT_MODELS` entry made a whole cache table unreachable).

### Item 2 read-path audit — already complete

The governing rule (CLAUDE.md): **filter a picker; do NOT filter hydration of a trip's own stops.**

Today's predicate is `NOT: { facilityType: { startsWith: 'inactive_' } }`. Because the paired write has always been rejected by the CHECK, **no row has ever been soft-deleted**, so the predicate is a no-op today and all sites are currently equivalent in behaviour.

**GROUP A — must get `deletedAt: null`.** Eight sites already carry the dead `inactive_` predicate (replace it); ten have no filter at all (add one).

Already carry `NOT: { facilityType: { startsWith: 'inactive_' } }` → **replace** with `deletedAt: null`:

| # | Site |
|---|------|
| 1 | `apps/web/src/lib/carrier/facilities.ts:99` + `:105` — `listFacilities`; one shared `where` object covering both `findMany` and `count` |
| 2 | `apps/web/src/lib/carrier/facilities.ts:115` — `getFacility` |
| 3 | `apps/web/src/lib/carrier/facilities.ts:158` — `updateFacility` guard |
| 4 | `apps/web/src/lib/carrier/facility-visibility.ts:317` — `residenceFacilityForDriver` |
| 5 | `apps/web/src/lib/document-import/facility-lookup.ts:184` — `loadFacilityCandidates` (the T2/T3 candidate set) |
| 6 | `apps/web/src/lib/document-import/end-stop-lookup.ts:281` — parking candidates |
| 7 | `apps/web/src/lib/document-import/end-stop-service.ts:224` — designated-parking validation |
| 8 | `apps/web/src/lib/carrier/route-template-save.ts:265` — parking facility validation |

No filter today → **add** `deletedAt: null`:

| # | Site |
|---|------|
| 9 | `apps/web/src/app/(owner)/carrier/loads/new/page.tsx:38` (picker) |
| 10 | `apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx:84` (picker) |
| 11 | `apps/web/src/app/(owner)/carrier/templates/new/page.tsx:35` (picker) |
| 12 | `apps/web/src/app/(owner)/carrier/templates/[id]/page.tsx:67` (picker) |
| 13 | `apps/web/src/app/(owner)/carrier/trips/[id]/page.tsx:168` — `allFacilities` (picker) |
| 14 | `apps/web/src/lib/carrier/loads.ts:366` — `persistStops` facility ownership validation |
| 15 | `apps/web/src/lib/carrier/route-template-save.ts:239` — batch facility ownership validation |
| 16 | `apps/web/src/lib/carrier/stops.ts:131` — facility fetch for `address_snapshot` (write path) |
| 17 | `apps/web/src/lib/carrier/fleet-drivers.ts:243` — `homeTerminalId` validation (create) |
| 18 | `apps/web/src/lib/carrier/fleet-drivers.ts:593` — `homeTerminalId` validation (update) |

**GROUP B — MUST NOT be filtered.** These hydrate facility rows for stops that are **already on a trip or load**. Filtering them blanks the facility name on a live itinerary — exactly the failure the driver-residence *mask* exists to avoid. Leave the queries untouched:

- `apps/web/src/app/(owner)/carrier/trips/[id]/page.tsx:63`
- `apps/web/src/app/(owner)/carrier/trips/[id]/plan/page.tsx:27`
- `apps/web/src/app/(owner)/carrier/trips/[id]/stops/page.tsx:78`
- `apps/web/src/app/(driver)/carrier/driver/trips/page.tsx:67`
- `apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx:130`
- `apps/web/src/lib/document-import/end-stop-lookup.ts:271` (`wanted`)
- `apps/web/src/app/(owner)/carrier/facilities/[id]/page.tsx:27` (audit-metadata read; the sibling `getFacility` call already enforces the filter)
- `apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts:408` — raw-SQL LEFT JOIN on facilities for the next-stop name of an active dispatch
- `apps/web/src/lib/document-import/optimisation-service.ts:133` — **EXCLUDED BY USER CONSTRAINT: do not touch the optimisation path at all.** It is Group B anyway.

### Item 3 — REPORT ONLY. Already investigated. **This plan contains NO code fix for it.**
Nothing in the codebase writes the literal `'United States'`. `country` is unvalidated free-text passthrough: the forms default to `'US'` behind a plain text input (`FacilityForm.tsx:145`, `FacilityCreateMobile.tsx:49`, `FacilityEditMobile.tsx:73`); the API schema is `z.string().optional()` (`api/v1/carrier/facilities/route.ts:17` and `[id]/route.ts:17`); `createFacility` spreads it straight through. The address autocomplete deliberately never sets `country`. The 5 offending rows pre-date document-import Phase 4. The **future** conduit is the import ladder — `extractor.ts` asks the model for `country`, `resolution.ts:501` carries it, `facility-resolution.ts:513` hands it verbatim to `createFacility` — and an LLM reading a US document emits `"United States"` / `"USA"`. **Recommended future fix: normalise at the write boundary.** Record this in the SUMMARY as a report; write no code for it.
</investigation_already_done>

<binding_conventions>
- **DDL via Supabase MCP `apply_migration` ONLY** (project `oqdhberkghtnszrkdvfm`). No local `prisma migrate deploy`, no local Postgres.
- **DEC-3 mirror rule:** every applied statement is mirrored into `apps/web/prisma/migrations/<timestamp>_<name>/migration.sql` as **resolved-not-run**, then a row is inserted into `_prisma_migrations` with `applied_steps_count = 0` and a **non-null `finished_at`**. Before inserting, run `SELECT * FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 3` and copy the column shape (checksum / logs / rolled_back_at) of an existing row rather than guessing. Verify each insert with `SELECT migration_name, applied_steps_count, finished_at FROM _prisma_migrations WHERE migration_name = '<name>'` and paste the output.
- Migration file headers follow `apps/web/prisma/migrations/20260811120000_end_stop_facility_and_matrix_cache/migration.sql`: explain *why*, state that it was applied via MCP first, and note idempotency.
- **Supabase `execute_sql` returns ONLY the last statement's result** — run diagnostics one result set per call, never bundled.
- **Item 1's rebuild must use the same varchar-cast shape as `stops_stop_type_check`** so the two constraints read identically afterwards: `DROP CONSTRAINT` then `ADD CONSTRAINT` with `ARRAY[('pickup'::character varying)::text, ('delivery'::character varying)::text, ('fuel_stop'::character varying)::text, ('layover'::character varying)::text, ('relay_handoff'::character varying)::text]`.
- **Do NOT widen `facilities_facility_type_check`. Do NOT touch `stops.stop_type`. Do NOT touch optimisation or `route_matrix_cache` paths.**
- **PowerShell:** no `&&` / `||` statement separators.
- **The tsc gate is a HARD gate and is KNOWN TO LIE.** Before trusting a clean run, inject `const x: number = 'y'` into a file you actually edited, confirm tsc reports **that** error, then remove the probe. If the only reported errors are syntax errors, or are all in files you did not touch, the gate is blind: delete `apps/web/.next/dev/types/validator.ts` and `apps/web/tsconfig.tsbuildinfo`, then re-run. Also check for and delete any stray `__probe.ts` left by an earlier session.
- Test suite: **vitest** in `apps/web`.
- **Git: commit atomically per task. Do NOT push** (the orchestrator pushes; the standing rule is commit-only).
- **If any step fails, report exactly what failed and STOP. Do not work around it, do not substitute a different mechanism, do not proceed to the next task.**
</binding_conventions>

<tasks>

<task type="auto">
  <name>Task 1: Align route_template_stops.stop_type with stops.stop_type (add relay_handoff)</name>
  <files>apps/web/prisma/migrations/20260823120000_route_template_stops_relay_handoff/migration.sql</files>
  <action>
Apply via Supabase MCP `apply_migration` (project `oqdhberkghtnszrkdvfm`), migration name `route_template_stops_relay_handoff`:

```sql
ALTER TABLE route_template_stops DROP CONSTRAINT IF EXISTS route_template_stops_stop_type_check;
ALTER TABLE route_template_stops
  ADD CONSTRAINT route_template_stops_stop_type_check
  CHECK ((stop_type = ANY (ARRAY[('pickup'::character varying)::text, ('delivery'::character varying)::text, ('fuel_stop'::character varying)::text, ('layover'::character varying)::text, ('relay_handoff'::character varying)::text])));
```

The varchar-cast shape is deliberate: it makes `route_template_stops_stop_type_check` read identically to `stops_stop_type_check` apart from the table name, so a future `pg_get_constraintdef` diff of the two is meaningful rather than noisy.

Then mirror it into `apps/web/prisma/migrations/20260823120000_route_template_stops_relay_handoff/migration.sql`, header-comment style copied from the `20260811120000_end_stop_facility_and_matrix_cache` migration: state that `stops` has admitted `relay_handoff` since its seeding while the template table did not, so saving a relay handoff back onto a template is a 23514; state that it was applied via MCP before the file was written and is marked resolved-not-run per DEC-3; state that the body is idempotent.

Finally insert the `_prisma_migrations` row (`applied_steps_count = 0`, non-null `finished_at`, column shape copied from an existing row) and run the verification SELECT.

**Do NOT touch `stops.stop_type`. Do NOT touch `facilities_facility_type_check`.**
  </action>
  <verify>
`pg_get_constraintdef` for `route_template_stops_stop_type_check` now lists five values in the varchar-cast shape. Verification SELECT on `_prisma_migrations` returns exactly one row for `20260823120000_route_template_stops_relay_handoff` with `applied_steps_count = 0` and a non-null `finished_at`. Paste both outputs verbatim.
  </verify>
  <done>`relay_handoff` is legal on `route_template_stops`, the constraint reads in the same shape as its `stops` twin, and the migration is recorded as resolved-not-run. Committed.</done>
</task>

<task type="auto">
  <name>Task 2: Add facilities.deleted_at and wire it into the Prisma model</name>
  <files>apps/web/prisma/migrations/20260823120100_facilities_deleted_at/migration.sql, apps/web/prisma/schema.prisma</files>
  <action>
Apply via Supabase MCP `apply_migration`, name `facilities_deleted_at`:

```sql
ALTER TABLE facilities ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
```

Nullable, no default, no backfill — every existing row is live, and no row has ever actually been soft-deleted (the `inactive_<type>` write has always been rejected by `facilities_facility_type_check`). **`deleted_at` only. No `deleted_by_id`.**

Then, in `apps/web/prisma/schema.prisma`, add to `model CarrierFacility` (around line 2042):

```prisma
deletedAt DateTime? @map("deleted_at") @db.Timestamptz
```

If the model's comment block describes soft delete as an `inactive_` prefix on `facilityType`, update it to describe `deletedAt` instead.

Regenerate the client: run `npx prisma generate` in `apps/web` (PowerShell — separate statements, no `&&`).

Mirror the DDL into `apps/web/prisma/migrations/20260823120100_facilities_deleted_at/migration.sql` in the established header style: explain that `facilities` had no `active` and no `deleted_at` column, that the existing `softDeleteFacility` wrote a constraint-illegal `facility_type` and so soft delete has never worked, that `deleted_at timestamptz` matches the sibling carrier tables, that it was applied via MCP first and is resolved-not-run per DEC-3, and that the body is idempotent. Insert the `_prisma_migrations` row and run the verification SELECT.

**Explicitly verify and record (citing quick-528, where a missing entry silently disabled a whole table): `CarrierFacility` is already present in `EXEMPT_MODELS` in `apps/web/src/lib/db/extensions/tenant-rls.ts`, and because this task adds a column to an existing model rather than introducing a new model, no `EXEMPT_MODELS` edit is needed.** Grep to confirm; do not edit that file.

**Do NOT widen `facilities_facility_type_check`.**
  </action>
  <verify>
`information_schema.columns` shows `facilities.deleted_at` as `timestamp with time zone`, nullable, no default. `npx prisma generate` succeeds. Grep output showing `CarrierFacility` in `EXEMPT_MODELS`. Verification SELECT on `_prisma_migrations` for `20260823120100_facilities_deleted_at`. Paste all outputs.
  </verify>
  <done>The column exists in production, the Prisma model knows about it, the client is regenerated, and the migration is recorded as resolved-not-run. Committed.</done>
</task>

<task type="auto">
  <name>Task 3: Make soft delete real — rewrite softDeleteFacility and correct the 18 Group A read sites</name>
  <files>apps/web/src/lib/carrier/facilities.ts, apps/web/src/lib/carrier/facility-visibility.ts, apps/web/src/lib/carrier/loads.ts, apps/web/src/lib/carrier/route-template-save.ts, apps/web/src/lib/carrier/stops.ts, apps/web/src/lib/carrier/fleet-drivers.ts, apps/web/src/lib/document-import/facility-lookup.ts, apps/web/src/lib/document-import/end-stop-lookup.ts, apps/web/src/lib/document-import/end-stop-service.ts, apps/web/src/app/(owner)/carrier/loads/new/page.tsx, apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx, apps/web/src/app/(owner)/carrier/templates/new/page.tsx, apps/web/src/app/(owner)/carrier/templates/[id]/page.tsx, apps/web/src/app/(owner)/carrier/trips/[id]/page.tsx, apps/web/src/app/(owner)/carrier/trips/[id]/plan/page.tsx, apps/web/src/app/(owner)/carrier/trips/[id]/stops/page.tsx, apps/web/src/app/(driver)/carrier/driver/trips/page.tsx</files>
  <action>
**3a — the write.** In `apps/web/src/lib/carrier/facilities.ts:176`, `softDeleteFacility` currently writes an `inactive_` prefix into `facilityType`, which `facilities_facility_type_check` rejects. Replace the update with `deletedAt: new Date()` and leave `facilityType` untouched. Delete the stale `NOTE` comment about "migration 015 should add an 'active' column" — the column now exists. Add `deletedAt: null` to the function's own `findFirst` guard so a second delete returns the function's existing not-found result rather than re-stamping an already-deleted row. Keep the update no-op-safe: if the guard finds nothing, do not issue the update.

**3b — the 18 Group A reads.** Apply exactly the audit table in `<investigation_already_done>`.

For sites 1–8, the site already carries `NOT: { facilityType: { startsWith: 'inactive_' } }`. **Replace** that clause with `deletedAt: null` — do not keep both. The old predicate is a proven no-op (nothing has ever been written with an `inactive_` prefix, because the write was always rejected), so leaving it behind is dead code implying a second soft-delete mechanism exists.

For sites 9–18, **add** `deletedAt: null` to the existing `where`.

Note site 1 (`listFacilities`) uses one shared `where` object across `findMany` and `count`; change it once.

**3c — Group B stays unfiltered, and says so.** Do **not** add a filter to any Group B site. At each Group B site listed in `<investigation_already_done>`, add a short comment explaining that the query deliberately hydrates a trip's or load's own stops and therefore must return soft-deleted facilities — **only where an equivalent comment does not already exist**. Two Group B sites are out of bounds for query changes: the raw-SQL live-map join may take a comment but no query change, and `optimisation-service.ts:133` must not be touched at all.

**3d — sanity grep.** After the edits, grep the repo for `inactive_` and confirm no facility soft-delete usage remains. Report any hits unrelated to facilities and leave them alone.
  </action>
  <verify>
Grep for `startsWith: 'inactive_'` under `apps/web/src` returns nothing for facilities. Grep for `deletedAt` under `apps/web/src/lib/carrier`, `apps/web/src/lib/document-import` and `apps/web/src/app` accounts for all 18 Group A sites and shows none of the Group B sites gained a filter. `npx tsc --noEmit` in `apps/web` is clean **after the probe check described in the binding conventions**.
  </verify>
  <done>Soft delete writes a legal column, every picker and validation path excludes soft-deleted facilities, and every trip-hydration path still returns them with a comment saying why. Committed.</done>
</task>

<task type="auto">
  <name>Task 4: Normalise facilities.country to 'US' (data only) and write the item-3 report</name>
  <files>apps/web/prisma/migrations/20260823120200_facilities_country_normalise/migration.sql</files>
  <action>
Apply via Supabase MCP `apply_migration`, name `facilities_country_normalise`:

```sql
UPDATE facilities SET country = 'US' WHERE country = 'United States';
```

Idempotent by its own `WHERE`. Expect 5 rows across 2 orgs (all Indiana). **If the affected count is not 5, stop and report** — the pre-read said 5, and a different number means something wrote in between.

Mirror it into `apps/web/prisma/migrations/20260823120200_facilities_country_normalise/migration.sql` in the established header style, stating explicitly that it is **data-only, not DDL**, applied via MCP first, resolved-not-run per DEC-3, and idempotent. Insert the `_prisma_migrations` row and run the verification SELECT.

Then run `SELECT country, COUNT(*) FROM facilities GROUP BY country` and confirm `'US'` is the only value, at count 51.

**NO CODE CHANGE for item 3.** Do not add a normaliser, do not tighten the Zod schema, do not touch the forms or `createFacility`. Instead, draft the report for the SUMMARY (finalised in Task 5) covering: nothing in the codebase writes the literal `'United States'`; `country` is unvalidated free-text passthrough (`FacilityForm.tsx:145`, `FacilityCreateMobile.tsx:49`, `FacilityEditMobile.tsx:73`, `z.string().optional()` at `api/v1/carrier/facilities/route.ts:17` and `[id]/route.ts:17`, spread straight through by `createFacility`); the autocomplete deliberately never sets `country`; the 5 rows pre-date document-import Phase 4; and the future conduit is the import ladder (`extractor.ts` asks the model for `country`, `resolution.ts:501` carries it, `facility-resolution.ts:513` hands it verbatim to `createFacility`), where an LLM on a US document will emit `"United States"` / `"USA"` — so the recommended future fix is normalisation at the write boundary.
  </action>
  <verify>
`SELECT country, COUNT(*) FROM facilities GROUP BY country` returns a single row: `US | 51`. Verification SELECT on `_prisma_migrations` for `20260823120200_facilities_country_normalise`. `git diff` shows no source-code change in this task — only the migration file. Paste all outputs.
  </verify>
  <done>Production holds one country value, the change is recorded as a resolved-not-run migration, and the recurrence analysis is written down without any speculative code. Committed (migration file only).</done>
</task>

<task type="auto">
  <name>Task 5: Proof pass — re-read all three constraints, probe the tsc gate, run tests, write the SUMMARY</name>
  <files>.planning/quick/530-pre-phase-8-ddl-batch-relay-handoff-enum/530-SUMMARY.md, .planning/STATE.md</files>
  <action>
**5a — constraints.** Re-read **all three** constraints from the live DB with `pg_get_constraintdef` after the DDL: `facilities_facility_type_check`, `route_template_stops_stop_type_check`, `stops_stop_type_check`. One result set per `execute_sql` call. Paste the verbatim output. Confirm `facilities_facility_type_check` is **unchanged** (six values, no `inactive_` anything) and `stops_stop_type_check` is **unchanged**.

**5b — the tsc gate, probed.** In `apps/web`: inject `const x: number = 'y'` into a file this plan actually edited (e.g. `src/lib/carrier/facilities.ts`), run `npx tsc --noEmit`, and confirm tsc reports **that specific error**. Remove the probe and re-run; the result must be clean. If the probed run does **not** report the injected error, the gate is blind: delete `apps/web/.next/dev/types/validator.ts` and `apps/web/tsconfig.tsbuildinfo`, re-run, and re-probe. Grep for and delete any stray `__probe.ts` (a previous session left one in `src/lib/document-import/`). Record both runs' output.

**5c — tests.** Run the vitest suite in `apps/web`. Paste the output. Any failure touching facilities, document-import facility resolution, end stop, or route templates is a **stop-and-report**, not a fix-forward.

**5d — SUMMARY.** Write `530-SUMMARY.md` containing, at minimum:
  - the three post-change constraint definitions, verbatim;
  - the `_prisma_migrations` verification SELECT output for each of the three new migrations;
  - the tsc probe result (error seen **with** probe, clean **without**);
  - the vitest output;
  - the `EXEMPT_MODELS` check for `CarrierFacility` with its quick-528 citation;
  - the item-3 report drafted in Task 4;
  - the standing finding that **`facilities` has no natural-key uniqueness — only `facilities_pkey` — so there was nothing to convert to a partial unique index, and none was created**;
  - a **per-item audit table covering steps 1–8**, each row marked **IMPLEMENTED / PARTIALLY / NOT DONE** with a one-line justification.

**5e — STATE.md.** Add the quick-530 row following the existing convention.

**If anything in 5a–5c fails, report exactly what failed and STOP.** Do not repair the earlier tasks inside this one.
  </action>
  <verify>All three constraint definitions pasted and matching expectations; three `_prisma_migrations` rows verified; tsc probe demonstrably not blind and the clean run therefore trustworthy; vitest green; SUMMARY contains every required artifact including the 8-row audit table; STATE.md updated.</verify>
  <done>Every claim made by this plan has a pasted piece of evidence behind it, and the audit table says plainly which of the eight steps were done and which were not. Committed.</done>
</task>

</tasks>

<verification>
- `pg_get_constraintdef` on `route_template_stops_stop_type_check` lists five values in the varchar-cast shape; `stops_stop_type_check` and `facilities_facility_type_check` are unchanged.
- `facilities.deleted_at` exists as nullable `timestamptz` with no default; `CarrierFacility.deletedAt` exists in `schema.prisma`; the Prisma client is regenerated.
- `softDeleteFacility` writes `deletedAt` and never `facilityType`; its guard filters `deletedAt: null`.
- All 18 Group A sites filter `deletedAt: null`; zero Group A sites still carry the `inactive_` predicate; zero Group B sites gained a filter; `optimisation-service.ts` is untouched.
- `SELECT country, COUNT(*) FROM facilities GROUP BY country` returns `US | 51` and nothing else.
- Three new `_prisma_migrations` rows, each `applied_steps_count = 0` with non-null `finished_at`.
- `npx tsc --noEmit` clean **and probe-verified**; vitest green.
</verification>

<success_criteria>
- A relay handoff can be saved onto a route template without a 23514.
- Deleting a facility stamps `deleted_at`, removes it from every picker and validation lookup, and leaves it visible on every trip and load it is already attached to.
- `facilities.country` holds exactly one value in production.
- The SUMMARY carries the five required proof artifacts plus the 8-row IMPLEMENTED / PARTIALLY / NOT DONE audit table.
- No code was written for item 3; no partial unique index was created; the optimisation path was not touched.
</success_criteria>

<output>
After completion, create `.planning/quick/530-pre-phase-8-ddl-batch-relay-handoff-enum/530-SUMMARY.md`.
</output>
