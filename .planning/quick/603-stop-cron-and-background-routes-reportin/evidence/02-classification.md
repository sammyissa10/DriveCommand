# 02 — Classification: every entry point, and every catch inside it

**Task:** quick-603 Task 1. Verdicts are per CATCH, not per file — `purge-deleted` carries three
separate defects in 54 lines.

The four symptoms referred to below, from the plan:

| id | symptom |
|---|---|
| **S1** | the log renders `Error: [object Object]` — an object literal sits in `logger.error`'s slot 2 |
| **S2** | `success`/`ok` is `true` beside a non-zero failure count, and/or a 200 for a partially-failed batch |
| **S3** | a failure is counted nowhere at all — the run has no counter for it |
| **S4** | a failure is erased from a total that already had it |

---

## The catch inventory

```
$ cd apps/web && grep -rnE "\}\s*catch|\.catch\(" src/app/api/cron/*/route.ts src/app/api/warmup/route.ts | wc -l
37
```

**37 catches across the 15 entry points.** `/api/warmup` has zero.

| # | site | wraps | verdict | symptoms | note |
|---|---|---|---|---|---|
| 1 | `auto-close-tickets:65` | the whole handler | `CLEAN` | — | returns `{success:false,error}` **500**; `logger.error(msg, error)` real arity |
| 2 | `automations:115` | the whole handler | `CLEAN` | — | returns `{ok:false,error}` **500** (uses `console.error`, so no Sentry — noted, not a reporting lie) |
| 3 | `automations:195` | one `automationRun.create` per candidate tenant | `DELIBERATE_MISREPORTED` | **S3** | per-tenant scheduling failure is `console.error`'d and **counted nowhere**; the route then returns `{ok:true, …}` |
| 4 | `carrier-auto-dispatch:60` | the tenant sweep | `CLEAN` | — | 500, real arity |
| 5 | `carrier-auto-dispatch:151` | one template | `DELIBERATE_MISREPORTED` | **S2** | counts `tenantErrors` ✓, real arity ✓ — but the run still ends `success:true` |
| 6 | `carrier-auto-dispatch:170` | one tenant | `DELIBERATE_MISREPORTED` | **S2** | counts `total_errors` ✓, real arity ✓ — same `success:true` |
| 7 | `carrier-compliance-alerts:51` | the idempotent DDL | `CLEAN` | — | 500, real arity |
| 8 | `carrier-compliance-alerts:70` | the tenant sweep | `CLEAN` | — | 500, real arity |
| 9 | `carrier-compliance-alerts:99` | the batched alert email | `DELIBERATE_MISREPORTED` | **S1 S3** | `logger.error(msg, { tenantId, error: err })` → `[object Object]`; counted nowhere |
| 10 | `carrier-compliance-alerts:113` | one tenant | `DELIBERATE_MISREPORTED` | **S2 S3** | real arity ✓ but **no counter** — `orgs_processed` merely does not increment, so a failed tenant is indistinguishable from one that does not exist |
| 11 | `cleanup-quarantine:85` | one `DeleteObject` | `DELIBERATE_MISREPORTED` | **S1 S2** | counts `errors++` ✓; `logger.error(msg, { key, error: String(err) })` → `[object Object]` |
| 12 | `cleanup-quarantine:96` | the whole `ListObjectsV2` pagination | `DELIBERATE_MISREPORTED` | **S1** | returns 500 ✓ but `logger.error(msg, { error: String(err) })` → `[object Object]` |
| 13 | `digest-compliance-30day:79` | `dispatchNotification` | `DELIBERATE_MISREPORTED` | **S2** | real arity ✓, returns `{failed:1}` ✓ — the run still ends `success:true` |
| 14 | `digest-compliance-30day:86` | one owner | `DELIBERATE_MISREPORTED` | **S2** | counts ✓, real arity ✓ |
| 15 | `digest-compliance-30day:91` | one tenant | `DELIBERATE_MISREPORTED` | **S2** | counts ✓, real arity ✓ |
| 16 | `digest-daily-driver:77` | `dispatchNotification` | `DELIBERATE_MISREPORTED` | **S2** | as 13 |
| 17 | `digest-daily-driver:84` | one driver | `DELIBERATE_MISREPORTED` | **S2** | as 14 |
| 18 | `digest-daily-driver:89` | one tenant | `DELIBERATE_MISREPORTED` | **S2** | as 15 |
| 19 | `digest-weekly-owner:77` | `dispatchNotification` | `DELIBERATE_MISREPORTED` | **S2** | as 13 |
| 20 | `digest-weekly-owner:84` | one owner | `DELIBERATE_MISREPORTED` | **S2** | as 14 |
| 21 | `digest-weekly-owner:89` | one tenant | `DELIBERATE_MISREPORTED` | **S2** | as 15 |
| 22 | `mark-overdue-invoices:36` | the whole handler | `CLEAN` | — | 500, real arity |
| 23 | `purge-deleted:44` | one model's `deleteMany` | `DELIBERATE_MISREPORTED` | **S1 S2 S4** | the worked example. `logger.error(msg, { error: String(err) })` → `[object Object]`; writes `-1`; `.filter(n => n > 0)` on line 50 then **erases the `-1`** from `totalPurged`; returns `success:true` |
| 24 | `send-reminders:68` | the tenant sweep | `CLEAN` | — | 500, real arity |
| 25 | `send-reminders:113` | one maintenance dispatch | `DELIBERATE_MISREPORTED` | **S2** | `maintenanceStats.failed++` ✓, real arity ✓ |
| 26 | `send-reminders:136` | one document dispatch | `DELIBERATE_MISREPORTED` | **S2** | `documentStats.failed++` ✓, real arity ✓ |
| 27 | `send-reminders:160` | one driver-doc dispatch | `DELIBERATE_MISREPORTED` | **S2** | `driverDocumentStats.failed++` ✓, real arity ✓ |
| 28 | `send-reminders:165` | one whole tenant | `DELIBERATE_MISREPORTED` | **S2 S3** | `continue` with **no counter at all** — a whole tenant's reminders can be lost and `processedTenants` still reports it as processed |
| 29 | `trip-reminders:150` | one tenant | `DELIBERATE_MISREPORTED` | **S2** | `tenantsFailed++` ✓, real arity ✓, `serializeError` ✓ — only `ok:true` + 200 are wrong |
| 30 | `trip-reminders:175` | the whole run | `CLEAN` | — | 500, real arity, `serializeError` |
| 31 | `workflow-digest:61` | the active-tenant sweep | `DELIBERATE_MISREPORTED` | **S1** | returns 500 ✓ but `logger.error(msg, { error: err })` → `[object Object]` |
| 32 | `workflow-digest:160` | one recipient's email | `DELIBERATE_MISREPORTED` | **S1 S3** | `{ error: emailErr }` in slot 2; counted nowhere — every recipient of a tenant can fail and `tenantsSent++` still runs |
| 33 | `workflow-digest:193` | one tenant | `DELIBERATE_MISREPORTED` | **S1 S2** | `tenantsErrored++` ✓ but `{ error: err }` in slot 2, and `ok:true` regardless |
| 34 | `workflow-notifications:104` | one overdue step | `DELIBERATE_MISREPORTED` | **S1 S2** | `overdueErrors++` ✓, `{ err }` in slot 2 |
| 35 | `workflow-notifications:109` | the whole of sweep 1 | `DELIBERATE_MISREPORTED` | **S1 S3** | `{ err }` in slot 2; **counted nowhere** — the entire STEP_OVERDUE sweep can fail and the response reads `overdueSent:0, overdueErrors:0`, which is exactly what a clean run with nothing to do looks like |
| 36 | `workflow-notifications:154` | one blocked-instance email | `DELIBERATE_MISREPORTED` | **S1 S2** | `blockedEmailErrors++` ✓, `{ err }` in slot 2 (multi-line — the one site the grep scan missed) |
| 37 | `workflow-notifications:162` | the whole of sweep 2 | `DELIBERATE_MISREPORTED` | **S1 S3** | as 35 |

