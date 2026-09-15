# quick-606 · 02 — the RE-VERIFICATION, taken BEFORE any fix in this task

Source: `02-reverify.json` (the harness's own artefact), correlated against `03-server.log`.
Instrument: `scripts/audit/604-click-through.ts --surfaces606`, a mode added additively beside
`--surfaces`, `--surfaces2` and `--surfaces3`. Server: `next dev` against STAGING as `app_user`,
tripwire armed, started by `run-staging-server.sh` (guard 1 in `03-server.log:1`).

Staging at this moment: **2 active tenants**, 10 `User`, 5 `carrier_drivers`, 4 carrier `loads`,
3 `carrier_trucks`, and **0** rows in `document_imports`, legacy `"Load"`, `PlaybookInstance` and
`Document` (`01-open.json → stagingPrivilegedRowCounts`, taken on the PRIVILEGED connection — the
`app_user` census in the same file reads 0 for everything and is a silent zero, not a count).

**These fifteen verdicts, not quick-604's table, are the source for every number carried forward.**

## The table

| # | surface | quick-604 verdict | **606 re-verified** | changed? | reason |
|---|---|---|---|---|---|
| 1 | `/carrier/trips` | fail `TC001` | **fail `TC001`** | no | reproduces exactly; 2 `TC001` in the correlated window |
| 2 | `/documents` | fail `P2022` | **fail `P2022`** | no | the five missing `Document` columns are still missing on staging |
| 3 | `/api/cron/carrier-auto-dispatch` | fail `SQLSTATE_UNRECOVERED` | **fail `TC001`** | **YES — a different failure** | see below |
| 4 | `/api/cron/carrier-compliance-alerts` | fail `42501` | **fail `P2010`** | label only | identical failure — `42501 permission denied for schema public` wrapped by Prisma as `P2010`. quick-604 recorded the inner code, this run's recogniser reached the outer one first. Same statement, same line (`route.ts:39`) |
| 5 | `/api/cron/digest-compliance-30day` | fail `TC001` | **fail `TC001`** | no | 8 `TC001`; body `sent:0 skipped:0 failed:2` |
| 6 | `/api/cron/digest-daily-driver` | fail `TC001` | **fail `TC001`** | no | 8 `TC001`; body `failed:2` |
| 7 | `/api/cron/digest-weekly-owner` | fail `TC001` | **fail `TC001`** | no | 8 `TC001`; body `failed:2` |
| 8 | `/api/cron/purge-deleted` | fail `TC001` | **fail `TC001`** | no | **28** `TC001` — seven models × two tenants × two passes; body `totalPurged:0 failureCount:7` |
| 9 | `/api/cron/send-reminders` | fail `TC001` | **fail `TC001`** | no | 8 `TC001`; body `tenantsFound:2 processedTenants:0` |
| 10 | `/carrier/driver-pay/settlements` | fail `SQLSTATE_UNRECOVERED` | **pass** | **YES — already fixed** | **quick-605 (`408a84ec`) mounted `NuqsAdapter` at `src/app/layout.tsx`.** Credited there, not here |
| 11 | `/checklists/automation` | fail `SQLSTATE_UNRECOVERED` | **pass** | **YES — already fixed** | same commit, same cause |
| 12 | `/api/cron/trip-reminders` | fail `TC001` | **fail — SILENT PARTIAL SWEEP** | **YES — a worse failure** | see below |
| 13 | `/api/cron/workflow-notifications` | fail `42501` | **fail `42501`** | no | reproduces exactly |
| U1 | `/track/[token]` | unmeasured | **NOT_MEASURED** | no | legacy `"Load"` holds **0** rows on staging — **no request was issued**. A fabricated token measures the token, not the page |
| U2 | `/carrier/imports/[id]/stops` | unmeasured | **NOT_MEASURED** | no | `document_imports` holds **0** rows — no id to substitute, **no request issued** |

**Totals: 2 pass · 11 fail · 0 LATENT · 2 NOT_MEASURED.** Nothing is folded into pass.

## Row 3 — `carrier-auto-dispatch` raises something quick-604 never saw

quick-604 attributed this to fixture data (§7f: *"Template has no recurrenceRule — nothing to
generate"*). This run never reaches that code. Verbatim from the correlated slice:

```
ERROR: [CRON] carrier-auto-dispatch: Failed to fetch tenants
  Error [DriverAdapterError]: tenant context is required: app.current_tenant_id is the EMPTY STRING
    at async GET (src\app\api\cron\carrier-auto-dispatch\route.ts:52:15)
  originalCode: 'TC001'
  detail: 'statement: SELECT "public"."Tenant"."id", … FROM "public"."Tenant" WHERE …'
```

So `route.ts:52` is a **bare-client cross-tenant tenant sweep** — the §7a shape, on a route quick-604
classified as `SOMETHING_ELSE`/fixture. Both readings are honest measurements of the same code; what
differs is what an EARLIER request left on the connection. That is
`unmigrated-path-tripwire.md` §8 item 7 made concrete: the pool holds `max: 1`, so whether a bare
statement raises depends on the order of the sweep. **This row is now in Task 5's shape, not
Task 6b's.**

## Row 12 — `trip-reminders` no longer raises, and that is WORSE

HTTP **200**, `ok: true`, **zero** `TC001` in the window. The body:

```
[CRON] trip-reminders: done {"tenantsProcessed":1,"tenantsFailed":0,"remindersSent":0,"failureCount":0,"failures":[]}
```

Staging has **2** active tenants (privileged count, `02-reverify.json → activeTenantsOnStaging`).
`tenantsProcessed` is incremented once per tenant returned by the bare
`prisma.tenant.findMany({ where: { isActive: true } })` at `route.ts:74` and is incremented AFTER the
per-tenant work, so `1` is not a partial loop — the list itself came back with one row.

Nothing was refused. `current_tenant_id()` returned the value an earlier request had left on the
`max: 1` pool, so the tripwire branch was never taken and the tenant list was simply **RLS-filtered
to that one tenant**. The route then reported success having silently skipped the other one.

`--surfaces606` therefore carries a rule the harness did not have before: a 2xx whose own counter
reports fewer tenants than staging holds is a **`fail`**, with no SQLSTATE, labelled
`SILENT PARTIAL SWEEP`. It was written because this run produced one, not in anticipation.

## What did NOT change

Rows 1, 2, 5, 6, 7, 8, 9, 13 reproduce with the same SQLSTATE. Rows 10 and 11 are **quick-605's
fix**, credited to `408a84ec`; this task did not touch them and must not claim them.
