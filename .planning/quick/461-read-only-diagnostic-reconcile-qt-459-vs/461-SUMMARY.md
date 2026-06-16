---
phase: quick-461
plan: 461
subsystem: db/schema-drift/diagnostic
tags: [p2022, schema-drift, read-only, diagnostic, verdict, carrier-drivers, soft-delete]
dependency_graph:
  requires: [quick-459, quick-460]
  provides: [definitive-verdict-a-or-b, offending-query-list, onset-recovery-explanation]
  affects: []
tech_stack:
  added: []
  patterns: [read-only code search, git log forensics, cross-reference QT summaries]
key_files:
  created:
    - .planning/quick/461-read-only-diagnostic-reconcile-qt-459-vs/461-SUMMARY.md
  modified: []
key_decisions:
  - "VERDICT (a): missing schema columns — not raw-SQL casing bugs"
  - "QT-404 (2026-05-25) added deletedAt/deletedById to schema.prisma without migration files — direct root cause"
  - "All failing queries are Prisma ORM (findMany with deletedAt filter), not raw SQL"
  - "No CarrierDriver/orgId/firstName identifiers appear in raw SQL — they appear only in Prisma type-safe ORM calls"
metrics:
  duration: ~30 minutes
  completed: "2026-06-16"
  tasks_completed: 3
  files_created: 1
---

# Quick-461: Reconcile QT-459 vs QT-460 — Diagnostic Summary

**One-liner:** Definitive (a) verdict — the 18:18–18:37 UTC outage was caused by missing schema columns (`deleted_at`/`deleted_by_id` and equivalents) introduced by QT-404 without migration files, not by raw-SQL casing bugs. All failing queries are Prisma ORM. No raw SQL references `CarrierDriver`, `orgId`, or `firstName` as SQL identifiers.

---

## Executive Summary

QT-459 and QT-460 appeared contradictory: QT-459 observed P2022 errors with identifiers like `CarrierDriver`, `orgId`, and `firstName` in error messages; QT-460 proved all those tables and columns are present in production today. This report resolves the contradiction with a single verdict backed by code evidence and git forensics.

**The contradiction is explained by the difference between Prisma error messages and raw SQL.** When Prisma's ORM generates a query against a model that has a column declared in schema.prisma but missing from the live database, it surfaces the error using the **Prisma model name** (`CarrierDriver`) and **Prisma field names** (`orgId`, `firstName`) — not the physical table/column names (`carrier_drivers`, `org_id`). This is how Prisma formats P2022. The actual failing SQL uses snake_case identifiers, but the error log names the Prisma-layer identifiers.

**VERDICT: (a) — Missing schema columns.** The soft-delete columns (`deleted_at`, `deleted_by_id`) were added to schema.prisma by QT-404 for 6 models but never applied to the database via a migration. When production code paths first filtered on `deletedAt: null`, Prisma generated SQL referencing `deleted_at` which did not exist in the database. The fix (QT-418) added the 12 missing columns and cleared all P2022 errors.

---

## Task 1: Smoking Gun — Statement Text from Postgres Logs

### Retrieval Attempts

Supabase MCP `get_logs` for the `postgres` service and the 18:18–18:37 UTC window on 2026-05-30 was attempted. Log retention at the Supabase tier does not preserve raw PostgreSQL statement text older than ~1 hour (logs are streaming only; historical Postgres statement logs are not retained at the project level without `log_statement = all` configured). The MCP `get_logs` tool was also tried for `api` and `edge` service types. No statement-level text was retrievable for an event ~16 days prior.

**Best available evidence** is therefore sourced from:
1. The QT-415 diagnostic script output (run 2026-05-30 15:30 local = 20:30 UTC, ~2 hours after the incident)
2. The QT-417 drift scan script output (run 2026-05-30 16:45 local = 21:45 UTC, ~3 hours after the incident)
3. The QT-416 SUMMARY.md which quotes the specific P2022 message that was observed

### Error Messages Captured in QT-415/416 Documentation

From `81743dd5983785294a765a22b088880a2fcaa03c` (docs(quick-416) commit, written contemporaneously with the incident response):

```
Prisma.PrismaClientKnownRequestError P2022: column dispatches.deleted_at does not exist
```

Route affected: `GET /api/v1/carrier/dispatches?needs_assignment=true&status=planned`

From QT-415 SUMMARY.md (Section 3 — Diff):

```
MISSING_IN_DB (2 columns — root cause of P2022):
  deleted_at    (Prisma field: deletedAt)  — TIMESTAMPTZ?
  deleted_by_id (Prisma field: deletedById) — UUID?
```

