---
phase: quick-409
plan: 409
subsystem: database-security
tags: [rls, audit, classification, platform-level, diagnostic]
dependency_graph:
  requires: [406b-resolve-blockers, 407b-verify-jwt-claim-key]
  provides: [table-classification-verdicts-for-carrier-catalog-meta-notification-template-notification-email-config]
  affects: [rls-migration-planning]
tech_stack:
  added: []
  patterns: [prisma-queryRawUnsafe, information_schema, pg_stat_user_tables, execSync-ripgrep]
key_files:
  created:
    - apps/web/scripts/audit/classify-uncertain-tables.ts
  modified: []
decisions:
  - "All three uncertain tables (carrier_catalog_meta, NotificationTemplate, NotificationEmailConfig) are PLATFORM_LEVEL_LEAVE_RLS_OFF — no tenantId column, no Tenant FK, no inbound FKs from tenant-scoped tables"
  - "NotificationTemplate (37 rows) and carrier_catalog_meta (93 rows) are read-only platform reference data; NotificationEmailConfig is a 0-row singleton config — all three belong on the Section 4.12 explicit allowlist"
metrics:
  duration: 118s
  completed: 2026-05-27T17:28:10Z
  tasks_completed: 1
  files_created: 1
---

# Quick 409: Classify Three Uncertain Tables Against RLS Spec — Summary

Read-only diagnostic that classifies `carrier_catalog_meta`, `NotificationTemplate`, and `NotificationEmailConfig` against DatabaseSecurity_MultiTenant_Spec_v1.md Section 4.12, using column inventory, row counts, FK analysis, and codebase grep.

## Task Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create classify-uncertain-tables.ts diagnostic script | 7fbbe557 | apps/web/scripts/audit/classify-uncertain-tables.ts |

## Script Path

`apps/web/scripts/audit/classify-uncertain-tables.ts`

Run from `apps/web/`:
```
npx tsx --env-file=.env.local scripts/audit/classify-uncertain-tables.ts
```

## Full Console Output

