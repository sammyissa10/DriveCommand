# The `app_user` failure remediation — quick-606

Fixing the measured failures from `staging-app-user-end-to-end.md`, on staging, with a fresh verdict
before and after each one.

Every number in this document cites the evidence file it came from. Every row is its own verdict and
**there is no summary row**. What was NOT measured is a section, not an omission.

Evidence: `.planning/quick/606-fix-the-eleven-measured-app-user-failure/evidence/`

---

## 0. What this fixed, and what it deliberately did not

quick-604 measured thirteen surfaces failing as `app_user` with the tripwire armed and **deliberately
fixed nothing**. Eleven of the thirteen sat in files the 456-unit countdown does not name, and those
eleven are the reason the cutover cannot happen.

**Closed:** every one of the thirteen now answers 2xx on staging as `app_user` with the tripwire
armed. The re-run's fifteen rows are **8 pass · 0 fail · 5 LATENT · 2 NOT_MEASURED**
(`evidence/09-final-verdicts.json`). Two of the eight passes are quick-605's, credited there.

### Not done, by rule

**R4 — the `withTenantContext` migration was not begun.** Moving a `withTenantRLS` or bare-client
call onto `getTenantPrisma`/`getTenantPrismaForOrg` is fixing a measured failure and is in scope;
converting existing `getTenantPrisma` call sites to a wrapper is the migration and is not.
`wrapper-countdown.json`'s anti-vacuity counter, `withTenantContextCallSites`, is **still 0** — §9.

**R5 — no policy was widened and no DDL right was granted to any runtime role.** The one grant is
`SELECT` on **one** table to `app_admin`. A second missing grant was found and closed by *removing a
query filter* rather than by granting — §4, row 3.

**Not converted:** four direct `createTenantClient` callers that were not measured failures. They are
latent, not safe, and they are named in §8 and frozen by a committed guard rather than left to be
rediscovered.

---

## 1. Production at open and at close, and staging's preconditions

Source: `evidence/01-open.json`, `evidence/07-close.json`,
`scripts/audit/604-survey.ts --open|--close --evidence <dir>`.

Production is read **read-only**, from one frozen SELECT-only array, with a runtime assertion
refusing any entry that is not a `SELECT`.

| reading | at open | at close | verdict |
|---|---|---|---|
| `_prisma_migrations` rows | **156** | **156** | identical |
| `pg_policy` in `public` | **183** | **183** | identical |
| newest `migration_name` | `20260914170000_activation_progress_congrats_shown_at` | same | identical |
| sha256 repo-root `.env` | `a10194b5…` | same | identical |
| sha256 `apps/web/.env.local` | `7d298fdd…` | same | identical |

`604-survey.ts --close` **exits 0**, and that exit code is the evidence rather than this sentence.

Production was additionally read read-only three times by name, each permitted and each required:
`information_schema.columns` on `"Document"` (§6), `role_table_grants` for `app_user`/`app_admin`
(§4), and the `Load.trackingToken` liveness count (§4, row U1).

**Stated rather than smoothed over:** `--open` was run a second time mid-task, after Task 4, as an
interim check. All five readings were identical to the first, so the bracket is unaffected; but the
`at` timestamp in `01-open.json` is the second reading's.

### Staging, at open

| reading | value |
|---|---|
| `current_user` / `rolbypassrls` | `app_user` / **false** |
| `public.tenant_context_required` present | **true** |
| tripwire branch inside `current_tenant_id()` | **present** |
| `pg_policy` in `public` | 183 |
| `bypass_rls_policy` count | 86 (this task never drops one) |
| `auth.users` | 9 |

**The `app_user` row census is a silent zero, not a count.** `readStaging()` reads as `app_user` with
no tenant GUC, so RLS filters every tenant-scoped table to zero — quick-604 recorded those zeroes.
This task added a **privileged census** (`postgres`, bypassing), which is the one a later task should
read:

```
Tenant=2  User=10  loads=4  carrier_drivers=5  carrier_trucks=3
document_imports=0  legacy "Load"=0  PlaybookInstance=0  Document=0
```

Those four zeroes are why five rows end `LATENT` or `NOT_MEASURED` rather than `pass`.

### The server, and the three guards

`evidence/run-staging-server.sh` — committed, so the run is reproducible rather than a transcript.
Both `DATABASE_URL` and `DATABASE_URL_ADMIN` are exported; omitting the second makes six cron routes
fail `ECONNREFUSED` out of `getAdminDb` and reads exactly like an application defect (quick-604 §4
threw a whole run away for it). Every string is repointed `:6543` → `:5432` and `?pgbouncer=true`
stripped.

**Guard 1**, refs and roles only, never the strings:

```
GUARD 1: DATABASE_URL role=app_user ref=wyixpgunnjmzguhggocz port=5432 · DATABASE_URL_ADMIN role=app_admin ref=wyixpgunnjmzguhggocz port=5432
```

A correction to `604-survey.ts:refOf` was needed to produce that line at all: it anchors on
`postgres\.([a-z0-9]+)` and this task's two strings are `app_user.<ref>` and `app_admin.<ref>`, so it
reports `UNKNOWN` for both. The guard reads the ref as the username **suffix** and asserts it, and
asserts the role as well — "which database" and "which role" are two claims.

**Guard 2**, `pg_stat_activity` on both databases (`evidence/03-pgstat.json`). **Production showed
`app_user = 0` at every reading.**

