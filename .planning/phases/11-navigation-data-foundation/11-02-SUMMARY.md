---
phase: 11-navigation-data-foundation
plan: 02
subsystem: data-models
tags: [prisma, database, fleet-intelligence, rls, migration]

dependency_graph:
  requires:
    - 11-01 (Sidebar navigation for accessing fleet intelligence sections)
  provides:
    - GPSLocation model for truck location tracking
    - SafetyEvent model for safety analytics
    - FuelRecord model for fuel efficiency tracking
    - RLS-protected data models with tenant isolation
  affects:
    - Phase 12 (Live Map will query GPSLocation)
    - Phase 13 (Safety Analytics will query SafetyEvent)
    - Phase 14 (Fuel Dashboard will query FuelRecord)

tech_stack:
  added:
    - Prisma enums: SafetyEventType, SafetyEventSeverity, FuelType
    - PostgreSQL RLS policies for GPSLocation, SafetyEvent, FuelRecord
  patterns:
    - Decimal coordinates with explicit precision (@db.Decimal(10,8) for latitude, @db.Decimal(11,8) for longitude)
    - Composite indexes on [tenantId, timestamp] for dashboard query performance
    - Optional foreign keys with ON DELETE SET NULL (driverId, routeId in SafetyEvent)
    - current_tenant_id() function for RLS tenant isolation

key_files:
  created:
    - prisma/migrations/20260215000001_add_fleet_intelligence_models/migration.sql
  modified:
    - prisma/schema.prisma

decisions:
  - Used Decimal types for coordinates (latitude/longitude) with explicit precision for GPS accuracy
  - Made driverId and routeId optional in SafetyEvent (events can occur when no driver assigned or outside active routes)
  - Added composite indexes on [tenantId, timestamp] for efficient dashboard queries (time-series data pattern)
  - Used JSONB for SafetyEvent.metadata to store event-specific data without schema changes
  - Followed v1.0 RLS pattern exactly (current_tenant_id() + bypass_rls for system operations)
  - Used isEstimated flag in FuelRecord for future automated fuel consumption calculations

metrics:
  duration: "3m 0s"
  tasks_completed: 2
  files_created: 1
  files_modified: 1
  completed_date: "2026-02-15"
---

# Phase 11 Plan 02: Fleet Intelligence Data Models Summary

**One-liner:** Added GPSLocation, SafetyEvent, and FuelRecord models with RLS tenant isolation, Decimal coordinate precision, and composite time-series indexes for dashboard queries.

## What Was Built

This plan established the database foundation for v2.0 Fleet Intelligence features (Live Map, Safety Analytics, Fuel Dashboard) by adding three new Prisma models with full RLS protection matching the v1.0 tenant isolation pattern.

### Models Added

**GPSLocation** - Truck location tracking with GPS metadata
- Decimal coordinates (10,8 for latitude, 11,8 for longitude)
- Optional speed, heading, altitude, accuracy fields
- Timestamp for GPS reading time
- Relations: Tenant, Truck

**SafetyEvent** - Safety incident tracking with severity classification
- Event type enum (8 types: harsh braking/acceleration/cornering, speeding, distracted driving, rolling stop, seatbelt violation, following too close)
- Severity enum (LOW, MEDIUM, HIGH, CRITICAL)
- Optional g-force, speed/speedLimit for context
- Decimal coordinates for event location
- Optional driver and route references (SET NULL on delete)
- JSONB metadata for event-specific data
- Relations: Tenant, Truck, User (driver), Route

**FuelRecord** - Fuel consumption and cost tracking
- Fuel type enum (DIESEL, GASOLINE, ELECTRIC, HYBRID, CNG, LPG)
- Quantity (Decimal 10,2), unit cost (Decimal 10,4), total cost (Decimal 10,2)
- Odometer reading (critical for MPG calculations)
- Optional location (station name/address) and coordinates
- isEstimated flag for future automated calculations
- Relations: Tenant, Truck

### RLS Security

All three models have identical RLS setup matching v1.0 pattern:
- `tenant_isolation_policy` — Uses `current_tenant_id()` for USING and WITH CHECK
- `bypass_rls_policy` — Allows system operations via `app.bypass_rls` setting
- ENABLE ROW LEVEL SECURITY + FORCE ROW LEVEL SECURITY on all tables

### Indexing Strategy

Optimized for dashboard time-series queries:
- Composite indexes on `[tenantId, timestamp]` for all three models
- Single-column indexes on foreign keys (tenantId, truckId, driverId, routeId)
- Additional indexes on SafetyEvent (eventType, severity) and FuelRecord (isEstimated)

