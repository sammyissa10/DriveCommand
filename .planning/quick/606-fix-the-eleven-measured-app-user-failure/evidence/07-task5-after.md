# quick-606 · 07 — Task 5: the cross-tenant sweeps and the two 42501s

## 5a — ONE grant, and the denied role is `app_admin`, not `app_user`

quick-604 classified `MISSING_GRANT ×2`. The two are not the same shape:
`carrier-compliance-alerts` is `42501 permission denied for SCHEMA public` — a DDL right, not a
table grant — so the real grant work was **one**.

`information_schema.role_table_grants` on BOTH databases, before anything was written
(`07-grants.json`):

| role | `PlaybookNotification` | `StepInstance` | `PlaybookInstance` | `Tenant` | `carrier_compliance_alert_log` |
|---|---|---|---|---|---|
| `app_user` | DELETE,INSERT,SELECT,UPDATE | full | full | full | full |
| `app_admin` | **— NO GRANT —** | SELECT | SELECT | full | — NO GRANT — |

Identical on production and staging. `route.ts:145` is `getAdminDb(...)`, so the statement runs as
`app_admin` — the assumption was checked rather than carried. **`app_user` was never the problem on
this table.**

The nested filter is load-bearing, read off the route rather than taken from the plan: it is
`notifications: { none: { notificationType: 'INSTANCE_BLOCKED', channel: 'EMAIL' } }`, which excludes
instances that already had an EMAIL escalation — the thing that stops the 48-hour sweep re-mailing
the same blocked instance every day.

`20260915130000_grant_playbook_notification_to_app_admin` — SELECT, one table, one role, guarded on
`pg_roles`. Applied to staging; ledger row hand-written and read back behind the sentinel
(`06-ledger-20260915130000_….txt`, `applied_steps_count=0`, real SHA-256, staging rows 157 → 158).
**The grant is missing on PRODUCTION too**, so this migration is not a no-op there — it is the fix,
and it ships on the next deploy. Said so in the migration header.

## 5a(ii) — a SECOND missing grant that no static read predicted

Routing `carrier-auto-dispatch`'s sweep produced, on the very first run:

```
ERROR: [CRON] carrier-auto-dispatch: Failed to fetch tenants
  permission denied for table route_templates      (42501, at route.ts:61)
```

The sweep's `where` carried `routeTemplates: { some: { active: true } }`, which compiles to a read of
`route_templates` — a table `app_admin` has no grant on. Exactly the class `admin-connection.md` §5
records, and exactly what the grant audit above could not have found, because that audit walked the
*workflow* sweeps.

**Closed WITHOUT a grant.** The filter is an optimisation, not a correctness requirement: the
per-tenant query below already runs under a tenant-scoped client and finds nothing for a
template-less tenant. Dropping it widens nothing on a connection that bypasses RLS entirely; granting
would have added a second table for a performance hint. `orgs_processed` keeps its old meaning
because the loop now continues before counting when a tenant has no templates.

## 5b — the DDL is gone, and what it was masking is now visible

`route.ts:37-54` ran `CREATE TABLE IF NOT EXISTS` + two `CREATE INDEX IF NOT EXISTS` on **every
invocation**, behind a try/catch returning `500 {"error":"Failed to initialize log table"}`. Under
`app_user` that is `42501 permission denied for schema public` (Prisma `P2010`). **A runtime
connection was being asked to run DDL** and no policy could fix it.

Per R13 the table's existence was confirmed on BOTH databases against `information_schema` before the
bootstrap was deleted — it is present on both, with an `app_user` grant on both (`07-grants.json`).

Underneath it, as predicted but measured rather than asserted: `prisma.tenant.findMany` on the bare
client under an `@bypass_rls reason: system-operation` comment, with **nothing in the file ever
setting `app.bypass_rls`**. Routed to `getAdminDb('compliance alert tenant sweep')`, and the raw
per-tenant INSERT moved onto the `getTenantPrismaForOrg` client — a raw statement is not intercepted
by the Prisma extension, so the GUC is the only thing that can satisfy that table's
`tenant_isolation_policy`.

### The INSERT's counter-read (R2) — `07-compliance-insert-probe.json`

The fixed route answered `200 {"orgs_processed":2,"total_alerts_found":0}`, and with zero alerts the
INSERT never ran. **A pass over a path that did not execute is not evidence about that path.** So one
disposable `carrier_drivers` row per tenant was seeded with a CDL expiring in 20 days:

