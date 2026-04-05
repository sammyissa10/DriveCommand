---
phase: quick-154
plan: "01"
subsystem: database/carrier-ops
tags: [migration, postgresql, carrier-ops, dispatches, loads, stops]
dependency_graph:
  requires: [quick-153 (migrations 001-006)]
  provides: [dispatches table, loads table, stops table]
  affects: [carrier ops data model]
tech_stack:
  added: []
  patterns: [raw SQL migrations, named constraints, DECIMAL money fields, circular-ref avoidance]
key_files:
  created:
    - apps/web/prisma/migrations/20260404100007_carrier_dispatches/migration.sql
    - apps/web/prisma/migrations/20260404100008_carrier_loads/migration.sql
    - apps/web/prisma/migrations/20260404100009_carrier_stops/migration.sql
  modified: []
decisions:
  - "dispatches has NO client_id — dispatch = movement of equipment, load = commercial agreement"
  - "relay_handoff_stop_id is plain UUID with no FK to avoid dispatches ↔ stops circular reference"
  - "stops has no org_id — tenant scoping inherited via dispatch_id → dispatches.org_id"
  - "All money fields in loads are DECIMAL(12,2), never FLOAT"
  - "stops ordering is exclusively by sequence_order, never by stop_type"
metrics:
  duration: "~8 minutes"
  completed: "2026-04-04"
  tasks_completed: 1
  files_created: 3
  files_modified: 0
---

# Phase quick-154 Plan 01: Carrier Ops Migrations 007-009 Summary

**One-liner:** Three core carrier ops tables (dispatches, loads, stops) with FK chains, CHECK constraints, and architectural rules enforced at the DB level.

## What Was Built

Three SQL migration files applied to Supabase PostgreSQL:

### Migration 007 — dispatches
Core operational table for equipment and crew movement. 20 columns including schedule timestamps, status workflow, and relay/team drive support. Notably has NO `client_id` by architectural design — clients are linked via loads, not dispatches.

Key constraints:
- `status` CHECK: `('planned', 'in_progress', 'completed', 'cancelled', 'tonu')`
- `hos_cycle` CHECK: `('us_70', 'us_60', 'canada_70', 'canada_80')`
- `relay_handoff_stop_id` — plain UUID, no FK (avoids circular reference with stops table)
- FKs to: `"Tenant"`, `route_templates`, `carrier_drivers` (x2), `carrier_trucks` (x2), `"User"`
- Optional FKs use `ON DELETE SET NULL`, required FKs use `ON DELETE RESTRICT`

### Migration 008 — loads
Commercial agreement table linking dispatches to clients and contracts. 30 columns including full freight detail, rate structure, and broker tracking.

Key constraints:
- `client_id NOT NULL` — every load must have a client
- `load_type` CHECK: `('ftl', 'ltl', 'partial', 'team')`
- `status` CHECK: `('pending', 'assigned', 'in_transit', 'delivered', 'invoiced', 'paid', 'cancelled')`
- `rate_type` CHECK: `('per_mile', 'flat', 'per_cwt', 'per_pallet', 'per_stop', 'hourly')`
- `broker_flag` CHECK: `(broker_flag = false OR carrier_cost IS NOT NULL)`
- All money fields: `DECIMAL(12,2)` — no FLOAT anywhere

### Migration 009 — stops
Physical stop records within a dispatch. 25 columns covering appointment windows, freight details, and document references.

Key constraints:
- `stop_type` CHECK: `('pickup', 'delivery', 'fuel_stop', 'layover', 'relay_handoff')`
- `status` CHECK: `('pending', 'arrived', 'completed', 'skipped')`
- `skip_reason` CHECK: `(status != 'skipped' OR skip_reason IS NOT NULL)`
- `UNIQUE (dispatch_id, sequence_order)` — enforces unambiguous stop ordering
- No `org_id` — scoped via parent dispatch/load
- Ordering exclusively by `sequence_order`, never by `stop_type`

## Verification Results

**Verify 1 — No client_id on dispatches:**
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name='dispatches' AND column_name='client_id';
```
Result: **0 rows** (PASS)

**Verify 2 — client_id NOT NULL on loads:**
```sql
SELECT is_nullable FROM information_schema.columns
WHERE table_name='loads' AND column_name='client_id';
```
Result: **NO** (PASS)

**Verify 3 — Table column counts:**
| Table      | Columns |
|------------|---------|
| dispatches | 20      |
| loads      | 30      |
| stops      | 25      |

## Commits

| Hash    | Message |
|---------|---------|
| 8042975 | feat(quick-154): add carrier ops migrations 007-009 (dispatches, loads, stops) |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- [x] `apps/web/prisma/migrations/20260404100007_carrier_dispatches/migration.sql` exists
- [x] `apps/web/prisma/migrations/20260404100008_carrier_loads/migration.sql` exists
- [x] `apps/web/prisma/migrations/20260404100009_carrier_stops/migration.sql` exists
- [x] Commit 8042975 exists
- [x] Verify 1: dispatches has no client_id (0 rows)
- [x] Verify 2: loads.client_id is NOT NULL (is_nullable = NO)
- [x] All three tables applied successfully via `node scripts/migrate.mjs`
