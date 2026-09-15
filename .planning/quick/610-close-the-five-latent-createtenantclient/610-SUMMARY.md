# quick-610 — the six LATENT `createTenantClient` callers are closed

**Date:** 2026-09-15
**Target:** `drivecommand-staging` (`wyixpgunnjmzguhggocz`), `app_user`, tripwire armed.
**Production (`oqdhberkghtnszrkdvfm`): never written, and never connected to.** Every script
refuses positively on that ref; the one item below that concerns production is reported from the
committed audits and explicitly **not** re-verified live.

---

## 0. Staging, at open — nothing had reverted

| reading | value |
|---|---|
| `current_user` / `rolbypassrls` | `app_user` / **false** |
| `public.tenant_context_required` present | **true** |
| tripwire branch inside `current_tenant_id()` | **present** (the `COALESCE`/`NULLIF` shape from quick-602) |
| `pg_policy` in `public` | 183 |

The server used for the click-through was brought up with quick-606's **committed** launcher,
unmodified. Its own guard line:

```
GUARD 1: DATABASE_URL role=app_user ref=wyixpgunnjmzguhggocz port=5432 · DATABASE_URL_ADMIN role=app_admin ref=wyixpgunnjmzguhggocz port=5432
```

---

## 1. It is SIX, not five, and not four

Grep-verified, and the two prior counts disagree with each other:

- The brief says **five**.
- `docs/audits/app-user-failure-remediation.md` §8 item 3 says **"Four"** — against its own §7
  table, which lists 2 + 3 + 1. The word is an arithmetic slip; the table was right.

**Six call sites across three files.** Corrected in place in §8 item 3.

| # | file:line | fn | tenant available at that point |
|---|---|---|---|
| s1 | `src/app/(owner)/actions/dashboard.ts:85` | `_fetchNotificationAlerts` | **ARGUMENT** — `tenantId` param, resolved upstream by `getAuthContext()` from the session |
| s2 | `src/app/(owner)/actions/dashboard.ts:330` | `_fetchDashboardMetrics` | **ARGUMENT** — same |
| s3 | `src/app/(owner)/actions/tenant-notification-settings.ts:374` | `listTenantUsers` | **SESSION** — `requireTenantAccess()` on the function's first line |
| s4 | `…:513` | `listTenantSendLog` | **SESSION** — same |
| s5 | `…:543` | `getTenantSendLogStats` | **SESSION** — same |
| s6 | `src/lib/db/repositories/base.repository.ts:11` | `TenantRepository` constructor | **CONSTRUCTOR ARGUMENT** — passed by all 22 call sites |

**No site is in the "nowhere" case.** That is the finding that decided the shape of this task: it is
a ROUTING change throughout, and no signature had to be threaded. Had any site had no tenant in
hand, the instruction was to stop and report rather than guess one.

---

## 2. Every one is LATENT — measured, per caller, not summarised

`apps/web/scripts/audit/610-latent-caller-probe.ts --before`. **One CHILD PROCESS per site**, so
each verdict is the first tenant-touching statement its process ever issues and no probe can inherit
the previous probe's context — the `max: 1` + session-scope interaction quick-602 recorded and
`app-user-failure-remediation.md` §8 item 5 makes the standing caveat on every `pass`.

```
| s1 | dashboard.ts:85                      | _fetchNotificationAlerts | RAISED TC001 | tenant context is required: app.current_tenant_id is the EMPTY STRING |
| s2 | dashboard.ts:330                     | _fetchDashboardMetrics   | RAISED TC001 | tenant context is required: app.current_tenant_id is the EMPTY STRING |
| s3 | tenant-notification-settings.ts:374  | listTenantUsers          | RAISED TC001 | tenant context is required: app.current_tenant_id is the EMPTY STRING |
| s4 | tenant-notification-settings.ts:513  | listTenantSendLog        | RAISED TC001 | tenant context is required: app.current_tenant_id is the EMPTY STRING |
| s5 | tenant-notification-settings.ts:543  | getTenantSendLogStats    | RAISED TC001 | tenant context is required: app.current_tenant_id is the EMPTY STRING |
| s6 | base.repository.ts:11                | TenantRepository ctor    | RAISED TC001 | tenant context is required: app.current_tenant_id is the EMPTY STRING |
```