**Guard 3**, `RESEND_API_KEY=''`, `GMAIL_USER=''`, Upstash deliberately unset so `authLimiter` is
`null` and the fixture logins cannot lock the run out of itself.

---

## 2. THE RE-VERIFICATION — fifteen fresh verdicts, taken before any fix

Source: `evidence/02-reverify.json`, `evidence/02-reverify.md`, `evidence/02-classification.json`.

**quick-604's table is never the source again.** The click-through was several commits old and
quick-605 had since changed the root layout.

| # | surface | quick-604 | **606 re-verified** | changed? |
|---|---|---|---|---|
| 1 | `/carrier/trips` | fail `TC001` | fail `TC001` | no |
| 2 | `/documents` | fail `P2022` | fail `P2022` | no |
| 3 | `/api/cron/carrier-auto-dispatch` | fail `SQLSTATE_UNRECOVERED` | **fail `TC001`** | **YES — a different failure** |
| 4 | `/api/cron/carrier-compliance-alerts` | fail `42501` | fail `P2010` | label only — same `42501`, outer code recovered |
| 5 | `/api/cron/digest-compliance-30day` | fail `TC001` | fail `TC001` ×8 | no |
| 6 | `/api/cron/digest-daily-driver` | fail `TC001` | fail `TC001` ×8 | no |
| 7 | `/api/cron/digest-weekly-owner` | fail `TC001` | fail `TC001` ×8 | no |
| 8 | `/api/cron/purge-deleted` | fail `TC001` | fail `TC001` **×28** | no |
| 9 | `/api/cron/send-reminders` | fail `TC001` | fail `TC001` ×8 | no |
| 10 | `/carrier/driver-pay/settlements` | fail | **pass** | **YES — quick-605 fixed it** |
| 11 | `/checklists/automation` | fail | **pass** | **YES — quick-605 fixed it** |
| 12 | `/api/cron/trip-reminders` | fail `TC001` | **fail — SILENT PARTIAL SWEEP** | **YES — a worse failure** |
| 13 | `/api/cron/workflow-notifications` | fail `42501` | fail `42501` | no |
| U1 | `/track/[token]` | unmeasured | **NOT_MEASURED** | no |
| U2 | `/carrier/imports/[id]/stops` | unmeasured | **NOT_MEASURED** | no |

**Totals: 2 pass · 11 fail · 2 NOT_MEASURED.** Independently re-derived by the classifier:
`TRIPWIRE_TC001` 7 + `MISSING_GRANT` 2 + `SOMETHING_ELSE` 2 = **11** = the failure count derived from
the verdict fields. 9 `OUTSIDE_456`.

### Rows 10 and 11 belong to quick-605, not to this task

`408a84ec` mounted `NuqsAdapter` once at `src/app/layout.tsx`. Carried as ALREADY-FIXED.

### Row 3 raises something quick-604 never saw

quick-604 attributed this to fixture data. This run never reached that code:

```
ERROR: [CRON] carrier-auto-dispatch: Failed to fetch tenants
  tenant context is required: app.current_tenant_id is the EMPTY STRING
    at async GET (src\app\api\cron\carrier-auto-dispatch\route.ts:52:15)
  originalCode: 'TC001'
```

`route.ts:52` is a bare-client cross-tenant sweep — §7a's shape, on a route classified
`SOMETHING_ELSE`/fixture. Both readings are honest measurements of the same source; what differs is
what an **earlier request** left on the `max: 1` pool
(`unmigrated-path-tripwire.md` §8 item 7). **This is that caveat made concrete, and it moved the row
from Task 6's shape into Task 5's.**

### Row 12 no longer raises, and that is WORSE

HTTP **200**, `ok: true`, **zero** `TC001`:

```
[CRON] trip-reminders: done {"tenantsProcessed":1,"tenantsFailed":0,"remindersSent":0,"failureCount":0,"failures":[]}
```

Staging has **2** active tenants. Nothing was refused: `current_tenant_id()` returned a value an
earlier request had left on the pool, the tripwire branch was never taken, and the bare tenant list
was simply **RLS-filtered to one tenant**. The route reported success having silently skipped the
other.

The harness therefore gained a rule it did not have: a 2xx whose own counter reports fewer tenants
than staging holds is a **`fail`**, labelled `SILENT PARTIAL SWEEP`, with no SQLSTATE. Written
because this run produced one.

---

## 3. `withTenantRLS`: what happens to it

**It SURVIVES. It is not deleted and it is not deprecated.**

- `lib/db/tenant-client.ts:26` composes it inside `createTenantClient`.
- `getTenantPrisma` and `getTenantPrismaForOrg` **set `app.current_tenant_id` on the connection AND
  apply it**.
- The defect was **direct use from feature code**, which injects a `tenantId` filter at the Prisma
  layer and sets nothing on the connection — so with the tripwire armed, every such statement raises
  `TC001`.

Nine sites moved onto `getTenantPrismaForOrg`: three digest routes, two inside `unstable_cache` in
`(owner)/actions/notifications.ts`, and three `createTenantClient` callers behind `send-reminders`
(`check-upcoming-maintenance.ts`, `check-expiring-documents.ts`, `check-expiring-driver-documents.ts`
— one `Promise.all`, one route, one defect; the first merely raised first). A tenth change removed an
import of `withTenantRLS` from `send-reminders/route.ts` that was **never called** — confirmed by a
CRLF-normalised grep over the whole file returning exactly one occurrence.

