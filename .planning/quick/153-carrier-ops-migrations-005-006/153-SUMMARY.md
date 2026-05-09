---
phase: quick-153
plan: "01"
subsystem: carrier-operations
tags: [database, migration, carrier-ops, route-templates]
dependency_graph:
  requires: [quick-146, quick-147, quick-148, quick-149]
  provides: [route_templates table, route_template_stops table]
  affects: [carrier-operations module]
tech_stack:
  added: []
  patterns: [timestamped migration subdirectories, explicit FK constraint naming]
key_files:
  created:
    - apps/web/prisma/migrations/20260404100005_carrier_route_templates/migration.sql
    - apps/web/prisma/migrations/20260404100006_carrier_route_template_stops/migration.sql
  modified: []
decisions:
  - route_template_stops has no org_id — tenant scoping inherited through route_template_id → route_templates.org_id
  - ON DELETE CASCADE on route_template_stops.route_template_id to clean up child stops when template is deleted
  - ON DELETE SET NULL for nullable FKs (contract_id, default_driver_id, default_truck_id) to preserve templates when assignments are removed
metrics:
  duration: "~5 minutes"
  completed: "2026-04-04"
  tasks_completed: 3
  files_created: 2
---

# Phase quick-153 Plan 01: Carrier Ops Migrations 005-006 Summary

Route templates and route_template_stops DDL migrations applied to the database — enabling reusable dispatcher-controlled route definitions with ordered stops for recurring freight lanes.

## What Was Built

**Migration 005 — route_templates**
- 21 columns: template identity, client/contract links, schedule config (type + recurrence rule + timezone + departure time), equipment spec (type + temp range + weight + commodity), default driver/truck assignments, auto-generation horizon, active flag, timestamps
- CHECK constraints on `schedule_type` (fixed_days/frequency/on_call) and `equipment_type` (dry_van/flatbed/reefer/tanker/step_deck/other)
- 5 foreign keys: clients(id), contracts(id), carrier_drivers(id), carrier_trucks(id), "Tenant"(id)
- 4 indexes: client_id, contract_id, active, org_id

**Migration 006 — route_template_stops**
- 16 columns: route link, sequence_order, stop_type, facility link, contact info, appointment window offsets, dwell time, commodity, BOL/POD flags, special instructions, created_at
- No org_id — tenant scoping flows through route_template_id → route_templates.org_id
- CHECK constraint on `stop_type` (pickup/delivery/fuel_stop/layover)
- UNIQUE constraint on (route_template_id, sequence_order) — enforces distinct stop ordering per template
- ON DELETE CASCADE from route_templates — stops auto-deleted when parent template is removed
- 2 foreign keys: route_templates(id) CASCADE, facilities(id) RESTRICT
- 1 index on route_template_id

## Deviations from Plan

None — plan executed exactly as written. The important_context note to omit org_id from migration 006 was honored (spec listed 15 fields without org_id, and tenant scoping via parent table is the correct pattern for child tables).

## Self-Check: PASSED

Files verified:
- FOUND: apps/web/prisma/migrations/20260404100005_carrier_route_templates/migration.sql
- FOUND: apps/web/prisma/migrations/20260404100006_carrier_route_template_stops/migration.sql

Commits verified:
- abf8459: feat(quick-153): create migration 005 — route_templates table
- a24cc20: feat(quick-153): create migration 006 — route_template_stops table

Migration script output: "Migrations complete (2 applied)" — both tables live in the database.