**6 of 6 raised. Nothing reclassified.** quick-606 reported these from reading; this is the
measurement, and the reading was right.

### Three things the measurement settled that reading could not

**(a) An EMPTY table still raises.** Measured before anything else, because if it did not, five of
the six probes would have been vacuous — `Truck`, `Route`, `Document`, `Invoice`, `Load` and
`SafetyEvent` all hold zero rows on staging. They raise anyway: the policy expression is evaluated
at scan setup, not per row. This is the OPPOSITE of the quick-606 LATENT trap, where a 200 was a 200
only because a query found nothing.

**(b) `NotificationSendLog` DOES carry RLS, and the in-code comment saying otherwise was false.**
`tenant-notification-settings.ts` asserted *"NotificationSendLog has no Postgres RLS"* in two
places. Measured: `relrowsecurity = true`, `relforcerowsecurity = true`, **2 policies** — and s4/s5
raise. The same comment's second half, *"the postgres role has BYPASSRLS so no `bypass_rls` SET is
needed"*, is true of `postgres` and beside the point: the cutover target is `app_user`,
`rolbypassrls = false`. Both sentences argued for leaving the client unscoped. The quick-547/548
shape — a comment asserting the invariant that had already failed. Corrected against the
measurement.

**(c) The SQLSTATE is reachable, so detection is BY CODE and not by prose.** Prisma does **not** put
it on `err.code`: a policy raise arrives as a `DriverAdapterError` whose own `code`, `errorCode` and
`meta` are all `undefined` and whose own keys are `name, cause, clientVersion`. It is on
`err.cause.code`. A probe reading `err.code` would have recorded `UNKNOWN` for all six and invited
exactly the message match quick-602 forbids. The probe walks the cause chain.

---

## 3. `base.repository.ts` — first, alone, and it reaches every subclass

Commit `b9a94d1c`, on its own.

- `TenantRepository` has exactly **TWO** subclasses: `DocumentRepository`, `TruckRepository`.
  `TenantProvisioningRepository` does **not** extend it.
- `TruckRepository`: **zero** instantiation sites outside its own file.
- `DocumentRepository`: **22** `new DocumentRepository(tenantId)` sites across **11** files.
- **The fix reaches ALL subclasses**, because it changes the base class's own acquisition rather
  than anything per-subclass. And it closed **one** of the other five for free — s6 was the only one
  behind it; s1–s5 are direct callers in their own files and needed their own change.

**The constraint that decided the shape:** the constructor is SYNCHRONOUS and
`getTenantPrismaForOrg` is ASYNC. The client is therefore resolved lazily per method. The
async-static-factory alternative was rejected because it makes construction async and rewrites all
22 call sites — changing what those callers DO rather than only how the repository obtains its
client. `git diff --stat` on that commit names **4 files and none of the 11**.

**The `db` field is DELETED, and that is load-bearing.** With it gone every surviving `this.db.` is
a compile error, so tsc enumerated the **14** methods (8 + 6) that had to convert. Keeping `db`
beside `client()` would let a method silently retain the GUC-less client — the defect itself. Same
idiom as the T3/T4 verdict union.

**Deliberately NOT memoised per instance.** Every non-transactional statement is an independent pool
checkout and the GUC is session-scoped, so caching would re-open the bug the moment another tenant
interleaves between two method calls on one repository object. One extra round trip per method is
the accepted, named cost.

---

## 4. Which wrapper, and why not the one §8 recommended

**`getTenantPrismaForOrg(tenantId)` at all six, with NO `userId`.**

§8 item 3 recommends `getTenantPrisma()`. That is a divergence and it is deliberate:

- At all six the tenant is already an **in-hand value**, so there is nothing to re-derive.
  `getTenantPrisma()` would additionally re-read the session and add a header-mismatch throw path
  these call sites do not have today.
- `getTenantPrisma()` forwards `session?.userId` into the audit-columns extension. Today's
  `createTenantClient(tenantId)` passes **none**, so switching would begin writing
  `createdById`/`updatedById` on `DocumentRepository#create`. That is a behaviour change wearing a
  routing fix's clothes, and the task's constraint was to change only how the client is obtained.