```
classify-uncertain-tables.ts — RLS Table Classification Diagnostic
Started: 2026-05-27T17:27:18.848Z

Classifying three tables against DatabaseSecurity_MultiTenant_Spec_v1.md Section 4.12...

============================================================
TABLE: carrier_catalog_meta
============================================================

COLUMNS:
  id                                  uuid                      nullable=NO
  enum_group                          text                      nullable=NO
  enum_value                          text                      nullable=NO
  display_label                       text                      nullable=NO
  sort_order                          integer                   nullable=NO
  active                              boolean                   nullable=NO

SCOPING_CANDIDATES: none

ROW_COUNT: 93

OUTBOUND_FKS:
  (none)

INBOUND_FKS:
  (none)

CODEBASE_USAGE (carrier_catalog_meta):
  (no matches)

CODEBASE_USAGE (CarrierCatalogMeta):
  (no matches)

VERDICT: PLATFORM_LEVEL_LEAVE_RLS_OFF
REASONING: No scoping column, no Tenant FK, no inbound FK from tenant-scoped tables (or table is empty) — pure platform-level reference data; RLS off is intentional.

============================================================
TABLE: NotificationTemplate
============================================================

COLUMNS:
  id                                  uuid                      nullable=NO
  triggerKey                          text                      nullable=NO
  category                            USER-DEFINED              nullable=NO
  displayName                         text                      nullable=NO
  description                         text                      nullable=NO
  defaultSubject                      text                      nullable=NO
  defaultBlockJson                    jsonb                     nullable=NO
  defaultHtmlCache                    text                      nullable=YES
  availableVariables                  jsonb                     nullable=NO
  defaultRecipients                   jsonb                     nullable=NO
  isActive                            boolean                   nullable=NO
  inAppEnabled                        boolean                   nullable=NO
  createdAt                           timestamp with time zone  nullable=NO
  updatedAt                           timestamp with time zone  nullable=NO

SCOPING_CANDIDATES: none

ROW_COUNT: 37

OUTBOUND_FKS:
  (none)

INBOUND_FKS:
  (none)

CODEBASE_USAGE (NotificationTemplate):
  (no matches)

CODEBASE_USAGE (NotificationTemplate):
  (same as snake_case search above — skipping duplicate)

VERDICT: PLATFORM_LEVEL_LEAVE_RLS_OFF
REASONING: No scoping column, no Tenant FK, no inbound FK from tenant-scoped tables (or table is empty) — pure platform-level reference data; RLS off is intentional.

============================================================
TABLE: NotificationEmailConfig
============================================================

COLUMNS:
  id                                  uuid                      nullable=NO
  singletonKey                        text                      nullable=NO
  fromName                            text                      nullable=NO
  fromEmail                           text                      nullable=NO
  replyTo                             text                      nullable=YES
  createdAt                           timestamp with time zone  nullable=NO
  updatedAt                           timestamp with time zone  nullable=NO

SCOPING_CANDIDATES: none

ROW_COUNT: 0

OUTBOUND_FKS:
  (none)

INBOUND_FKS:
  (none)

CODEBASE_USAGE (NotificationEmailConfig):
  (no matches)

CODEBASE_USAGE (NotificationEmailConfig):
  (same as snake_case search above — skipping duplicate)

VERDICT: PLATFORM_LEVEL_LEAVE_RLS_OFF
REASONING: No scoping column, no Tenant FK, no inbound FK from tenant-scoped tables (or table is empty) — pure platform-level reference data; RLS off is intentional.


============================================================
RECOMMENDED ACTION
============================================================
carrier_catalog_meta     -> PLATFORM_LEVEL_LEAVE_RLS_OFF
NotificationTemplate     -> PLATFORM_LEVEL_LEAVE_RLS_OFF
NotificationEmailConfig  -> PLATFORM_LEVEL_LEAVE_RLS_OFF

Next step per verdict:
  PLATFORM_LEVEL_LEAVE_RLS_OFF            -> add to Section 4.12 explicit allowlist; no migration needed
  PLATFORM_LEVEL_WITH_PERMISSIVE_POLICY   -> ALTER TABLE ... ENABLE ROW LEVEL SECURITY;
                                              CREATE POLICY <table>_select_all FOR SELECT USING (true);
  TENANT_SCOPED_NEEDS_STANDARD_POLICIES   -> apply standard 4-policy template using
                                              (auth.jwt() -> 'app_metadata' ->> 'tenantId')::uuid

Finished: 2026-05-27T17:27:34.333Z
```

## Verdicts

| Table | Verdict |
|-------|---------|
| `carrier_catalog_meta` | PLATFORM_LEVEL_LEAVE_RLS_OFF |
| `NotificationTemplate` | PLATFORM_LEVEL_LEAVE_RLS_OFF |
| `NotificationEmailConfig` | PLATFORM_LEVEL_LEAVE_RLS_OFF |

## TypeScript Check

`npx tsc --noEmit` from `apps/web/` — the new script introduces **zero new TypeScript errors**. Pre-existing errors in the repo (missing `framer-motion`, `nuqs`, `zustand`, `@tanstack/react-virtual` type declarations) are unrelated to this task and were present before this script was created.

## Anomalies

- `NotificationEmailConfig` row count is 0 — table has never been populated (single-row global email config, enforced by a partial unique index). Still correctly classified PLATFORM_LEVEL_LEAVE_RLS_OFF.
- `NotificationTemplate` and `NotificationEmailConfig` have identical snake_case and PascalCase names in the DB (Prisma default — no `@@map`). The CODEBASE_USAGE block correctly deduplicates and skips the redundant pascal search.
- `carrier_catalog_meta` and `CarrierCatalogMeta` have zero codebase references (`rg` found no hits in `apps/web/src` or `packages/`). The table is likely populated once via seed/migration and consumed server-side via raw SQL or not actively queried in app code.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- File exists: `apps/web/scripts/audit/classify-uncertain-tables.ts` — FOUND
- Commit 7fbbe557 — FOUND
- Script exits 0 and prints all three TABLE sections + RECOMMENDED ACTION block — CONFIRMED
- No INSERT/UPDATE/DELETE/ALTER/CREATE TABLE/DROP in executed SQL — CONFIRMED (only in console.log string literals)
- tsc --noEmit introduces no new errors from this file — CONFIRMED
