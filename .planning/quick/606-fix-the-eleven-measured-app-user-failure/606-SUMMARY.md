---
phase: quick-606
plan: 01
subsystem: database / RLS cutover
tags: [app_user, rls, tripwire, cron, migrations, staging, guards]
requires:
  - quick-602 (the unmigrated-path tripwire)
  - quick-604 (the measurement this task fixes)
  - quick-605 (rows 10 and 11, already fixed)
provides:
  - "thirteen measured app_user failures closed on staging"
  - "docs/audits/app-user-failure-remediation.md"
  - "tests/security/tenant-mechanism-fence.test.ts"
  - "tests/security/606-report-integrity.test.ts"
  - "two migrations, staging-applied, each proven before it was written"
affects:
  - apps/web/src/app/api/cron/* (7 routes)
  - apps/web/src/app/(owner)/carrier/trips, (driver)/documents, track/[token]
  - apps/web/src/lib/notifications/*
  - apps/web/scripts/audit/* (3 extended, 8 new)
tech-stack:
  added: []
  patterns:
    - "getTenantPrismaForOrg for per-tenant cron work; getAdminDb for the tenant list"
    - "LATENT and NOT_MEASURED as first-class verdicts, never folded into pass"
    - "privileged counter-reads with in-window CONTROL rows on every write path"
key-files:
  created:
    - docs/audits/app-user-failure-remediation.md
    - apps/web/tests/security/tenant-mechanism-fence.test.ts
    - apps/web/tests/security/606-report-integrity.test.ts
    - apps/web/prisma/migrations/20260915120000_document_column_drift_staging_parity/migration.sql
    - apps/web/prisma/migrations/20260915130000_grant_playbook_notification_to_app_admin/migration.sql
  modified:
    - apps/web/src/app/api/cron/{carrier-auto-dispatch,carrier-compliance-alerts,digest-compliance-30day,digest-daily-driver,digest-weekly-owner,purge-deleted,send-reminders,trip-reminders}/route.ts
    - apps/web/src/app/(owner)/carrier/trips/page.tsx
    - apps/web/src/app/(driver)/documents/page.tsx
    - apps/web/src/app/track/[token]/page.tsx
    - apps/web/src/lib/db/admin-reasons.ts
    - apps/web/scripts/audit/{604-survey,604-click-through,604-classify}.ts
decisions:
  - "withTenantRLS survives and is fenced, not deleted — it is composed inside createTenantClient"
  - "createTenantClient gets a FROZEN INVENTORY, not a fence — a fence would be red against correct code"
  - "/track/[token] routed to the existing getAdminDb reason despite a production liveness count of zero"
  - "a second unpredicted 42501 closed by deleting a query filter rather than granting a second table"
metrics:
  duration: one session
  completed: 2026-09-15
---

# quick-606: Fix the measured `app_user` failures — Summary

**All thirteen measured failures now answer 2xx on staging as `app_user` with the tripwire armed.**
The closing fifteen-row re-run is **8 pass · 0 fail · 5 LATENT · 2 NOT_MEASURED**, and nothing is
folded into pass. Full report: `docs/audits/app-user-failure-remediation.md`.

**Production was read at open and at close and never written** — 156 / 183 /
`20260914170000_activation_progress_congrats_shown_at`, identical both times, `--close` exit 0.

## The two measurements that contradicted the plan

Both are recorded as contradictions rather than reconciled in prose.

1. **`carrier-auto-dispatch` was not a fixture problem.** It raised `TC001` at `route.ts:52` on a
   bare-client tenant sweep. quick-604 saw the fixture error because an earlier request had left a
   GUC on the `max: 1` pool. **The same route gives two different failures on two runs, purely on
   request order** — `unmigrated-path-tripwire.md` §8 item 7 made concrete.
2. **`trip-reminders` had stopped raising, and that was worse.** HTTP 200, `ok: true`, zero `TC001`,
   `tenantsProcessed: 1` against two active tenants. Nothing was refused; the bare tenant list was
   RLS-filtered to one tenant and the route reported success having skipped the other. The harness
   gained a `SILENT PARTIAL SWEEP` rule because this run produced one.

## What happened to `withTenantRLS`

**It survives.** It is composed inside `createTenantClient`, and `getTenantPrisma` /
`getTenantPrismaForOrg` set the GUC *and* apply it. The defect was direct use from feature code —
nine sites, three of them a fourth shape (`createTenantClient` used directly) the brief's five-site
list did not cover. All three digest routes carried a comment calling their own scoping
**"DECORATIVE, left untouched"**: a known defect written down and left, which is exactly what the new
fence exists to stop.

## Two migrations, each proven before it was written

- `Document` column drift — conditional on a production `information_schema.columns` read; all five
  columns nullable with one unambiguous type each, so the file is a **proven no-op on production**.
- `GRANT SELECT ON "PlaybookNotification" TO app_admin` — the denied role checked against
  `role_table_grants` first (`app_user` already had full DML; `app_admin` had nothing). **Missing on
  production too**, so this one is the fix there, not a no-op, and the header says so.

Both applied to staging only, ledger rows hand-written per DEC-17 and read back behind a sentinel on
the privileged connection.

A **second** unpredicted `42501` (`route_templates`, for `app_admin`) surfaced only by running the
path. Closed by **deleting a query filter**, not by granting a second table to a bypassing connection.

## Write paths, with counter-reads

`purge-deleted` proven to actually DELETE — out-of-window probes gone, **in-window CONTROL rows
survived** (which is what stops "deleted everything" reading as "deleted the right things"), and the
response body agrees. The compliance log proven to INSERT, with every row carrying its own `org_id`.
Every probe row hard-deleted with a counter-read returning 0.

## Found while fixing

- **`Truck.unitNumber` does not exist** — it is a `CarrierTruck` column. `digest.compliance_30day`
  has thrown `PrismaClientValidationError` for every owner with an expiring truck document since it
  shipped, **on production too**. Invisible because `TC001` raised first. Fixed.
- **`npm run audit:rls-policy-drift` reads PRODUCTION regardless of `DATABASE_URL`**, because it
  imports `scripts/_bootstrap-env`. Read-only, so nothing was written — but an operator would believe
  they had measured staging. Reported.
- **`Document` drift runs both ways.** Staging carries four columns production lacks, none declared
  by any Prisma model.

## Guards, all witnessed RED

`tenant-mechanism-fence.test.ts` (new importer; alias — and the alias fired **only** the alias
assertion, which is the argument for it existing), `admin-connection-allowlist.test.ts` (twice, on
five new importers), `606-report-integrity.test.ts` (two tests fired, including the non-triviality
floor that stops `0 === 0` passing over an empty corpus). Five cron test files retargeted off mocks
that would otherwise have injected into dead code paths.

## Gates

| gate | result |
|---|---|
| `604-survey.ts --close` | exit 0 — 156 / 183 / head, env hashes identical |
| quick-604's four artefacts | byte-identical by sha256 at open and close |
| `audit:rls-policy-drift` vs staging | **CLEAN (exit 0)** — 0 missing, 0 unexpected, 0 definition drift |
| `npm run build` | exit 0 |
| full suite | before 2097 / 64 / 18 · after 2114 / 64 / 18 · failing sets identical **by name both ways** · +17 = this task's new tests |
| `npx tsc --noEmit` | exit 0, probed twice per R8, probes deleted |
| `npx eslint` | **NOT RUN, NOT CLAIMED** — no working lint entry point (quick-562) |
| `wrapper-countdown.json` | 456 → 469 units, diff quoted; `withTenantContextCallSites` still **0** |

**Closing an `app_user` failure RAISES the wrapper countdown by construction** — every bare-client
site converted to `getTenantPrisma` becomes an unmigrated unit, because `withTenantContext` does not
exist yet. Whoever plans that migration should expect the number to climb as these close.

## What still fails

Twelve items, each with the concrete thing it needs, in §8 of the report. The two most consequential:
`carrier-auto-dispatch`'s generation work is **still unmeasured** (it needs three fixture fields and a
cleanup path), and **every `pass` in this document carries the `max: 1` pool caveat** — a bare
statement can inherit a GUC an earlier scoped one set. This task's own row 3 is the proof that the
caveat is not theoretical.

## Self-Check: PASSED

All created files confirmed present on disk; all nine commits confirmed in `git log`.