`getTenantPrismaForOrg(tenantId)` with no `userId` is exactly today's client **plus the
`set_config`**. Nothing any caller returns or asserts changed — provable from the diffs.

**Nothing was routed to `getAdminDb`.** Every one of the six had a tenant in hand, so a tenant-scoped
path serves all six and the question never arose.

---

## 5. Re-measured cold — both directions, non-vacuously

`--after`, same one-process-per-site shape.

```
| s1 | dashboard.ts:85                     | no raise | truck.findMany -> 1 row(s)                  · cross-tenant: own=1 foreign=0 |
| s2 | dashboard.ts:330                    | no raise | user.count(role=DRIVER, isActive) -> 3       · cross-tenant: own=6 foreign=0 |
| s3 | tenant-notification-settings.ts:374 | no raise | user.findMany(isActive) -> 6 row(s)          · cross-tenant: own=6 foreign=0 |
| s4 | tenant-notification-settings.ts:513 | no raise | notificationSendLog.count -> 1               · cross-tenant: own=1 foreign=0 |
| s5 | tenant-notification-settings.ts:543 | no raise | notificationSendLog.count(30d) -> 1          · cross-tenant: own=1 foreign=0 |
| s6 | base.repository.ts:11               | no raise | DocumentRepository#findByTruckId -> 1 row(s) · cross-tenant: own=1 foreign=0 |
```

**Direction A — the legitimate read succeeds**, and returns real rows at every site.
**Direction B — the cross-tenant variant is refused**, `foreign = 0` at every site, via **raw SQL
through the same returned client**. Raw is essential: it bypasses `withTenantRLS`'s argument
injection, so RLS *alone* decides those rows. Through the Prisma model API the injected filter would
have answered and the policy would never have been tested.

**`own > 0` is part of the assertion, not decoration.** `foreign = 0` alone is satisfied by an empty
table. `610-staging-fixtures.ts --ensure` seeded one `Truck`, one `Document` and one
`NotificationSendLog` row **for each of the two staging tenants** precisely so neither direction can
pass vacuously — which is the fixture work `app-user-failure-remediation.md` §8 item 7 asked for.

**One transient, recorded rather than smoothed over.** The first `--after` sweep returned
`P2010 / Server has closed the connection` at s4 and s5 — on the `set_config` itself. That is
transport, not a policy refusal: both passed immediately when re-run alone. Six fresh Supavisor
connections back-to-back is the cause; the probe now paces its children. No retry was added, because
a retry could mask a genuine refusal.

---

## 6. The click-through — nothing regressed

Three sweeps against the staging server, all correlated by server-log byte offset (the status code
is never the authority — quick-602 measured seven raises behind `success: true`).

| sweep | result |
|---|---|
| quick-606's 15-row re-run | **pass 9 · fail 0 · LATENT 4 · NOT_MEASURED 2 · not-reachable 0** |
| pass 1 (41 entries, incl. `/dashboard`) | **pass 41 · fail 0 · not-reachable 0** |
| pass 2 (merged 66, incl. `/settings/notifications`) | **pass 60 · fail 0 · not-reachable 6** |

**`TC001` occurrences in the entire server log across all three sweeps: 0.**

Against quick-606's close (**8 pass · 0 fail · 5 LATENT · 2 NOT_MEASURED**) exactly one row moved
and nothing regressed:

- **Row 9 `/api/cron/send-reminders`: LATENT → pass.** Its data gate was "legacy `Truck` rows = 0";
  this task's fixtures made it non-zero, so the route now actually exercises the scoping instead of
  finding nothing to do. Attributable to the FIXTURES, not to the code change — stated so nobody
  reads it as a repair.
- The six `not-reachable` rows in pass 2 are route-shape artefacts (`/carrier/driver-pay` and
  `/carrier/reports` are directories, `/onboarding` 307s, `/track/604-probe-no-seeded-token` is a
  deliberately fake token). Unchanged from quick-604.

The two surfaces that reach s1–s5 end-to-end, quoted from the log slice:

```
/dashboard               200 pass  sqlstate null  logTc001Mentions 0  logByteRange [8331, 8420]
/settings/notifications  200 pass  sqlstate null  logTc001Mentions 0  logByteRange [24533, 24631]
```

**Stated plainly: those two are NOT cold-pool proofs.** The server had served dozens of requests
before them, so they establish "nothing regressed end-to-end", and the cold-pool probe is what
establishes latency and its closure. Two instruments, different claims.

**Nothing of quick-604's or quick-606's evidence was overwritten.** All 28 prior artefacts hashed at
open and at close: **byte-identical**, and both directories clean in `git status`. This required one
additive change to `604-click-through.ts`: passes 1 and 2 now honour the `--out` flag that
`--surfaces3` and `--surfaces606` already had. Omitting the flag is byte-for-byte the previous
behaviour.

---

## 7. Gates

| gate | result |
|---|---|
| `npx tsc --noEmit` | **clean**, and **PROBED** — an injected `const x: number = 'y'` was reported as `TS2322` in the file actually edited, then removed |
| `npm run build` | **succeeds** (exit 0, full route table emitted) |
| `npm run audit:rls-policy-drift` vs staging | **CLEAN** — 183/183, missing 0, unexpected 0, **definition drift 0**, corpus hash == canonical hash. Banner: `[db-target] project : wyixpgunnjmzguhggocz (staging)` |
| fence guard | 9/9, **both new assertions witnessed RED** and reverted |
| vitest, same reporter both directions | see below |

### The suite, measured the same way in both directions

BEFORE was taken on the clean tree at `06a6ef66` **before any edit**, AFTER with `--reporter=json`
likewise — the same reporter, per quick-565 (`--silent` and `--reporter=json` disagree by ±4, and
`--reporter=basic` does not exist in vitest 4 and exits 0 having run zero tests).

|  | tests | passed | failed | pending | failing FILES |
|---|---|---|---|---|---|
| BEFORE (clean tree, `06a6ef66`, before any edit) | 2122 | 2003 | 64 | 52 | 25 |
| AFTER, first run | 2123 | 2002 | **66** | 52 | **26** |
| FINAL (after the last commit) | 2123 | **2004** | **64** | 52 | **25 — set byte-identical to BEFORE** |

`diff` of the two failing-file lists is empty. `failed` is identical at 64; `+1`
passing test is this task's new named-negative assertion. The final run was taken
**after the last commit**, per quick-561 — quick-559 published a baseline measured
before it wrote its own guard file and was 7 tests short.

**The first AFTER run had one extra failing file and it was a real regression — by a guard doing
exactly its job.** `tests/security/wrapper-migration-countdown.test.ts`:

```
AssertionError: expected { unmigratedUnits: 475, …(4) } to deeply equal { unmigratedUnits: 469, …(4) }
```

**The countdown went UP by six, and that is the honest number.** `createTenantClient` is not an
acquisition the counter recognises, so these six sites were **invisible** to the migration
countdown; `getTenantPrismaForOrg` is one, so they are now counted. +2 `dashboard.ts`, +3
`tenant-notification-settings.ts`, +1 `base.repository.ts`; files 213 → 214. The artefact was
regenerated rather than the assertion weakened. This is quick-602's "the two instruments see
different populations" in a new form: a site can be invisible to the countdown and still be one of
the most dangerous things on the tree.

`+1` test is this task's new named-negative assertion.

---

## 8. What remains between here and the `app_user` cutover

This task changed **none** of the four known items. None of them was touched, begun, or worked
around.