### The comment somebody already wrote, and left

All three digest routes carried this at `:40`, verbatim:

> ```
>  * quick-600 (B5) — ROUTE. Cross-tenant cron — fetches all tenants then
>  * scopes per-tenant via withTenantRLS (DECORATIVE, left untouched — only
>  * this sweep statement moves onto the admin connection).
> ```

**Somebody suspected the scoping was decorative, wrote it down, and moved on.** It was worse than
decorative: it produced 8 `TC001` per run per route. This is the clearest example in the repo of a
known defect surviving because nobody owned it, and the reason the fence in §7 exists.

### The fourth mechanism the brief's five-site list did not cover

`createTenantClient(tenantId)` used directly is the **same defect shape** as `withTenantRLS` — it
composes the extension and sets no GUC. Three of its callers were on the measured path and moved. The
rest are inventoried, not fenced — §7.

### The doc comments moved with the call sites

The three `lib/notifications/digests/*-payload.ts` modules documented their parameter as *"already
extended with withTenantRLS"*. A client that is **only** extended raises `TC001` on every statement in
those files. A doc comment naming a mechanism the caller no longer uses is the quick-547/548 class,
and it is how this survived three phases.

---

## 4. Per-failure: what it was, what was done, the fresh AFTER verdict

AFTER verdicts from `evidence/09-final-verdicts.json` — a full fifteen-row re-run on a **restarted**
server with `apps/web/.next` deleted first.

| # | surface | what it was | what was done | AFTER |
|---|---|---|---|---|
| 1 | `/carrier/trips` | three tenant-scoped statements on the bare client, `page.tsx:19` | `getTenantPrisma()` — the page has a session and already null-checks `tenantId` | **pass** · 0 `TC001` · gate 3 drivers |
| 2 | `/documents` | `P2022`: five `Document` columns on production, absent on staging. Behind it, a bare-client read | migration §6 + `getTenantPrisma()` | **LATENT** by the harness (0 `Document` rows), and **SCOPED** by the probe below |
| 3 | `/api/cron/carrier-auto-dispatch` | bare tenant sweep at `:52` (`TC001`), under a decorative `@bypass_rls` comment | sweep → `getAdminDb`; per-tenant templates → `getTenantPrismaForOrg`; nested `routeTemplates` filter **removed** rather than granted; fixture corrected | **LATENT** — 200, 0 `TC001`, 0 auto-generating templates |
| 4 | `/api/cron/carrier-compliance-alerts` | `CREATE TABLE` + 2 `CREATE INDEX` on **every invocation** → `42501 permission denied for schema public` | bootstrap **deleted**; sweep → `getAdminDb`; raw INSERT → the GUC-setting client | **pass** · `orgs_processed:2` |
| 5 | `/api/cron/digest-compliance-30day` | `prisma.$extends(withTenantRLS(...))` | `getTenantPrismaForOrg` | **pass** · `processedTenants:2 failed:0` |
| 6 | `/api/cron/digest-daily-driver` | same | same | **pass** · `processedTenants:2` |
| 7 | `/api/cron/digest-weekly-owner` | same | same | **pass** · `processedTenants:2` |
| 8 | `/api/cron/purge-deleted` | seven `deleteMany` on the bare client, **28** `TC001` per run | tenant list → `getAdminDb`; the seven → per tenant under `getTenantPrismaForOrg` | **LATENT** (nothing soft-deleted at re-run time) and **proven to DELETE** — §5 |
| 9 | `/api/cron/send-reminders` | `createTenantClient` direct, three modules | `getTenantPrismaForOrg` | **LATENT** (legacy `Truck` = 0) · `processedTenants:2 failed:0` |
| 10 | `/carrier/driver-pay/settlements` | `nuqs` had no adapter | **quick-605 (`408a84ec`)** | **pass** |
| 11 | `/checklists/automation` | same | **quick-605 (`408a84ec`)** | **pass** |
| 12 | `/api/cron/trip-reminders` | bare sweep at `:74`; measured as a SILENT PARTIAL SWEEP, 1 of 2 tenants | `getAdminDb` | **pass** · `tenantsProcessed:2` |
| 13 | `/api/cron/workflow-notifications` | `app_admin` had no `SELECT` on `PlaybookNotification` | one migration, §6 | **LATENT** (`PlaybookInstance` = 0) · `sweepsFailed:0` |
| U1 | `/track/[token]` | two bare-client reads on a public page with no session | routed to the existing `getAdminDb('public shipment tracking lookup')` | **NOT_MEASURED** by the harness; **RENDERS** under its own probe — below |
| U2 | `/carrier/imports/[id]/stops` | never measured | nothing — `document_imports` = 0 | **NOT_MEASURED**, no request issued |

### Row 2's scoping, closed separately — `evidence/06-documents-scoping.json`

Since the harness could only ever call row 2 `LATENT`:

```
seeded probe Document 66bf812f-… for driver1@alpha.staging.test (staging-alpha)
tenant A driver1@alpha.staging.test: HTTP 200  sees probe: true
tenant B driver1@beta.staging.test:  HTTP 200  sees probe: false
cleanup: deleted 1 row(s); surviving 606-probe rows: 0
VERDICT: SCOPED
```

**Tenant B's blindness is the measurement.** Tenant A seeing its own document would pass identically
on an unscoped read.

### Row U1 — decided on a production liveness count

`evidence/08-track-liveness.json`, production read-only:

