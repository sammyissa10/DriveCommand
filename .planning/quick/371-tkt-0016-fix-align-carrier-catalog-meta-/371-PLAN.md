---
phase: 371-tkt-0016-fix-align-carrier-catalog-meta
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/migrations/20260518000001_tkt0016_align_facility_type_catalog/migration.sql
autonomous: true

must_haves:
  truths:
    - "carrier_catalog_meta contains exactly 5 rows where enum_group = 'facility_type'"
    - "Those 5 rows have enum_value in: terminal, yard, warehouse, drop_yard, customer_site"
    - "The 5 rows have human-readable display_label and sequential sort_order matching FacilityForm dropdown order"
    - "The previous 5 stale rows (shipper, receiver, terminal, fuel_stop, other) no longer exist for this enum_group"
    - "No other enum_group rows in carrier_catalog_meta are modified"
    - "tsc --noEmit exits 0 after the change"
  artifacts:
    - path: "apps/web/prisma/migrations/20260518000001_tkt0016_align_facility_type_catalog/migration.sql"
      provides: "Idempotent data migration: delete-then-insert canonical facility_type catalog rows inside a transaction"
      contains: "DELETE FROM carrier_catalog_meta WHERE enum_group = 'facility_type'"
  key_links:
    - from: "Migration SQL"
      to: "carrier_catalog_meta table (enum_group = 'facility_type')"
      via: "DELETE + INSERT inside BEGIN/COMMIT"
      pattern: "BEGIN;[\\s\\S]*DELETE FROM carrier_catalog_meta[\\s\\S]*INSERT INTO carrier_catalog_meta[\\s\\S]*COMMIT;"
    - from: "Inserted row sort_order values"
      to: "FacilityForm.tsx FACILITY_TYPES array order"
      via: "Sequential 0..4 matching terminal, yard, warehouse, drop_yard, customer_site"
      pattern: "sort_order"
---

<objective>
Close TKT-0016 by realigning the 5 `carrier_catalog_meta` rows in `enum_group = 'facility_type'` with the canonical 5 values already enforced by the DB CHECK constraint and used by the FacilityForm dropdown.

Purpose: Pure data hygiene. QT-369 confirmed UI dropdown and DB CHECK are aligned on (terminal, yard, warehouse, drop_yard, customer_site). QT-370 confirmed `carrier_catalog_meta` has stale facility_type values (shipper, receiver, terminal, fuel_stop, other) and is not read by any application code — so this is zero-risk data correction.

Output: One new migration file at `apps/web/prisma/migrations/20260518000001_tkt0016_align_facility_type_catalog/migration.sql` that, inside a single transaction, deletes the 5 stale rows and inserts the 5 canonical rows using the exact column shape from the original seed migration (20260404100014).
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/prisma/migrations/20260404100014_carrier_seed_enums/migration.sql
@apps/web/src/components/carrier/facilities/FacilityForm.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Write idempotent migration aligning facility_type catalog rows</name>
  <files>apps/web/prisma/migrations/20260518000001_tkt0016_align_facility_type_catalog/migration.sql</files>
  <action>
Create a new migration directory + file at exactly:
`apps/web/prisma/migrations/20260518000001_tkt0016_align_facility_type_catalog/migration.sql`

The migration MUST:

1. Open a transaction with `BEGIN;` and close with `COMMIT;`.
2. Inside the transaction, `DELETE FROM carrier_catalog_meta WHERE enum_group = 'facility_type';` — this removes ALL existing facility_type rows (the 5 stale ones: shipper, receiver, terminal, fuel_stop, other). This makes the migration idempotent (DELETE + INSERT pattern).
3. Insert exactly 5 rows using the EXACT column shape from `20260404100014_carrier_seed_enums/migration.sql` — columns are `(enum_group, enum_value, display_label, sort_order)`. Do NOT insert `id` (it has `DEFAULT gen_random_uuid()`) and do NOT insert `active` (it has `DEFAULT true`).
4. The 5 inserted rows MUST be (sort_order matches FacilityForm.tsx FACILITY_TYPES array order at lines 89–93):
   - ('facility_type', 'terminal',      'Terminal',      0)
   - ('facility_type', 'yard',          'Yard',          1)
   - ('facility_type', 'warehouse',     'Warehouse',     2)
   - ('facility_type', 'drop_yard',     'Drop Yard',     3)
   - ('facility_type', 'customer_site', 'Customer Site', 4)