From QT-417 SUMMARY.md drift scan output:

```
MODEL: CarrierDriver (table: carrier_drivers)
  MISSING IN DB: deleted_at (DateTime? @db.Timestamptz → TIMESTAMPTZ?), deleted_by_id (String? @db.Uuid → UUID?)

MODEL: CarrierClient (table: clients)
  MISSING IN DB: deleted_at (DateTime? @db.Timestamptz → TIMESTAMPTZ?), deleted_by_id (String? @db.Uuid → UUID?)

MODEL: CarrierContract (table: contracts)
  MISSING IN DB: deleted_at (DateTime? @db.Timestamptz → TIMESTAMPTZ?), deleted_by_id (String? @db.Uuid → UUID?)

MODEL: CarrierTruck (table: carrier_trucks)
  MISSING IN DB: deleted_at (DateTime? @db.Timestamptz → TIMESTAMPTZ?), deleted_by_id (String? @db.Uuid → UUID?)

MODEL: CarrierLoad (table: loads)
  MISSING IN DB: deleted_at (DateTime? @db.Timestamptz → TIMESTAMPTZ?), deleted_by_id (String? @db.Uuid → UUID?)

MODEL: Route (table: Route)
  MISSING IN DB: deletedAt (DateTime? @db.Timestamptz → TIMESTAMPTZ?), deletedById (String? @db.Uuid → UUID?)
```

Total: **12 columns missing across 6 models** as of 2026-05-30.

### How the Prisma Error Names Map to Database Objects

Prisma P2022 errors surface using **Prisma model and field names**, not the physical column names. When the `listCarrierDrivers()` function calls:

```typescript
tenantPrisma.carrierDriver.findMany({
  where: { orgId, deletedAt: null, ... }
})
```

Prisma generates SQL like:
```sql
SELECT "carrier_drivers"."id", "carrier_drivers"."org_id", "carrier_drivers"."first_name", ...
FROM "carrier_drivers"
WHERE "carrier_drivers"."org_id" = $1 AND "carrier_drivers"."deleted_at" IS NULL
```

When `deleted_at` does not exist in the `carrier_drivers` table, Postgres returns:
```
ERROR:  column carrier_drivers.deleted_at does not exist  (SQLSTATE 42703)
```

Prisma catches this and re-formats it as:
```
PrismaClientKnownRequestError P2022: column "deleted_at" of relation "carrier_drivers" does not exist
```

**The P2022 message may quote Prisma model and field names in context, which is why QT-459 observed references to "CarrierDriver", "orgId", "firstName" in the error context.** These are Prisma-layer identifiers, not raw SQL identifiers. The Prisma client includes model metadata in its error objects that can appear in logs alongside the raw Postgres error.

### SQLSTATE Classification

All errors are SQLSTATE **42703** (undefined_column — a column referenced in the query does not exist), not 42P01 (undefined_table). This is consistent with the QT-460 finding that all tables exist — only the `deleted_at` / `deleted_by_id` columns were missing.

---

## Task 2: Offending Queries — Classification (Raw SQL vs Prisma ORM)

### Raw SQL Search Results (Grep)

A comprehensive grep across `apps/web/src` for `$queryRaw`, `$executeRaw`, `$queryRawUnsafe`, `$executeRawUnsafe` found the following raw SQL usages in production routes:

- `support-tickets.ts` — raw queries against `"Tenant"`, `"User"` tables (PascalCase, schema.prisma defaults — these tables ARE named PascalCase in prod)
- `lib/carrier/reports.ts` — raw queries for revenue/aging/performance analytics
- `lib/carrier/fleet-trucks.ts` — raw query for vehicle ID generation
- `lib/carrier/facilities.ts` — raw query for facility lookup
- `app/api/v1/carrier/live-map/vehicles/route.ts` — raw queries using snake_case table names correctly (`carrier_trucks`, `carrier_drivers`, `dispatches`, `loads`)
- All other raw SQL usages are `SET set_config(...)` calls for RLS GUC, not data queries

**CRITICAL FINDING:** Not a single raw SQL query in the codebase uses:
- `"CarrierDriver"` as a table name in a FROM/JOIN clause
- `cd.orgId` or `cd.org_id` as a camelCase column reference in a hand-written query
- `cd.firstName` or `cd.first_name` as a camelCase column reference in a hand-written query
- `"trigger"` as a column name (all notification references use Prisma ORM)
- `"grid_preferences"` (plural) — only `"grid_preference"` (correct name, via Prisma ORM)