| reading | production |
|---|---|
| legacy `"Load"` with a `trackingToken` | **0** |
| legacy `"Load"` total | **2** |

**The feature is not live.** The plan makes "report, do not build" correct at 0. **Option (b) was
taken anyway**, and the argument is a measurement, not a preference —
`evidence/08-track-probe-before.json`, one token seeded on staging, driven with no session at all:

```
HTTP 500  TC001 in window: 2
VERDICT: FAILS — the page raises as app_user the first time a token exists
```

"Not live" and "harmless" are different claims and only the first was true.

**It cannot be tenant-scoped.** The caller is anonymous: there is no session and therefore no tenant
*until the token resolves one*. The token IS the capability. The tripwire could never have passed
here — what it offered was a guaranteed raise.

**A `SECURITY DEFINER` token→tenant resolver was rejected:** DDL, therefore a migration, therefore
drift this task would own, and a **second mechanism** for a lookup that already has an approved one
at `api/track/[token]/route.ts:26` — the byte-identical query, three files away. `app_admin` already
holds SELECT on **all four** tables that path reads, verified against `role_table_grants`:

```
PROD  GPSLocation:SELECT | Load:SELECT | Truck:SELECT | User:SELECT
STG   GPSLocation:SELECT | Load:SELECT | Truck:SELECT | User:SELECT
```

`Truck` and `User` matter — the page `include`s `truck` and `driver`, and checking only `Load` and
`GPSLocation` would have been the same incomplete reading that produced two surprise `42501`s in §5.
No new `AdminReason`, no DDL. Both of the page's reads moved; leaving the GPS one behind would have
left it raising on any load with a truck assigned.

**The cost, stated:** `app_admin` bypasses RLS, so `unmigrated-path-tripwire.md` §8 item 2 applies —
this path is now outside the tripwire's reach. It carries an `ADMIN_ALLOWLIST` entry.

`evidence/08-track-probe-after.json`: `HTTP 200 · TC001 0 · RENDERS · probe rows 0/0`.

---

## 5. The write paths and their counter-reads

**R2: an UPDATE or DELETE refused by RLS is 0 rows and NO ERROR.** Every write path this task touched
carries a counter-read on a separate privileged connection (`postgres`), which asserts its own
`current_user` is not `app_user` before it reads anything.

### `purge-deleted` — `evidence/07-purge-write-probe.json`

Four disposable rows seeded per the two tenants on the privileged connection: two soft-deleted **400
days** ago (outside `SOFT_DELETE_RETENTION_DAYS`) and two soft-deleted **1 day** ago as controls.

```
cron: HTTP 200 {"success":true,"totalPurged":2,"tenantsProcessed":2,"tenantsFound":2,
                "results":{"CarrierLoad":2,…},"failureCount":0}
out-of-window probes gone : true
in-window controls alive  : true
body results.CarrierLoad  : 2
cleanup: deleted 2 leftover probe row(s); remaining: 0
VERDICT: DELETED
```

**The in-window controls are what stop "it deleted everything" passing as "it deleted the right
things".** Both halves agree: the privileged counter-read and the route's own body.

The body gained `tenantsProcessed` / `tenantsFound` so a partial sweep can no longer hide behind
`totalPurged: 0`.

### `carrier_compliance_alert_log` INSERT — `evidence/07-compliance-insert-probe.json`

The fixed route first answered `200 {"orgs_processed":2,"total_alerts_found":0}`, and with zero alerts
**the INSERT never ran**. A pass over a path that did not execute is not evidence about that path. One
disposable `carrier_drivers` row per tenant with a CDL expiring in 20 days:

```
cron: HTTP 200 {"success":true,"orgs_processed":2,"total_alerts_found":2,"failureCount":0}
  staging-alpha: alert log 0 -> 1
  staging-beta:  alert log 0 -> 1
mis-scoped rows: 0
cleanup: {"logsDeleted":2,"driversDeleted":2,"leftDrivers":0,"leftLogs":0}
VERDICT: INSERTED
```

Both tenants grew, and **every written row carries its own tenant's `org_id`** — the check that
separates "it wrote" from "it wrote to the right tenant".

### A regression this task caused, and the guard that caught it

`purge-deleted`'s first draft pre-initialised `results[name] = 0` for all seven models so the shape
would be stable across tenants. That **re-introduced exactly the erasure quick-603 removed**: a model
that failed would read as a clean `0`, indistinguishable from nothing to purge.
`tests/cron/purge-deleted.test.ts` failed with `expected [ … ] to not include 'CarrierContract'`.
`results` holds **successes only** again; a model that failed has **no key**. Recorded because the
guard working is the point.

### Probe hygiene

Every probe row created by this task was hard-deleted with a counter-read asserting zero survive:
`Document` (1), `loads` (4), `carrier_drivers` (2), `carrier_compliance_alert_log` (2), legacy
`"Load"` + `"Customer"` (1 each, twice). All counter-reads returned **0**.

---

## 6. The two migrations

Both are **committed**, and `apps/web/vercel.json` runs `scripts/migrate.mjs` as its `buildCommand` —
so both reach production on the next `vercel --prod`. Each migration header says so.

### `20260915120000_document_column_drift_staging_parity` — a proven NO-OP on production

Conditional on a production read, and the condition held (`evidence/06-document-drift.json`):

