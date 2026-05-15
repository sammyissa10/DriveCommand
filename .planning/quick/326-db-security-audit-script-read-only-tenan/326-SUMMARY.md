---
phase: quick-326
plan: 01
subsystem: database-security
tags: [audit, rls, multi-tenant, security, read-only]
dependency_graph:
  requires: []
  provides: [docs/audits/db-tenant-audit.md, apps/web/scripts/audit/db-tenant-audit.ts]
  affects: [DatabaseSecurity_MultiTenant_Spec_v1.md Prompt 2 — standardize tables]
tech_stack:
  added: []
  patterns: [PrismaClient + PrismaPg adapter, $queryRawUnsafe SELECT-only, camelCase+snake_case dual detection]
key_files:
  created:
    - apps/web/scripts/audit/db-tenant-audit.ts
    - docs/audits/db-tenant-audit.md
  modified: []
decisions:
  - Both camelCase (tenantId, createdAt) and snake_case (tenant_id, org_id, created_at) column naming detected — original Prisma models use camelCase DB columns, carrier/newer models use snake_case
  - array_to_string(array_agg(...), ',') used instead of array_agg alone — avoids Prisma PgAdapter deserialization error with native PG array types
  - Import path is ../../src/generated/prisma/client (two levels up from scripts/audit/)
metrics:
  duration: 25 minutes
  completed: 2026-05-15
  tasks_completed: 1
  files_created: 2
---

# Phase quick-326 Plan 01: DB Tenant Audit Script Summary

**One-liner:** Read-only audit script querying information_schema + pg_catalog for all 88 public-schema tables, detecting tenant-scoping, RLS state, audit columns, and index gaps in both camelCase and snake_case naming conventions.

## What Was Built

A single TypeScript script (`apps/web/scripts/audit/db-tenant-audit.ts`) that:

1. Collects all 88 public-schema tables from `information_schema.tables`
2. Loads all columns + types from `information_schema.columns` (one query)
3. Reads RLS state (`relrowsecurity`, `relforcerowsecurity`) from `pg_class`
4. Reads all RLS policy names from `pg_policies`
5. Reads all indexes with their column lists from `pg_catalog` (using `array_to_string(array_agg(...))` to avoid Prisma driver deserialization issues with native PG array types)
6. Detects tenant columns in both camelCase (`tenantId`) and snake_case (`tenant_id`, `org_id`)
7. Detects audit columns in both naming styles (`createdAt`/`created_at`, `createdBy`/`created_by`, etc.)
8. Computes FK-reachable scoping for indirect tables
9. Writes `docs/audits/db-tenant-audit.md` — idempotent, re-running produces identical output

## Findings Summary

From the generated `docs/audits/db-tenant-audit.md`:

- **Total tables:** 88
- **Tenant-scoped tables:** 77 (direct tenant_id/org_id: 71, reachable via FK: 6)
- **Missing RLS enabled:** 5 tables — carrier_compliance_alert_log, carrier_document_types, DispatchOverrideAudit, NotificationSendLog, PlaybookTrigger
- **Missing RLS forced:** 25 tables — carrier_compliance_alert_log, carrier_document_types, carrier_drivers, carrier_expenses, carrier_trucks, clients, contracts, dispatches, DispatchOverrideAudit, driver_pay_records, DriverHOSEntry, DriverIncident, facilities, in_app_notifications, loads, NotificationSendLog, PlaybookTrigger, PushToken, route_templates, RouteDriver, SupportTicket, SysAdminInvoice, SysAdminInvoiceItem, Tag, TagAssignment
- **Missing tenant_isolation_policy:** 20 tables — carrier_compliance_alert_log, carrier_document_types, carrier_drivers, carrier_expenses, carrier_trucks, clients, contracts, dispatches, DispatchOverrideAudit, driver_pay_records, facilities, in_app_notifications, loads, NotificationSendLog, PlaybookTrigger, PushToken, route_templates, SysAdminInvoice, SysAdminInvoiceItem, UserNotificationPreference
- **Missing bypass_rls_policy:** 18 tables — carrier_compliance_alert_log, carrier_document_types, carrier_drivers, carrier_expenses, carrier_trucks, clients, contracts, dispatches, DispatchOverrideAudit, driver_pay_records, facilities, in_app_notifications, loads, NotificationSendLog, PlaybookTrigger, route_templates, SysAdminInvoice, SysAdminInvoiceItem
- **Missing created_by:** 62 tables
- **Missing updated_by:** 72 tables
- **Missing deleted_at:** 65 tables
- **Missing deleted_by:** 77 tables
- **Non-TIMESTAMPTZ timestamp columns:** 0 columns across 0 tables
- **Missing indexes:** 81 index gaps across 64 tables

## Spot-Check Results

| Table | is_tenant_scoped | has_tenant_id | Notes |
|---|---|---|---|
| User | Y | Y | tenantId (camelCase) correctly detected |
| carrier_drivers | Y | Y | org_id (carrier FK) correctly detected |
| Load | Y | Y | tenantId (camelCase) correctly detected |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed import path depth**
- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** Plan specified `'../src/generated/prisma/client'` but script lives at `scripts/audit/` (two levels deep), so the correct path is `'../../src/generated/prisma/client'`
- **Fix:** Corrected import to `'../../src/generated/prisma/client'`
- **Files modified:** apps/web/scripts/audit/db-tenant-audit.ts
- **Commit:** 9110504

**2. [Rule 1 - Bug] Fixed Prisma adapter deserialization of PG arrays**
- **Found during:** Task 1 (first script run)
- **Issue:** `array_agg(...)` returns a native PostgreSQL array type that the Prisma PgAdapter v7.6.0 cannot deserialize (`UnsupportedNativeDataType` error, code P2010)
- **Fix:** Changed query to `array_to_string(array_agg(a.attname ORDER BY k.ordering), ',')` — returns a plain text string, split on `,` in TypeScript
- **Files modified:** apps/web/scripts/audit/db-tenant-audit.ts
- **Commit:** 9110504

**3. [Rule 1 - Bug] Fixed camelCase column name detection**
- **Found during:** Task 1 (spot-check of User, Load tables)
- **Issue:** Original Prisma models use camelCase DB column names (`tenantId`, `createdAt`, `updatedAt`, etc.) not snake_case as the plan assumed. The first version of the script only checked for `tenant_id` and `org_id`, causing User, Load, Truck, Route, and ~50 other tables to incorrectly show `is_tenant_scoped = N`
- **Fix:** Added dual detection for camelCase variants (`tenantId`, `createdAt`, `createdBy`, `updatedAt`, `updatedById`, `deletedAt`, `deletedById`) alongside snake_case variants
- **Files modified:** apps/web/scripts/audit/db-tenant-audit.ts
- **Commit:** 9110504

**4. [Rule 2 - Missing] Added PrismaPg adapter initialization**
- **Found during:** Task 1 (understanding existing script patterns)
- **Issue:** Plan said to instantiate `PrismaClient` directly, but Prisma 7 requires the `PrismaPg` driver adapter for Node.js (all existing scripts in this codebase use this pattern)
- **Fix:** Added `PrismaPg` + `Pool` setup matching the `seed-qa-accounts.ts` pattern
- **Files modified:** apps/web/scripts/audit/db-tenant-audit.ts
- **Commit:** 9110504

## Self-Check

Checking created files exist:

- `apps/web/scripts/audit/db-tenant-audit.ts` — FOUND
- `docs/audits/db-tenant-audit.md` — FOUND

Checking commits exist:

- `9110504` — FOUND (feat(quick-326): add read-only DB tenant audit script + generated report)

## Self-Check: PASSED