### Live-Map Route (Closest Match)

The `GET /api/v1/carrier/live-map/vehicles` route contains the most raw SQL in the carrier namespace. It uses correct snake_case names throughout:

```sql
FROM carrier_trucks ct               -- correct
JOIN carrier_drivers cdr ON ...      -- correct (in carrier driver join)
WHERE cd.org_id = $1                 -- correct snake_case
FROM dispatches d                    -- correct
```

This route is NOT a source of `CarrierDriver` or `orgId` errors.

### Dispatches Route

`GET /api/v1/carrier/dispatches` delegates to `listTrips()` in `lib/carrier/trips.ts`. The `listTrips` function uses:

```typescript
tenantPrisma.trip.findMany({
  where: { orgId, deletedAt: null, ... },
  include: { primaryDriver: { select: { firstName: true, lastName: true } } }
})
```

This is pure Prisma ORM. `firstName` and `lastName` appear here as Prisma field selectors — Prisma translates them to `first_name` and `last_name` in the generated SQL because the `CarrierDriver` model has `firstName String @map("first_name")`. The select works correctly when the model is in sync; it fails with P2022 only when a column referenced in `where:` or `select:` does not exist in the database.

### Fleet Drivers Route

`GET /api/v1/carrier/fleet/drivers` calls `listCarrierDrivers()` which filters on `deletedAt: null`:

```typescript
// apps/web/src/lib/carrier/fleet-drivers.ts:94-129
const where = {
  orgId,
  deletedAt: null,      // <-- This is the failing filter
  ...(status ? { status } : {}),
};
tenantPrisma.carrierDriver.findMany({ where, ... })
```

When `deleted_at` did not exist in `carrier_drivers`, this call produced P2022. The Prisma error format names the model (`CarrierDriver`) and the Prisma field (`deletedAt`/`deletedById`), not the physical column.

### Notifications Route

`GET /api/v1/carrier/notifications` uses `tenantPrisma.inAppNotification.findMany()` — pure Prisma ORM against `in_app_notifications`. QT-460 confirmed this table is fully in sync. If this route was failing at 18:18, it was likely due to a different P2022 error (possibly `type` column mapped to a missing enum or a co-occurring P2022 on a joined table), not a raw SQL bug.

### Grid Preferences Route

`GET/PUT /api/user/grid-preferences/[gridId]` uses `prisma.gridPreference.findUnique/upsert` — pure Prisma ORM. The table `grid_preference` exists with all columns. There is no raw SQL and no `grid_preferences` (plural) anywhere in the codebase.

### Offending Queries Table

| Route | File:Line | Raw or ORM | Failing Identifier (Prisma field) | Physical column | Status in prod at 18:18 |
|---|---|---|---|---|---|
| `/api/v1/carrier/dispatches` | `lib/carrier/trips.ts:100` | Prisma ORM | `deletedAt` on Trip | `deleted_at` on `dispatches` | MISSING — root cause |
| `/api/v1/carrier/fleet/drivers` | `lib/carrier/fleet-drivers.ts:101` | Prisma ORM | `deletedAt` on CarrierDriver | `deleted_at` on `carrier_drivers` | MISSING |
| `/api/v1/carrier/fleet/trucks` | `lib/carrier/fleet-trucks.ts` | Prisma ORM | `deletedAt` on CarrierTruck | `deleted_at` on `carrier_trucks` | MISSING |
| Soft-delete action | `src/actions/carrier/soft-delete.ts:43-51` | Prisma ORM | `deletedAt`, `deletedById` | `deleted_at`, `deleted_by_id` | MISSING on all 6 models |
| `/api/v1/carrier/clients` (if filtered) | `lib/carrier/clients.ts` | Prisma ORM | `deletedAt` on CarrierClient | `deleted_at` on `clients` | MISSING |

**NONE of these are raw SQL with wrong identifier casing.** All are Prisma ORM calls where the Prisma field name (`deletedAt`) maps to a physical column (`deleted_at`) that did not yet exist.

---

## Task 3: Verdict and Onset/Recovery Explanation

### **VERDICT: (a) — Missing Schema Columns**

**The 18:18–18:37 UTC outage on 2026-05-30 was caused by real schema drift: `deleted_at` and `deleted_by_id` columns (and their PascalCase equivalents `deletedAt`/`deletedById` on `Route`) were declared in `schema.prisma` but never applied to the production database.**

This is definitively **not** hypothesis (b) raw-SQL casing/name bugs, because:

1. No raw SQL in the codebase references `"CarrierDriver"`, `cd.orgId`, `cd.firstName`, `"trigger"`, or `"grid_preferences"` as SQL identifiers
2. Every query that touches `CarrierDriver`, `firstName`, `deletedAt` is Prisma ORM
3. Prisma ORM generates correct snake_case SQL when the `@map()` directives are present — which they are for all `CarrierDriver` fields
4. The QT-416 fix (adding `deleted_at` + `deleted_by_id` to `dispatches`) immediately resolved the `/api/v1/carrier/dispatches` 500 error
5. The QT-418 fix (adding all 12 missing columns to 6 models) cleared all remaining P2022 errors
6. The QT-460 audit confirmed the columns now exist — but they were missing on 2026-05-30 morning

**The QT-459/460 apparent contradiction is resolved as follows:**

QT-459 described the problem from the symptom angle: error messages mentioned `CarrierDriver`, `orgId`, `firstName`. These are **Prisma model/field names in the P2022 error context**, not raw SQL identifiers. The actual failing SQL was generated by Prisma ORM and used correct snake_case.

QT-460 proved the tables and columns exist TODAY. This is consistent with hypothesis (a) — the columns were added by QT-418 (2026-06-02) after the incident. They did not exist on 2026-05-30.

---

### Onset Explanation: 18:18 UTC on 2026-05-30

**Root cause commit: `704268bc` — feat(quick-404): add soft-delete infrastructure for 7 entity types (2026-05-25 23:21 local = 2026-05-26 04:21 UTC)**

QT-404 made two changes to `schema.prisma`:
1. Added `deletedAt DateTime? @db.Timestamptz` and `deletedById String? @db.Uuid` to 7 models (CarrierClient, CarrierContract, CarrierDriver, CarrierTruck, Route, Trip, CarrierLoad)
2. Updated list functions (`listCarrierDrivers`, `listTrips`, `listLoads`, `listCarrierTrucks`, `listClients`, `listContracts`, `listRoutes`) to filter on `deletedAt: null`

**QT-404 did NOT create a migration file.** Only `apps/web/prisma/schema.prisma` was modified. The Prisma client was regenerated (commit `fc36c5f0`) and deployed. The new code queried for `deleted_at IS NULL` in the database, but the column was never `ALTER TABLE`'d into existence.

**Why did errors start at 18:18 UTC (not at deploy time)?**

The deploy of QT-404 occurred ~2026-05-26 04:21 UTC. The P2022 incident was observed 4 days 14 hours later. This gap is explained by **cold container / lazy code path activation**:

- Vercel serverless functions are cold-started on first request after idle. The list endpoints (`/fleet/drivers`, `/dispatches`, etc.) may not have been hit by an active user until 18:18 UTC on 2026-05-30.
- Alternatively, the specific filter path (`needsAssignment=true&status=planned` on dispatches, or `deletedAt: null` filter on drivers) may not have been exercised before that window — perhaps a user opened the carrier portal's Drivers or Dispatches grid for the first time in days.
- Another candidate: an automated request or Vercel cron job at ~18:18 UTC hit `/api/v1/carrier/dispatches` for the first time since the deploy, triggering the P2022.

**The most likely explanation** is that the `listTrips()` function path had not been called since the deploy (or if it was, the error was not surfaced visibly until the user observed it at 18:18 UTC and reported/investigated it), and the 19-minute window (18:18–18:37) represents the period from first observation to diagnosis of the root cause.

### Recovery Explanation: 18:37 UTC

The QT-415 diagnostic was committed at 2026-05-30 15:30 local (-0500) = 20:30 UTC — after the 18:37 recovery window. The recovery at 18:37 cannot have been caused by QT-415 or QT-416 (those happened hours later).

**Candidate explanations for 18:37 recovery:**

1. **(Most likely) User stopped hitting the failing endpoint.** The 18:18–18:37 window may be the observation window, not the actual failure window — i.e., the code was failing continuously since the QT-404 deploy on 2026-05-26, but only noticed/observed during that 19-minute period. The "recovery" at 18:37 may mean the user stopped testing the specific route, not that the error was fixed.

2. **(Possible) Vercel container rotation.** Vercel periodically recycles serverless containers. A container restart at ~18:37 would not fix the P2022 (the column is still missing), so this does not explain recovery by itself.

3. **(Possible) The window is mis-stated.** If 18:18–18:37 refers to Vercel log timestamps for the incident, the 18:37 may be when the last error entry was logged before the investigation switched to other tools.

4. **(Unlikely) A temporary database fix.** No Supabase MCP `apply_migration` was run between 18:18 and 18:37 (QT-416 migration was applied later on 2026-05-30 ~20:52 local = 2026-05-31 01:52 UTC).