| reading | production | staging |
|---|---|---|
| `"Document"` columns | **21** | **20** |
| missing on staging | — | `description`, `expiryDate`, `externalUrl`, `loadId`, `notes` |
| extra on staging | — | `createdBy`, `deletedAt`, `deletedBy`, `updatedBy` |

All five are **nullable with no default**, each with one unambiguous type, read off production
verbatim. The stop condition — *write no migration if any column is ambiguous in type, nullability or
precision* — was not triggered. Had any been NOT NULL with no default, `ADD COLUMN` could not have
been written at all against a populated table and the row would have stayed `NOT_MEASURED`.

`pg_indexes` / `pg_constraint` were read too: production also carries `Document_expiryDate_idx`,
`Document_loadId_idx` and `Document_loadId_fkey`, none of which can exist on staging without the
columns. All included, all `IF NOT EXISTS` or guarded on `pg_constraint`, all no-ops on production.

Column names are camelCase and are quoted — the same class as `stops."bolRequired"` (DEC-14).

### `20260915130000_grant_playbook_notification_to_app_admin` — NOT a no-op, and that is the point

The classification said `MISSING_GRANT ×2`. The two are different shapes:
`carrier-compliance-alerts` is `permission denied for SCHEMA public`, a DDL right. So the real grant
work was **one** — and the denied role was confirmed before anything was written
(`evidence/07-grants.json`, identical on both databases):

| role | `PlaybookNotification` |
|---|---|
| `app_user` | DELETE, INSERT, SELECT, UPDATE |
| `app_admin` | **— NO GRANT —** |

**`app_user` was never the problem on this table.** `GRANT SELECT` on one table to one role, guarded
on `pg_roles`. **The grant is missing on production too**, so this migration is the fix there, not a
no-op.

### DEC-17 — the ledger row, by hand, read back behind a sentinel

Neither MCP tool writes `_prisma_migrations`. Both rows were written by hand with a real SHA-256 over
LF bytes, `logs=''`, `started_at = finished_at`, `applied_steps_count = 0`, and read back on the
**privileged** connection — `_prisma_migrations` has RLS on, zero policies and no `app_user` grant, so
an empty read from a non-owner role is indistinguishable from "never written".

```
SENTINEL 20260914170000_activation_progress_congrats_shown_at visible: YES
READ BACK — newest 3 ledger rows:
  20260915130000_grant_playbook_notification_to_app_admin | steps=0 | logs="" | started=finished:true | checksum=9f78d36c…
  20260915120000_document_column_drift_staging_parity     | steps=0 | logs="" | started=finished:true | checksum=095c615e…
  20260914180000_tenant_context_tripwire                  | steps=0 | logs="" | started=finished:true | checksum=ad2f6892…
HEAD IS OURS: true · checksum is a real SHA-256, not 'manual': true · applied_steps_count is 0: true
staging _prisma_migrations rows AFTER: 158
```

**Applied to STAGING ONLY.** Production's ledger read 156 at open and 156 at close.

---

## 7. The guards, with their witnessed REDs

`apps/web` has **no working lint entry point** (quick-562: `next lint` no longer accepts `--dir`, and
ESLint 9 finds no `eslint.config.js`). A vitest source scan is the only enforcement available. Stated
rather than an ESLint rule being proposed.

### `tests/security/tenant-mechanism-fence.test.ts` — two lists, deliberately

**`withTenantRLS` — a CLOSED FENCE.** Six legitimate references, enumerated with per-file call counts.
Any new `src` importer fails the suite, plus a named negative: **no file under `src/app/` or
`src/lib/notifications/` references it at all** — the nine sites this task moved all lived there, and
a set-equality test alone would pass identically if whoever added a new site also widened the list.

**`createTenantClient` — a FROZEN INVENTORY, not a fence**, verified by grep before being frozen.
**Superseded by quick-610:** all four LATENT rows below were measured raising `TC001` cold and
converted, so LIST 2 is now a CLOSED FENCE over two entries (the definition and the two legitimate
wrappers), plus a named negative `EMPTIED_BY_610` over the three emptied files — because a merely
shorter list would pass identically if someone re-added a call AND widened the list in the same
edit. The table below is kept as the record of what was frozen here:

| file | calls | status |
|---|---|---|
| `lib/db/tenant-client.ts` | 1 | the definition |
| `lib/context/tenant-context.ts` | 2 | the legitimate callers — both set the GUC first |
| `app/(owner)/actions/dashboard.ts` | 2 | **LATENT** |
| `app/(owner)/actions/tenant-notification-settings.ts` | 3 | **LATENT** |
| `lib/db/repositories/base.repository.ts` | 1 | **LATENT** — every repository subclass inherits it |

A fence here would be red against correct existing code, and a red test everyone learns to ignore
protects nothing.

Matched by MODULE PATH, never by imported name. `vi.mock` counts as a reference — deliberately:
`tests/cron/digests.test.ts` was coupled to `withTenantRLS` by a mock and nothing else.

**RED 1 — a new `src` importer:**

```
AssertionError: expected [ …(7) ] to deeply equal [ …(6) ]
+   "src/lib/db/__606-red-witness.ts",
 ❯ tests/security/tenant-mechanism-fence.test.ts:289:19
```

**RED 2 — an alias, and it caught something set-equality did not:**

```
AssertionError: expected [ Array(1) ] to deeply equal []
+   "src/lib/db/__606-red-witness.ts: createTenantClient as scoped",
 ❯ tests/security/tenant-mechanism-fence.test.ts:328:21
```

