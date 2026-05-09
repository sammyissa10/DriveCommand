---
phase: quick-152
plan: "01"
subsystem: database
tags: [migrations, carrier-ops, postgresql, schema]
dependency_graph:
  requires: []
  provides:
    - "clients table — carrier client/customer records with status/portal constraints"
    - "contracts table — rate contracts linked to clients"
    - "facilities table — terminal/yard/warehouse locations"
    - "carrier_drivers table — carrier-ops driver profiles with CDL and pay data"
    - "carrier_trucks table — carrier-ops truck records"
  affects:
    - "apps/web/prisma/migrations/"
tech_stack:
  added: []
  patterns:
    - "Carrier ops tables use lowercase names; FKs reference PascalCase Tenant/User tables"
    - "All carrier tables scoped by org_id FK to Tenant for multi-tenancy"
key_files:
  created:
    - apps/web/prisma/migrations/20260404100001_carrier_clients/migration.sql
    - apps/web/prisma/migrations/20260404100002_carrier_contracts/migration.sql
    - apps/web/prisma/migrations/20260404100003_carrier_facilities/migration.sql
    - apps/web/prisma/migrations/20260404100004_carrier_drivers_trucks/migration.sql
  modified: []
decisions:
  - "carrier_drivers.user_id is optional (nullable) — allows pre-hire or external drivers without platform accounts"
  - "carrier_drivers/carrier_trucks are separate from existing Driver/Truck tables — Carrier Ops is an additive module"
  - "contracts.contract_number has UNIQUE constraint — prevents duplicate contract identifiers per org"
metrics:
  duration: "~2 minutes"
  completed: "2026-04-04"
  tasks_completed: 2
  files_created: 4
---

# Quick Task 152: Carrier Operations Migrations 001–004 Summary

Four SQL migration files applied to create five new Carrier Operations foundation tables: clients, contracts, facilities, carrier_drivers, and carrier_trucks.

## What Was Built

Five new PostgreSQL tables for the Carrier Operations module, applied via `node scripts/migrate.mjs` (4 applied, idempotent on re-run):

| Table | Purpose |
|-------|---------|
| `clients` | Carrier client/customer records with MC/DOT numbers, portal access gate |
| `contracts` | Rate contracts (spot/contract/dedicated) linked to clients |
| `facilities` | Terminal, yard, warehouse and customer site locations |
| `carrier_drivers` | Driver profiles with CDL details, pay model/rate, home terminal |
| `carrier_trucks` | Truck records with type, capacity, licensing, and odometer |

## Key Design Decisions

- All tables scoped by `org_id FK → "Tenant"(id)` for multi-tenancy
- FKs to existing tables use PascalCase quoted identifiers: `"Tenant"`, `"User"`
- New carrier tables use lowercase names — additive module, no existing tables touched
- `carrier_drivers.user_id` is nullable — supports pre-hire drivers without platform accounts
- `contracts.contract_number` has a UNIQUE constraint
- `clients` enforces `portal_access = false OR portal_email IS NOT NULL` via CHECK

## Verification

```
Tables found: 5
 - carrier_drivers
 - carrier_trucks
 - clients
 - contracts
 - facilities
```

Migration re-run output: "Database up to date"

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | 4bced96 | feat(quick-152): add carrier ops migration SQL files 001-004 |
| Task 2 | (no new files — DB state tracked in _prisma_migrations) | Migrations applied: 4 applied |

## Self-Check: PASSED

Files created:
- FOUND: apps/web/prisma/migrations/20260404100001_carrier_clients/migration.sql
- FOUND: apps/web/prisma/migrations/20260404100002_carrier_contracts/migration.sql
- FOUND: apps/web/prisma/migrations/20260404100003_carrier_facilities/migration.sql
- FOUND: apps/web/prisma/migrations/20260404100004_carrier_drivers_trucks/migration.sql

Database tables confirmed: 5/5 (clients, contracts, facilities, carrier_drivers, carrier_trucks)