---

## Roll-up: the 15 entry points

| # | entry point | verdict | symptoms | intended fix (one line) |
|---|---|---|---|---|
| 1 | `/api/warmup` | **CLEAN** | — | no catch at all; `prisma.$queryRaw` propagates and Next returns 500. Confirmed — leave alone |
| 2 | `auto-close-tickets` | **CLEAN** | — | one catch, honest 500, real arity. Leave alone |
| 3 | `mark-overdue-invoices` | **CLEAN** | — | same shape. Leave alone |
| 4 | `automations` | `DELIBERATE_MISREPORTED` | S3 | count per-tenant scheduling failures, name them, stop `ok:true` while non-zero |
| 5 | `carrier-auto-dispatch` | `DELIBERATE_MISREPORTED` | S2 | `success` must follow `total_errors`; status must follow it too |
| 6 | `carrier-compliance-alerts` | `DELIBERATE_MISREPORTED` | S1 S2 S3 | real arity at :99; count the failed tenant and the failed email; honest `success` + status |
| 7 | `cleanup-quarantine` | `DELIBERATE_MISREPORTED` | S1 S2 | real arity at :85 and :97; honest `success` + status. **Its missing schedule is NOT fixed** |
| 8 | `digest-compliance-30day` | `DELIBERATE_MISREPORTED` | S2 | honest `success` + status beside the existing `failed` |
| 9 | `digest-daily-driver` | `DELIBERATE_MISREPORTED` | S2 | as above |
| 10 | `digest-weekly-owner` | `DELIBERATE_MISREPORTED` | S2 | as above |
| 11 | `purge-deleted` | `DELIBERATE_MISREPORTED` | S1 S2 S4 | real arity; drop the `-1` sentinel and the `.filter(n>0)`; separate `purged` from `failures`; honest `success` + status |
| 12 | `send-reminders` | `DELIBERATE_MISREPORTED` | S2 S3 | count and NAME the lost tenant; honest `success` + status |
| 13 | `trip-reminders` | `DELIBERATE_MISREPORTED` | S2 | honest `ok` + status beside the existing `tenantsFailed` |
| 14 | `workflow-digest` | `DELIBERATE_MISREPORTED` | S1 S2 S3 | real arity ×3; count the failed emails; honest `ok` + status |
| 15 | `workflow-notifications` | `DELIBERATE_MISREPORTED` | S1 S2 S3 | real arity ×4; count a failed SWEEP separately from a failed item; honest `ok` + status |