**Only the alias assertion fired.** The frozen-inventory test stayed green because the call site reads
`scoped(t)` and matches no call pattern. That is the entire argument for the alias ban being its own
assertion.

Three corrections to the plan's importer list, each found by grep first:
`tenant-rls-bound.prototype.ts` does **not** import `withTenantRLS` (it defines its own
`withTenantRLSBound`) and is now the counter-assertion file; `tenant-header-forgery.test.ts` mocks
`tenant-client`, one layer up; and `extensions/tenant-rls.ts` — the definition — had to be added.

### `tests/security/admin-connection-allowlist.test.ts` — the gate fired first, twice

```
AssertionError: these files import lib/db/admin-prisma but are NOT in ADMIN_ALLOWLIST:
  app/api/cron/carrier-compliance-alerts/route.ts,
  app/api/cron/purge-deleted/route.ts,
  app/api/cron/trip-reminders/route.ts
```

and separately, for the track page:

```
AssertionError: these files import lib/db/admin-prisma but are NOT in ADMIN_ALLOWLIST:
  app/track/[token]/page.tsx
```

R6's three deliberate edits: four new `AdminReason` members naming what each path DOES
(`'compliance alert tenant sweep'`, `'soft-delete purge tenant sweep'`, `'trip reminder tenant
sweep'`, `'auto-dispatch generation tenant sweep'` — the track page reuses the existing
`'public shipment tracking lookup'`), five allowlist entries with call counts and `minBytes` floors,
and the integrity floor moved 18 → 23 files and 39 → 44 calls.

### `tests/security/606-report-integrity.test.ts` — witnessed RED, and two tests fired

`604-report-integrity.test.ts` is untouched. Decrementing `TRIPWIRE_TC001` 7 → 6:

```
 FAIL  … > BEFORE: the category sum equals the independently derived failure count
AssertionError: expected 10 to be 11
 FAIL  … > BEFORE is NON-TRIVIAL — without this, 0 === 0 would pass over an empty corpus
AssertionError: expected 6 to be greater than or equal to 7
```

The second is the one that matters: **the AFTER classification's sum is 0**, and `0 === 0` is
satisfied by an empty corpus. Without a non-trivial BEFORE pinned in the same file, the whole test
could be made green by deleting every finding.

### Five cron test files retargeted, and why that was mandatory

`digests.test.ts` mocked `withTenantRLS`; `carrier-auto-dispatch`, `carrier-compliance-alerts`,
`purge-deleted` and `trip-reminders` mocked `@/lib/db/prisma`. After the fixes those routes call
neither. **Left alone, all five would have injected into a dead code path and gone green forever
while testing nothing** — the Phase-10 `sendDispatchAssignedNotification` shape. Retargeted to
`getAdminDb` / `getTenantPrismaForOrg`, and the digests retarget was witnessed RED (9/9 fail).
`carrier-compliance-alerts` **loses** its `$executeRawUnsafe` spy: that was the DDL bootstrap, which
is deleted, so a spy for it would assert a call that can never happen.

---

## 8. WHAT STILL FAILS, AND WHAT EACH ONE NEEDS

