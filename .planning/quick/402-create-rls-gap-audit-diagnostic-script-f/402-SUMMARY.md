---
phase: quick-402
plan: 402
subsystem: scripts/audit
tags: [rls, security, audit, diagnostic, postgresql, read-only]
dependency_graph:
  requires: []
  provides: [apps/web/scripts/audit/audit-rls-gaps.ts]
  affects: []
tech_stack:
  added: []
  patterns: [pg Pool + PrismaPg adapter, $queryRawUnsafe for pg_catalog queries]
key_files:
  created:
    - apps/web/scripts/audit/audit-rls-gaps.ts
  modified: []
decisions:
  - Avoid regex `s` flag (dotAll) — ES2017 target does not support it; rewrote Prisma schema parser to iterate lines and track brace depth instead
  - Tables appear in multiple sections intentionally (e.g. both Section 2 and 3) — each section reports its own independent concern
  - policy_count and approx_row_count cast to ::int in SQL so Prisma driver returns JS numbers instead of BigInt
metrics:
  duration: 8m
  completed: 2026-05-27
  tasks_completed: 1
  tasks_total: 1
  files_changed: 1
---

# Phase quick Plan 402: RLS Gap Audit Diagnostic Script Summary

Read-only TypeScript audit script that surveys the public Postgres schema and
reports three categories of RLS gaps with tenant-column hints, approximate row
counts, and Prisma-ownership flags — all in a single `npx tsx` invocation.

## File Created

`apps/web/scripts/audit/audit-rls-gaps.ts`

Run from `apps/web/`:
```
npx tsx --env-file=.env.local scripts/audit/audit-rls-gaps.ts
```

## Queries Used

### 1. Main metadata query (single round-trip)

Joins `pg_class` + `pg_namespace` + `pg_stat_user_tables` and uses a correlated
subquery into `pg_policies` to get policy counts in one shot:

```sql
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  COALESCE((
    SELECT COUNT(*)::int
    FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = c.relname
  ), 0) AS policy_count,
  COALESCE(s.n_live_tup, 0)::int AS approx_row_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_stat_user_tables s
  ON s.schemaname = n.nspname AND s.relname = c.relname
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relname
```

### 2. Tenant column query

```sql
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name ILIKE ANY (ARRAY['tenant_id','org_id','tenantid','tenantId'])
```

Priority resolution (mirrors `db-tenant-audit.ts`): `tenant_id` > `tenantId` > `org_id` > first match.

### 3. Prisma schema parse approach

Reads `apps/web/prisma/schema.prisma` at startup, iterates lines tracking brace
depth to extract each `model X { ... }` block, then looks for `@@map("name")`
within the block body. If found, uses the mapped name; otherwise uses the model
name as-is (Prisma default). Comparison is case-insensitive (`toLowerCase()`).

## Actual Script Output (live run — 2026-05-27)

```
RLS Gap Audit — starting...
Prisma schema parsed: 89 known table names.
Found 91 tables in public schema.

=== Section 1: Tables with RLS DISABLED (relrowsecurity = false) ===

  TABLE                                     TENANT_COL      ~ROWS     IN_PRISMA
  -----------------------------------------------------------------------------
  carrier_compliance_alert_log              org_id          29        no
  carrier_catalog_meta                      -               93        yes
  grid_preference                           -               0         yes
  grid_view                                 -               0         yes
  NotificationEmailConfig                   -               0         yes
  NotificationTemplate                      -               37        yes
  Plan                                      -               4         yes
  Promo                                     -               0         yes

=== Section 2: Tables with RLS enabled but FORCE RLS OFF (relforcerowsecurity = false) ===

  TABLE                                     TENANT_COL      ~ROWS     IN_PRISMA
  -----------------------------------------------------------------------------
  _prisma_migrations                        -               109       no
  carrier_documents                         -               11        yes
  route_template_stops                      -               11        yes
  stops                                     -               267       yes
  Tenant                                    -               18        yes
  TicketMessage                             -               2         yes

=== Section 3: Tables with RLS enabled but ZERO policies ===

  TABLE                                     TENANT_COL      ~ROWS     IN_PRISMA
  -----------------------------------------------------------------------------
  _prisma_migrations                        -               109       no

Summary: 8 tables need RLS enabled, 6 need FORCE RLS, 1 have RLS but no policies
```

## RLS Gap Findings

### Section 1 — RLS completely disabled (8 tables)

| Table | Tenant column | ~Rows | Notes |
|---|---|---|---|
| `carrier_compliance_alert_log` | `org_id` | 29 | Tenant-scoped; needs RLS |
| `carrier_catalog_meta` | - | 93 | Check if tenant isolation needed |
| `grid_preference` | - | 0 | UI prefs — check scope |
| `grid_view` | - | 0 | UI views — check scope |
| `NotificationEmailConfig` | - | 0 | Likely tenant-scoped config |
| `NotificationTemplate` | - | 37 | Likely needs scoping |
| `Plan` | - | 4 | Subscription plans — may be global |
| `Promo` | - | 0 | Promo codes — may be global |

### Section 2 — RLS on but FORCE RLS off (6 tables)

These tables have RLS enabled but `relforcerowsecurity = false`, meaning table
owners bypass policies. All need `ALTER TABLE x FORCE ROW LEVEL SECURITY`:

`_prisma_migrations`, `carrier_documents`, `route_template_stops`, `stops`,
`Tenant`, `TicketMessage`

### Section 3 — RLS on but zero policies (1 table)

`_prisma_migrations` — RLS is enabled but no policies exist. Since this is the
Prisma migrations tracking table, it is intentionally isolated, but the empty
policy set means no row is accessible under RLS mode.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Rewrote Prisma schema parser to avoid ES2017 regex incompatibility**
- **Found during:** Task 1 verification (tsc --noEmit)
- **Issue:** The `/model\s+(\w+)\s*\{([^}]*)\}/gs` regex used the `s` (dotAll) flag which is only available when targeting ES2018+. The project tsconfig targets ES2017.
- **Fix:** Replaced with a line-by-line brace-depth parser that collects model blocks without needing dotAll mode.
- **Files modified:** `apps/web/scripts/audit/audit-rls-gaps.ts`
- **Commit:** 8c9cce2e

## Self-Check: PASSED

- `apps/web/scripts/audit/audit-rls-gaps.ts` — FOUND
- Commit `8c9cce2e` — FOUND
- Script executed successfully, exit 0
- All three section headers present in output
- Summary line present with three integers (8, 6, 1)
- No DML/DDL — grep confirms only comment reference, no executable statements
- No `: any` in data shape interfaces
- tsc reports zero new errors for this file