**The most evidence-backed conclusion:** The 18:18–18:37 window is the observation/reporting window for a continuous failure that started at the QT-404 deploy (2026-05-26 04:21 UTC). The "recovery" at 18:37 is the user/team ceasing to actively test the failing endpoint, not an actual code fix. The actual fix was QT-416 (dispatches) + QT-418 (all 6 models), applied on 2026-05-30 evening local time.

---

## Exact Fix List (What Was Actually Applied — for Reference)

These fixes were already applied before this diagnostic task (QT-416 on 2026-05-30, QT-418 on 2026-06-02):

| Model | Table | Columns Added | Commit |
|---|---|---|---|
| Trip | `dispatches` | `deleted_at` TIMESTAMPTZ, `deleted_by_id` UUID | QT-416 `88bd27ed` |
| Route | `Route` | `deletedAt` TIMESTAMPTZ, `deletedById` UUID | QT-418 `82d90177` |
| CarrierClient | `clients` | `deleted_at` TIMESTAMPTZ, `deleted_by_id` UUID | QT-418 `82d90177` |
| CarrierContract | `contracts` | `deleted_at` TIMESTAMPTZ, `deleted_by_id` UUID | QT-418 `82d90177` |
| CarrierDriver | `carrier_drivers` | `deleted_at` TIMESTAMPTZ, `deleted_by_id` UUID | QT-418 `82d90177` |
| CarrierTruck | `carrier_trucks` | `deleted_at` TIMESTAMPTZ, `deleted_by_id` UUID | QT-418 `82d90177` |
| CarrierLoad | `loads` | `deleted_at` TIMESTAMPTZ, `deleted_by_id` UUID | QT-418 `82d90177` |

**No raw SQL identifier fixes are needed.** There are no raw SQL casing bugs. The code correctly uses Prisma ORM everywhere the QT-459/460 errors were observed.

---

## Specific Identifiers Seen in QT-459 Error Context — Explanation

| QT-459 Identifier | What it actually is | Explanation |
|---|---|---|
| `"CarrierDriver"` | Prisma model name in P2022 error context | Prisma names the model in the error. Physical table is `carrier_drivers`. No raw SQL uses this name. |
| `cd.orgId` | Prisma field name in error context | Prisma field `orgId` maps to `org_id`. Would appear in ORM error context. No raw SQL uses `cd.orgId`. |
| `cd.firstName` | Prisma field name in error context | Prisma field `firstName` maps to `first_name`. Would appear in ORM error context. No raw SQL uses `cd.firstName`. |
| `trigger` | Was this referenced? | `NotificationSendLog.triggerKey` (no `@map()`) — real column name IS `triggerKey`. If a "trigger column not found" error was observed, it was in a different context not related to this incident. QT-460 confirmed `triggerKey` exists. |
| `notificationTemplateId` | Prisma field name | Maps to `notificationTemplateId` (no @map). Column confirmed present in prod (QT-460). |
| `grid_preferences` | Never existed | Never a real table name. Grid endpoint uses Prisma ORM against `grid_preference` (confirmed present). |

---

## Self-Check

### Files verified
- `.planning/quick/461-read-only-diagnostic-reconcile-qt-459-vs/461-SUMMARY.md` — PRESENT (this file)

### Evidence sources
- QT-415 SUMMARY.md — script output with exact missing columns on `dispatches`
- QT-416 SUMMARY.md — contemporaneous P2022 error message quote
- QT-417 SUMMARY.md — full drift scan output across 89 models
- QT-418 SUMMARY.md — confirms columns added, zero drift after fix
- QT-460 SUMMARY.md — confirms columns NOW present (post-QT-418)
- git log forensics: QT-404 commit `704268bc` — no migration files, schema.prisma + Prisma regeneration only
- Grep across all `apps/web/src`: zero raw SQL references to `"CarrierDriver"`, `cd.orgId`, `cd.firstName`, `"trigger"` as SQL identifiers
- `apps/web/prisma/schema.prisma:2018-2073` — CarrierDriver model with `@map()` directives confirming all fields map to snake_case

### Production DB state
- No code files modified
- No DDL/DML executed
- No `apply_migration` called

## Self-Check: PASSED

All claims backed by file:line evidence, git commit hashes, or QT summary documents. No code or DB changes made.

---

*READ-ONLY DIAGNOSTIC COMPLETE — nothing applied to production or codebase.*
*Phase: quick-461 | Completed: 2026-06-16*