```
cron: HTTP 200 {"success":true,"orgs_processed":2,"total_alerts_found":2,"failureCount":0}
  staging-alpha: alert log 0 -> 1
  staging-beta:  alert log 0 -> 1
mis-scoped rows: 0
cleanup: {"logsDeleted":2,"driversDeleted":2,"leftDrivers":0,"leftLogs":0}
VERDICT: INSERTED
```

Both tenants grew, and every written row carries **its own** tenant's `org_id` — the check that
separates "it wrote" from "it wrote to the right tenant". All probe rows deleted, counter-read zero.

## 5c — `purge-deleted` is proven to DELETE — `07-purge-write-probe.json`

R2 is not optional on a DELETE sweep: an RLS-refused DELETE is **0 rows and no error**, so
`totalPurged: 0` is indistinguishable from a clean run. Before the fix it raised **28** `TC001` in one
run (seven models × two tenants × two passes).

```
seeded 4 disposable rows across 2 tenants
cron: HTTP 200 {"success":true,"totalPurged":2,"tenantsProcessed":2,"tenantsFound":2,
                "results":{"CarrierLoad":2,…},"failureCount":0}
out-of-window probes gone : true
in-window controls alive  : true
body results.CarrierLoad  : 2
cleanup: deleted 2 leftover probe row(s); remaining: 0
VERDICT: DELETED
```

The **in-window controls** are what stop "it deleted everything" passing as "it deleted the right
things": two rows soft-deleted 1 day ago survived, two soft-deleted 400 days ago did not.

The tenant list is on `getAdminDb`; the seven `deleteMany`s run per tenant under
`getTenantPrismaForOrg`. Deliberately not the reverse — routing the DELETEs to the admin connection
would need DELETE grants for `app_admin` on seven tables and would remove seven statements from the
tripwire's reach. Six of the seven models are in `withTenantRLS`'s `EXEMPT_MODELS` (they carry
`orgId`), so the Prisma layer injects nothing for them and RLS via the GUC is their only scope —
which is why the GUC is not optional here.

The body gained `tenantsProcessed` / `tenantsFound`, so a partial sweep can no longer hide behind
`totalPurged: 0`.

## 5d — `trip-reminders`

One line, `getAdminDb('trip reminder tenant sweep')`. `tenantsProcessed` went **1 → 2** against 2
active tenants: the silent partial sweep is closed.

## 5e — R6's three deliberate edits, and the gate fired first

The allowlist test was run BEFORE the entries were added, and refused the new call sites by design:

```
 FAIL  tests/security/admin-connection-allowlist.test.ts > … > allowlist equality, BOTH directions
AssertionError: these files import lib/db/admin-prisma but are NOT in ADMIN_ALLOWLIST:
  app/api/cron/carrier-compliance-alerts/route.ts,
  app/api/cron/purge-deleted/route.ts,
  app/api/cron/trip-reminders/route.ts
 Test Files  1 failed (1)
      Tests  1 failed | 8 passed (9)
```

Four `AdminReason` members added, each naming what the path DOES:
`'compliance alert tenant sweep'`, `'soft-delete purge tenant sweep'`, `'trip reminder tenant sweep'`,
`'auto-dispatch generation tenant sweep'`. Four allowlist entries with call counts and `minBytes`
floors; the integrity floor moved 18 → 22 files and 39 → 43 calls. Green after.

## The re-run

| # | surface | BEFORE | AFTER |
|---|---|---|---|
| 3 | `carrier-auto-dispatch` | fail `TC001` at `route.ts:52` | fail — **the fixture error, and nothing else**: reaches both tenants, loads the template, then `Template has no recurrenceRule`. Task 6b |
| 4 | `carrier-compliance-alerts` | fail `P2010`/`42501` schema | **pass** — `orgs_processed:2`, INSERT proven above |
| 8 | `purge-deleted` | fail `TC001` ×28 | 200, `tenantsProcessed:2` — **`LATENT`** (nothing soft-deleted at re-run time), and proven to DELETE by the write probe |
| 12 | `trip-reminders` | fail — SILENT PARTIAL SWEEP, 1 of 2 | **pass** — `tenantsProcessed:2` |
| 13 | `workflow-notifications` | fail `42501` | 200, `sweepsFailed:0` — **`LATENT`** (`PlaybookInstance` = 0 on staging) |

A correction made while writing this: row 8's data gate originally counted soft-deleted `"Document"`
rows. **`Document` is not one of the seven models the sweep walks** — it has no `deletedAt` in
`schema.prisma`, and the column exists on staging only, as drift in the other direction. The gate now
counts the sweep's actual seven by their mapped table names, so its `LATENT` reason names something
the route touches.