5. Use `ON CONFLICT (enum_group, enum_value) DO NOTHING` on the INSERT to mirror the existing seed migration's convention (the unique index `carrier_catalog_meta_group_value` enforces this).
6. Include a top-of-file SQL comment block explaining the purpose: "TKT-0016 — Align carrier_catalog_meta facility_type rows with DB CHECK constraint. Replaces stale (shipper, receiver, terminal, fuel_stop, other) with canonical (terminal, yard, warehouse, drop_yard, customer_site). Data-only change; no schema modification."

Constraints (DO NOT VIOLATE):
- DO NOT modify `apps/web/prisma/schema.prisma`.
- DO NOT modify any TypeScript / application code.
- DO NOT touch any other enum_group rows (client_status, contract_type, rate_type, etc).
- DO NOT alter the table structure, drop indexes, or change the CHECK constraint.
- DO NOT create any other files besides this single migration.sql.
- Column names are `enum_value` and `display_label` (NOT `value`/`label` — verify against the original seed migration before writing).
  </action>
  <verify>
1. Confirm file exists at the exact path: `apps/web/prisma/migrations/20260518000001_tkt0016_align_facility_type_catalog/migration.sql`.
2. Migration apply hook should automatically run `prisma migrate deploy` on write. If hook fires, capture its output. If hook does NOT fire, apply via Supabase MCP `apply_migration` using the file's SQL content.
3. Verify via Supabase MCP `execute_sql`:
   `SELECT enum_value, display_label, sort_order FROM carrier_catalog_meta WHERE enum_group = 'facility_type' ORDER BY sort_order;`
   Expected result (exactly 5 rows, in this order):
   - terminal      | Terminal      | 0
   - yard          | Yard          | 1
   - warehouse     | Warehouse     | 2
   - drop_yard     | Drop Yard     | 3
   - customer_site | Customer Site | 4
4. Verify no other enum_groups were affected via Supabase MCP:
   `SELECT enum_group, COUNT(*) FROM carrier_catalog_meta GROUP BY enum_group ORDER BY enum_group;`
   Counts for non-facility_type groups must match the pre-change values from the original seed migration.
5. Run `cd apps/web && npx tsc --noEmit` — must exit 0 (zero output, zero errors).
  </verify>
  <done>
- New migration file exists at the specified path with BEGIN/DELETE/INSERT/COMMIT structure.
- Migration is applied to Supabase (verified via SELECT returning the 5 canonical rows in the correct order).
- Stale rows (shipper, receiver, fuel_stop, other) are no longer present for enum_group = 'facility_type'.
- Other enum_groups are untouched.
- `npx tsc --noEmit` exits 0.
  </done>
</task>

</tasks>

<verification>
Final phase checks (after Task 1 completes):

1. `SELECT enum_value, display_label, sort_order FROM carrier_catalog_meta WHERE enum_group = 'facility_type' ORDER BY sort_order;` returns exactly 5 rows: (terminal, Terminal, 0), (yard, Yard, 1), (warehouse, Warehouse, 2), (drop_yard, Drop Yard, 3), (customer_site, Customer Site, 4).
2. No schema files were modified (`git diff apps/web/prisma/schema.prisma` is empty).
3. No application code was modified (`git diff -- apps/web/src` is empty).
4. The only new file is `apps/web/prisma/migrations/20260518000001_tkt0016_align_facility_type_catalog/migration.sql`.
5. `npx tsc --noEmit` from `apps/web` exits 0.
</verification>

<success_criteria>
TKT-0016 is closed. `carrier_catalog_meta` facility_type rows match the DB CHECK constraint and FacilityForm.tsx dropdown. Pure data fix shipped via a single idempotent migration with zero runtime risk.

Commit message (after success):
`fix(carrier-catalog): align facility_type rows with DB CHECK constraint [TKT-0016]`

Then `git push origin master`.
</success_criteria>

<output>
After completion, create `.planning/quick/371-tkt-0016-fix-align-carrier-catalog-meta-/371-SUMMARY.md` summarizing:
- Migration filename + timestamp
- Rows deleted (5 stale values)
- Rows inserted (5 canonical values with sort_order)
- Verification SELECT output
- Confirmation `tsc --noEmit` exited 0
- Commit SHA + push status
</output>