| # | item | what it needs |
|---|---|---|
| 1 | **`carrier-auto-dispatch`'s generation work has never been measured** — quick-604 §8 item 10 is still open. The route now completes, having found nothing to do. | Three fixture fields on a seeded `route_template` — a `recurrenceRule`, a `defaultDriverId` and a `defaultTruckId` (`dispatch-generator.ts:335` dereferences the last two with `!` and both are NULL on both seeded templates) — **and** a cleanup path for the trips, loads and stops the run writes. |
| 2 | **PRODUCT DEFECT, reported not fixed.** The product permits a `route_template` with `autoGenerateDaysAhead > 0` (default **7**), `scheduleType: 'on_call'` and no `recurrenceRule`, and the nightly cron 500s on it. quick-521 lowered that floor to 0. | A product decision: refuse the combination at save time, or make `generateDispatches` treat it as "nothing scheduled" rather than an error. Not this task's. |
| 3 | ~~**Four `createTenantClient` callers remain, and they are LATENT, not safe**~~ — **the count was SIX, not four: `dashboard.ts` (2) + `tenant-notification-settings.ts` (3) + `base.repository.ts` (1), exactly as §7's own table lists them. "Four" was an arithmetic slip against that table.** **CLOSED by quick-610.** All six were measured on a cold pool as `app_user` with the tripwire armed — one child process per site, so none could inherit another's context — and **all six raised `TC001`**; nothing reclassified, so the reading recorded here was right. All six now use `getTenantPrismaForOrg(tenantId)` and pass cold in both directions (legitimate read returns real rows; cross-tenant raw read returns zero against a non-empty foreign set). `createTenantClient` is now called in exactly two files, and §7's LIST 2 has become a closed fence plus a named negative over the three emptied files. | Done — **but NOT via `getTenantPrisma()` as recommended here.** At all six the tenant is already an in-hand value, and `getTenantPrisma()` additionally forwards `session.userId` into the audit-columns extension, which `createTenantClient(tenantId)` never did — that would start writing `createdById`/`updatedById` on `DocumentRepository#create`, a behaviour change inside a routing fix. `getTenantPrismaForOrg(tenantId)` with no `userId` is today's client plus the `set_config` and nothing else. See `.planning/quick/610-*/610-SUMMARY.md` §4. |
| 4 | **`(owner)/actions/notifications.ts`'s two sites were LATENT and are now fixed, but `/dashboard` still passes for a reason nobody should rely on.** quick-604 measured it `pass`; the likely reason is the `max: 1` pool inheriting a GUC an earlier scoped statement set. **quick-610 found a SECOND, INDEPENDENT reason, and it is the more robust of the two:** all **11** queries across `dashboard.ts`'s two fetchers are individually `.catch(() => 0)` / `.catch(() => [])`, so a `TC001` there renders as a **zero metric and an empty alert list** — an owner's dashboard confidently reporting no drivers, no routes and no revenue — rather than as an error. That would have held even on a cold pool. The two sites are now scoped, so the raise is gone; **the swallows are not**, and they mean the correlated server-log slice, never the rendered page, is the authority for that surface. | The scoping is done. The swallows are **reported, not fixed** — changing them is a behaviour change that needs its own decision about what a partially-failed dashboard should show. |
| 5 | **THE STANDING CAVEAT ON EVERY `pass` IN THIS DOCUMENT.** The pool holds `max: 1`, so a bare statement can inherit a GUC an earlier scoped one left set (`unmigrated-path-tripwire.md` §8 item 7). This run issued dozens of requests through one pooled connection. | Read every `pass` with it. This task's own row 3 is the proof that it is not theoretical: the SAME route gave `TC001` on one run and a fixture error on another, purely on request order. |
| 6 | **`/carrier/imports/[id]/stops` is NOT_MEASURED** — `document_imports` holds 0 rows on staging, so no id can be substituted and no request was issued. | A seeded `document_imports` row for the fixture tenant, with its page's dependencies. |
| 7 | **Five AFTER rows are `LATENT`, not `pass`** — 2, 3, 8, 9, 13. Their data gates read 0: `Document` rows for the fixture driver, auto-generating `route_templates`, soft-deleted rows across the seven purge models, legacy `Truck` rows, `PlaybookInstance` rows. | Fixture rows for each. Rows 2 and 8 additionally have dedicated probes that DO prove them (§4, §5); rows 3, 9 and 13 do not. |
| 8 | ~~**`npm run audit:rls-policy-drift` reads PRODUCTION regardless of `DATABASE_URL`.**~~ **CLOSED by quick-607.** `scripts/_bootstrap-env.ts` no longer repoints `DATABASE_URL` at `DIRECT_URL` unconditionally. An explicitly-set `DATABASE_URL` is now honoured verbatim (`scripts/_db-target.ts` rung 3), two pins naming different projects REFUSE rather than pick one, and every run PRINTS the resolved project ref to stderr. The "`DIRECT_URL` must be exported too" workaround still works (rung 1) but is no longer required. | Done. The longer-term fix this row asked for — "the script should refuse when `DATABASE_URL` was set explicitly and then overwritten" — was implemented as *honour it* rather than *refuse*, because refusing would have broken every bare `npm run audit:*` invocation that legitimately relies on the port fix. |
| 9 | **Production's `Tag` / `TagAssignment` policy bodies differ from what the committed migration declares** — live `current_setting('app.current_tenant_id', true)`, declared `current_tenant_id()`. | Nothing: `20260914180000_tenant_context_tripwire` is committed and not yet deployed (production head is `20260914170000`). It resolves on the next `vercel --prod`. Recorded because the drift gate reports it as DRIFT DETECTED against production and that will confuse the next reader. |
| 10 | **`Document` drift in the OTHER direction.** Staging carries `createdBy`, `deletedBy`, `deletedAt`, `updatedBy`, which production lacks and which **no Prisma model declares**; and production carries `Document_driverId_idx`, which staging lacks although the column exists on both. | A decision, then a migration. Not touched here: dropping a column is irreversible and nothing measured requires it. Note that `Document` has **no `deletedAt` in `schema.prisma`** — a query written against it works on staging and fails on production. |
| 11 | **`rls-policy-replay.test.ts` fails, pre-existing** — `expected 434 to be 403`. | Whoever added the statements. Proven unrelated: the assertion message is **byte-identical in the BEFORE and AFTER suite runs**, and this task's two migrations contribute zero parsed statements. |
| 12 | **`/track/[token]` is now outside the tripwire's reach** (`app_admin` bypasses RLS). | Accepted, with the reasoning in §4. Revisiting it means option (a) — a `SECURITY DEFINER` token→tenant resolver — and a migration. |
| 13 | **The committed docs search indexes are STALE relative to a fresh build.** `npm run build` regenerated `apps/web/src/lib/docs/search-index.json` and `.docs-data/admin-docs-search-index.json` with 162 changed lines — a route corrected from `/carrier/route-templates` to `/carrier/templates`, and several `document-import` entries that are in the feature registry and not in the committed index. | Nothing to do with this task, and **reverted** so its diff stays honest. Whoever owns the docs registry should regenerate and commit, or the next person to run a build will keep seeing an unexplained dirty tree. |

---

## 9. Gates