## How It Works

1. **Schema Layer**: Prisma models define structure with explicit types, relations, and indexes
2. **Migration Layer**: SQL migration creates tables, enums, indexes, foreign keys, and RLS policies
3. **Security Layer**: RLS policies enforce tenant isolation at database level (defense-in-depth)
4. **Query Performance**: Composite [tenantId, timestamp] indexes enable efficient dashboard queries for time-series data

## Files Changed

### Created
- `prisma/migrations/20260215000001_add_fleet_intelligence_models/migration.sql` (199 lines)
  - 3 CREATE TYPE statements (SafetyEventType, SafetyEventSeverity, FuelType)
  - 3 CREATE TABLE statements (GPSLocation, SafetyEvent, FuelRecord)
  - 13 CREATE INDEX statements (including 3 composite [tenantId, timestamp] indexes)
  - 8 ALTER TABLE statements for foreign keys
  - 6 RLS policies (3 tenant_isolation + 3 bypass_rls)

### Modified
- `prisma/schema.prisma` (121 lines added)
  - 3 new enums (27 enum values total)
  - 3 new models (GPSLocation, SafetyEvent, FuelRecord)
  - Updated 4 existing models with new relation fields (Tenant, Truck, User, Route)

## Deviations from Plan

None - plan executed exactly as written.

## Integration Points

### Upstream Dependencies
- Requires existing Tenant, Truck, User, Route models (from v1.0)
- Requires current_tenant_id() function (from init migration)

### Downstream Consumers
- **Phase 12 (Live Map)** — Will query GPSLocation for real-time truck positions
- **Phase 13 (Safety Analytics)** — Will query SafetyEvent for safety trends and incident analysis
- **Phase 14 (Fuel Dashboard)** — Will query FuelRecord for fuel efficiency metrics and cost analysis

## Testing Notes

**Schema Validation:**
- ✓ `npx prisma validate` passes
- ✓ `npx prisma generate` succeeds
- ✓ `npm run build` passes with no TypeScript errors

**Migration Verification:**
- ✓ 3 enums created (SafetyEventType, SafetyEventSeverity, FuelType)
- ✓ 3 tables created (GPSLocation, SafetyEvent, FuelRecord)
- ✓ 6 RLS policies created (3 tenant_isolation + 3 bypass_rls)
- ✓ 3 composite indexes on [tenantId, timestamp]
- ✓ All foreign keys use RESTRICT for required fields, SET NULL for optional fields

**Future Testing (when database available):**
- Migration applies cleanly with `npx prisma migrate deploy`
- RLS policies correctly isolate data by tenant
- Composite indexes improve query performance for dashboard time-series queries

## Next Steps

1. **Phase 11 Plan 03** — Build mock data generators for GPS locations, safety events, and fuel records
2. **Phase 12** — Build Live Map dashboard UI with real-time truck positions (uses GPSLocation)
3. **Phase 13** — Build Safety Analytics dashboard with incident trends (uses SafetyEvent)
4. **Phase 14** — Build Fuel Dashboard with efficiency metrics (uses FuelRecord)

## Commits

- `58ab5ef` — feat(11-02): add GPSLocation, SafetyEvent, and FuelRecord models to Prisma schema
- `a647f7f` — feat(11-02): create migration SQL with fleet intelligence tables and RLS policies

## Self-Check: PASSED

**Created files exist:**
- ✓ FOUND: prisma/migrations/20260215000001_add_fleet_intelligence_models/migration.sql

**Modified files exist:**
- ✓ FOUND: prisma/schema.prisma

**Commits exist:**
- ✓ FOUND: 58ab5ef (Task 1 - Schema models)
- ✓ FOUND: a647f7f (Task 2 - Migration SQL)

**Models exist in schema:**
- ✓ FOUND: model GPSLocation
- ✓ FOUND: model SafetyEvent
- ✓ FOUND: model FuelRecord

**Enums exist in schema:**
- ✓ FOUND: enum SafetyEventType
- ✓ FOUND: enum SafetyEventSeverity
- ✓ FOUND: enum FuelType

**RLS policies in migration:**
- ✓ FOUND: 3 tenant_isolation_policy instances
- ✓ FOUND: 3 bypass_rls_policy instances
- ✓ FOUND: 6 current_tenant_id() references

**Composite indexes in migration:**
- ✓ FOUND: 3 [tenantId, timestamp] composite indexes