| # | item | status | changed by 610? |
|---|---|---|---|
| 1 | **`AutomationRule` DELETE split** | OPEN. `WITH CHECK` closed INSERT and UPDATE on staging (quick-599) and **does not reach DELETE**, which is checked against `USING` alone — measured 6 SYSTEM rows deletable by a tenant-scoped connection both before and after. The fix is a four-policy command split (`FOR SELECT`/`FOR INSERT`/`FOR UPDATE`/`FOR DELETE`), named and not built. **Production still PENDING even for the INSERT/UPDATE half.** | no |
| 2 | **The 17 `25P02` transaction-abort sites** | OPEN. `bypass-replacement-design.md` B10. One failing statement leaves the transaction aborted and every subsequent statement fails `25P02` until rollback — `wrapper-migration-scope.md` §6 records a case where the commit rolls back the driver row the owner was told had been created. | no |
| 3 | **`app_admin` LOGIN on production** | OPEN. The migration creates the role `NOLOGIN`; `LOGIN` + password are granted out of band by a human, and were minted for **staging only**. **NOT re-verified live this session** — production was deliberately never connected to. Reported from `docs/audits/admin-connection.md`. | no |
| 4 | **The bypass policy drop** | OPEN and not begun. 86 `bypass_rls_policy` rows on staging; this task dropped none. Note the interaction quick-602 recorded: a bypass-flagged statement is EXEMPTED from the tripwire, so ~211 sites stay unsignalled and remain the Phase 0 bypass programme's. | no |

### Newly found by this task

1. **`/dashboard` swallows every one of its own query failures, and that is a worse failure mode
   than a 500.** All **11** queries across the two fetchers are individually `.catch(() => 0)` /
   `.catch(() => [])`. A `TC001` there therefore renders as a **zero metric and an empty alert
   list** — an owner's dashboard confidently reporting no drivers, no routes, no revenue. This is a
   second, INDEPENDENT reason quick-604 measured `/dashboard` as `pass`, on top of the
   pool-inheritance one §8 item 4 attributes it to, and it is the more robust of the two: it would
   have held even on a cold pool. Recorded in code at the fetchers. **Not fixed** — changing the
   swallows is a behaviour change outside this task's remit, and it wants its own decision about
   what a partially-failed dashboard should show.
2. **`NotificationSendLog` carries RLS**, contradicting two in-code comments that were used to
   justify not scoping the client. Corrected.
3. **14 `NotificationSendLog` rows on staging carry a `tenantId` matching NEITHER tenant in
   `"Tenant"`** (`6ba17c17…`, `dbd03fd7…`). Orphans from an earlier task. **Not touched** — nothing
   measured requires it and deleting rows is irreversible. Worth an owner.
4. **The wrapper countdown was blind to `createTenantClient`.** Six of the most dangerous sites on
   the tree contributed zero to the number tracking the migration. They are now counted. Anyone
   reading 469 → 475 as a regression should read §7.

### Deferred, with reasons

- **`/documents` is still LATENT** (row 2). Its gate is `Document` rows *for the fixture driver*;
  this task's fixtures hang off a truck. One driver-attached `Document` row would close it.
- Rows 3, 8 and 13 remain LATENT for the reasons `app-user-failure-remediation.md` §8 item 7 gives.
  Untouched.
- **Fixture rows were left in place on staging, deliberately** — they are what makes rows 9 and the
  cross-tenant direction non-vacuous, and §8 item 7 asked for exactly them. Ids are deterministic
  (`610a…`/`610d…`/`610e…`) and `610-staging-fixtures.ts --ensure` is idempotent.

---

## 9. Artefacts

| file | what |
|---|---|
| `apps/web/scripts/audit/610-latent-caller-probe.ts` | the cold-pool probe, `--before` / `--after`, one child per site |
| `apps/web/scripts/audit/610-staging-fixtures.ts` | idempotent staging fixtures, `--ensure` / `--report` |
| `evidence/02-cold-before.{json,md}` | the six BEFORE verdicts |
| `evidence/05-cold-after.{json,md}` | the six AFTER verdicts, both directions |
| `evidence/06-click-through-after.json` | quick-606's 15 rows, re-run |
| `evidence/07-surfaces-pass1.json` | passes 1 + 2, merged, 66 entries |
| `evidence/08-policy-drift-staging.txt` | drift CLEAN, with the `[db-target]` banner |
| `evidence/00-/10-prior-evidence-hashes-at-{open,close}.txt` | 28 prior artefacts, proven untouched |
| `evidence/00-suite-before.json`, `11-suite-after.json` | the two suite runs |

## 10. Commits

| commit | what |
|---|---|
| `b9a94d1c` | `base.repository.ts`, alone — the lazy accessor, the deleted `db` field, 14 methods converted |
| `73ae3a23` | the five server-action sites, the two corrected comments, the fence closed |
| (this) | probe + fixtures + evidence + doc corrections |