| gate | result |
|---|---|
| `604-survey.ts --close` | **exit 0** — 156 / 183 / `20260914170000_…`, and both `.env` hashes byte-identical. The exit code is the evidence. |
| quick-604's four artefacts | **byte-identical** at open and at close, by sha256 (`evidence/00-…-at-open.txt` vs `evidence/10-…-at-close.txt`, `diff` empty). `04-pgstat.json` was accidentally appended to once and **restored from git**; its final state is committed and unmodified. |
| `npm run audit:rls-policy-drift` against **staging** | **CLEAN (exit 0)** — 183 live, 0 missing, 0 unexpected, **0 definition drift**, corpus hash matches the canonical artefact. Requires `DIRECT_URL` exported — see §8 item 8. |
| `npm run build` | **exit 0** — `✓ Compiled successfully in 47s`, 229 static pages generated. |
| full `apps/web` suite, **same reporter both sides** | BEFORE **2097** tests / **64** failed / **18** failing files · AFTER **2114** / **64** / **18**. Failing-file sets compared **by name in both directions**: `failing only in BEFORE: (none)`, `failing only in AFTER: (none)`. |
| suite delta | **+17 tests, exactly what this task added** — 8 in `tenant-mechanism-fence.test.ts` + 9 in `606-report-integrity.test.ts`. **0 newly failing, 0 newly passing.** |
| `npx tsc --noEmit` | **exit 0**, and **probed per R8**: a semantic `TS2322` injected into `src/lib/db/admin-reasons.ts` — a file this task actually edited — and confirmed reported at the injected line (`admin-reasons.ts(75,7): error TS2322`). Probe deleted, `git status` clean of it, re-run clean. Probed a second time earlier on `scripts/audit/604-survey.ts`. |
| `npx eslint` | **NOT RUN, NOT CLAIMED.** `apps/web` has no working lint entry point (quick-562). |
| `wrapper-countdown.json` | regenerated; diff inspected and quoted below. |
| `rls-policy-replay.test.ts` | fails **pre-existing and identically** in both runs — §8 item 11. |

### The BEFORE baseline was taken in the MAIN TREE, not a worktree

A `git worktree` does not carry the untracked `apps/web/.env.local` and therefore measures a
different tree (quick-567). The 30 modified files were checked out at the base commit `a93c3a31`, the
13 added files were moved aside, the suite was run, and everything was restored. `next dev` was
stopped first. Both sides used `--reporter=json` — `--reporter=basic` does not exist in vitest 4 and
exits 0 having run **zero** tests.

### `wrapper-countdown.json` — the four protected counts DID move, and that is the finding

```
BEFORE {"unmigratedUnits":456,"unmigratedCallSites":459,"withTenantContextCallSites":0,"filesScanned":1691,"filesWithUnmigratedUnits":202}
AFTER  {"unmigratedUnits":469,"unmigratedCallSites":472,"withTenantContextCallSites":0,"filesScanned":1691,"filesWithUnmigratedUnits":213}
```

Eleven files added, one changed, none removed:

```
+ app/(driver)/documents/page.tsx                      ["DriverDocumentsPage:10"]
+ app/(owner)/carrier/trips/page.tsx                   ["TripsPage:10"]
+ app/api/cron/carrier-auto-dispatch/route.ts          ["GET:36"]
+ app/api/cron/carrier-compliance-alerts/route.ts      ["GET:29"]
+ app/api/cron/digest-compliance-30day/route.ts        ["GET:30"]
+ app/api/cron/digest-daily-driver/route.ts            ["GET:30"]
+ app/api/cron/digest-weekly-owner/route.ts            ["GET:30"]
+ app/api/cron/purge-deleted/route.ts                  ["GET:11"]
+ lib/notifications/check-expiring-documents.ts        ["findExpiringDocuments:31"]
+ lib/notifications/check-expiring-driver-documents.ts ["findExpiringDriverDocuments:21"]
+ lib/notifications/check-upcoming-maintenance.ts      ["findUpcomingMaintenance:27"]
~ app/(owner)/actions/notifications.ts                 2 -> 4
```

**+13 units is exactly this task's thirteen new acquisitions.** It is not a scope breach, and it is
worth stating as a result in its own right: **closing an `app_user` failure RAISES the wrapper
countdown by construction.** A unit is a function containing a `getTenantPrisma` /
`getTenantPrismaForOrg` call not wrapped in `withTenantContext`, and `withTenantContext` does not
exist yet — so every bare-client site converted becomes a new unmigrated unit. Whoever plans that
migration should expect the number to climb as the `app_user` failures close.

`withTenantContextCallSites` is **still 0** — the anti-vacuity counter, and the one number that would
say the migration had been begun. `filesScanned` is unchanged at 1691.

---

## Corrections made to other documents

- `docs/audits/staging-app-user-end-to-end.md` §7e — the `Document` drift is **closed on staging** by
  `20260915120000_…`, and staging carries four columns production lacks. Corrected in place, dated.
- `docs/audits/staging-app-user-end-to-end.md` §7f — `carrier-auto-dispatch` is **not only** fixture
  data: `route.ts:52` is a bare-client tenant sweep that raises `TC001` depending on request order.
  Corrected in place, dated.
- `docs/audits/staging-app-user-end-to-end.md` §8 item 12 — `/track/[token]` is measured, and the
  legacy `"Load"` table holds **0 tokens on production**. Corrected in place, dated.
- `docs/audits/staging-environment.md` §2 — the `Document` drift is closed on staging; the remaining
  drift runs the other way. Noted in place, dated.

---

## What this task committed

Nine commits. The fixes, two migrations (staging-applied, one a proven production no-op and one a
production fix), one new guard, one new integrity test, five retargeted test files, three additive
harness modes, seven new audit scripts, this report, and the evidence directory.

**No policy was widened. No DDL right was granted to any runtime role. Production was never written
and reads identically at open and at close.**