**CLEAN 3 · DELIBERATE_REPORTED 0 (among the 15) · DELIBERATE_MISREPORTED 12 · ACCIDENTAL 0.**

`DELIBERATE_REPORTED` is not empty overall — it holds the two `after()` wrappers
(`commit-service.ts:264`, `emit.ts:87`), which are not scheduled entry points. They are the
precedent Task 3 copies and are left untouched.

---

## ACCIDENTAL: zero sites, and here is the examination that establishes it

`ACCIDENTAL` means *the catch is wider than what it was meant to handle.* All 37 catches above were
read in full. The three shapes the plan names as typical were searched for explicitly:

```
$ cd apps/web && grep -rnE "catch\s*\{" src/app/api/cron src/app/api/warmup | wc -l
0                                    # no bare `catch {}`
$ grep -rnE "\.catch\(\(\s*\)\s*=>" src/app/api/cron src/app/api/warmup
(no output)                          # no `.catch(() => null)` / `.catch(() => {})`
```

Every one of the 37 binds an error variable and logs it. The third shape — *a `try` wrapped around
more statements than the one that can legitimately fail* — was checked by reading each `try` block's
extent:

- The four sweep-level catches that wrap a query **and** a loop (`workflow-notifications:109` and
  `:162`, `cleanup-quarantine:96`, and the digests' tenant catches) each sit outside a loop whose
  body **already has its own inner catch**. The outer one therefore only ever receives a failure of
  the query or of the loop scaffolding — which is what it was written for. Wide in line count,
  narrow in what can actually reach it.
- `send-reminders:165` wraps a `Promise.all` plus three loops; all three loops carry per-item
  catches, so again only the `Promise.all` reaches it.
- The per-item catches (`purge-deleted:44`, `cleanup-quarantine:85`, `carrier-auto-dispatch:151`,
  the six digest ones, the three `send-reminders` ones) each wrap exactly one awaited call.
- `automations:33` wraps four scheduler calls and `runEvaluator()`, and returns an honest 500 — so
  it is not misreporting, and narrowing it would change failure semantics rather than reporting.

**Finding: zero ACCIDENTAL sites.** Every catch on the scheduled surface is deliberate. The defect
is uniformly in the *reporting*, not in the *catching* — which is the plan's design constraint 1
turning out to describe the whole population rather than most of it. Task 4 is therefore a one-line
finding by design, not by omission.
