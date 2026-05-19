---
phase: quick
plan: "371"
subsystem: carrier-catalog
tags: [data-migration, tkt-0016, carrier_catalog_meta, facility_type]
dependency_graph:
  requires: []
  provides: ["carrier_catalog_meta facility_type rows aligned with DB CHECK constraint"]
  affects: []
tech_stack:
  added: []
  patterns: ["DELETE + INSERT idempotent migration pattern"]
key_files:
  created:
    - apps/web/prisma/migrations/20260518000001_tkt0016_align_facility_type_catalog/migration.sql
  modified: []
decisions:
  - "Used DELETE + INSERT inside BEGIN/COMMIT for idempotency — mirrors the existing seed migration convention"
  - "Applied via prisma migrate deploy (not supabase CLI db push, which has migration history drift)"
metrics:
  duration: "~5 minutes"
  completed: "2026-05-18"
  tasks_completed: 1
  files_created: 1
---

# Quick Task 371: TKT-0016 — Align carrier_catalog_meta facility_type rows Summary

**One-liner:** Replaced 5 stale facility_type catalog rows (shipper/receiver/terminal/fuel_stop/other) with the 5 canonical rows (terminal/yard/warehouse/drop_yard/customer_site) enforced by the DB CHECK constraint and FacilityForm.tsx.

---

## Migration File

**Path:** `apps/web/prisma/migrations/20260518000001_tkt0016_align_facility_type_catalog/migration.sql`

**Timestamp:** `20260518000001`

### Migration SQL

```sql
-- TKT-0016 — Align carrier_catalog_meta facility_type rows with DB CHECK constraint.
-- Replaces stale (shipper, receiver, terminal, fuel_stop, other) with canonical
-- (terminal, yard, warehouse, drop_yard, customer_site).
-- Data-only change; no schema modification.
-- Idempotent: DELETE + INSERT pattern ensures safe re-runs.

BEGIN;

DELETE FROM carrier_catalog_meta WHERE enum_group = 'facility_type';

INSERT INTO carrier_catalog_meta (enum_group, enum_value, display_label, sort_order) VALUES
    ('facility_type', 'terminal',      'Terminal',      0),
    ('facility_type', 'yard',          'Yard',          1),
    ('facility_type', 'warehouse',     'Warehouse',     2),
    ('facility_type', 'drop_yard',     'Drop Yard',     3),
    ('facility_type', 'customer_site', 'Customer Site', 4)
ON CONFLICT (enum_group, enum_value) DO NOTHING;

COMMIT;
```

---

## Rows Deleted (5 stale)

| enum_value | display_label | sort_order |
|------------|---------------|------------|
| shipper    | Shipper       | 0          |
| receiver   | Receiver      | 1          |
| terminal   | Terminal      | 2          |
| fuel_stop  | Fuel Stop     | 3          |
| other      | Other         | 4          |

## Rows Inserted (5 canonical)

| enum_value    | display_label | sort_order |
|---------------|---------------|------------|
| terminal      | Terminal      | 0          |
| yard          | Yard          | 1          |
| warehouse     | Warehouse     | 2          |
| drop_yard     | Drop Yard     | 3          |
| customer_site | Customer Site | 4          |

---

## Verification SELECT Output

Query: `SELECT enum_value, display_label, sort_order FROM carrier_catalog_meta WHERE enum_group = 'facility_type' ORDER BY sort_order;`

```json
[
  { "enum_value": "terminal",      "display_label": "Terminal",      "sort_order": 0 },
  { "enum_value": "yard",          "display_label": "Yard",          "sort_order": 1 },
  { "enum_value": "warehouse",     "display_label": "Warehouse",     "sort_order": 2 },
  { "enum_value": "drop_yard",     "display_label": "Drop Yard",     "sort_order": 3 },
  { "enum_value": "customer_site", "display_label": "Customer Site", "sort_order": 4 }
]
```

Exactly 5 rows returned. Stale values (shipper, receiver, fuel_stop, other) are no longer present.

## Other enum_groups Verification

All other enum_groups retain their original row counts — no collateral changes:

| enum_group            | count |
|-----------------------|-------|
| client_status         | 3     |
| contract_type         | 4     |
| dispatch_status       | 5     |
| document_type         | 9     |
| driver_status         | 3     |
| equipment_type        | 6     |
| expense_type          | 8     |
| facility_type         | 5     |
| fuel_surcharge_method | 4     |
| load_status           | 7     |
| load_type             | 4     |
| paid_by               | 4     |
| pay_model             | 5     |
| pay_record_status     | 4     |
| rate_type             | 8     |
| schedule_type         | 3     |
| stop_status           | 4     |
| stop_type             | 5     |
| truck_type            | 2     |

---

## tsc --noEmit Status

`npx tsc --noEmit` exits non-zero due to **pre-existing** errors unrelated to this migration:
- Missing `framer-motion` type declarations (multiple components)
- Missing `@types/d3-geo` and `@types/topojson-client`
- `.next/types/validator.ts` referencing a deleted page route

These errors existed before this task. This migration is a pure data change — zero TypeScript files were created or modified. The pre-existing TypeScript errors do not affect this data migration's correctness.

---

## Commit & Push

**Commit SHA:** `370010ca`
**Commit message:** `fix(carrier-catalog): align facility_type rows with DB CHECK constraint [TKT-0016]`
**Push status:** Pushed to `origin master` successfully (73f82b8c..370010ca)

---

## Deviations from Plan

**Applied via `prisma migrate deploy` instead of Supabase MCP `apply_migration`.**

- The Supabase CLI `db push` command failed with a migration history drift error (remote has 18 migration versions not tracked locally).
- Used `prisma migrate deploy` as the canonical deployment method — this is the project's standard approach for applying migrations (as documented in CLAUDE.md: "Prisma migrate deploy via hook on every migration.sql write").
- Result was identical: migration applied successfully, all 5 canonical rows confirmed in Supabase.

---

## Observations

Other enum_groups in `carrier_catalog_meta` may have similar drift — out of scope for TKT-0016 but worth a future audit.

**TKT-0016 ready to close.**

---

## Self-Check: PASSED

- [x] Migration file exists at `apps/web/prisma/migrations/20260518000001_tkt0016_align_facility_type_catalog/migration.sql`
- [x] Migration applied to Supabase — 5 canonical rows confirmed via SELECT
- [x] Stale rows (shipper, receiver, fuel_stop, other) no longer present
- [x] Other enum_groups untouched (counts verified)
- [x] Zero schema files modified (`git diff apps/web/prisma/schema.prisma` empty)
- [x] Zero application code modified (`git diff -- apps/web/src` empty)
- [x] Commit `370010ca` exists and pushed to origin master
