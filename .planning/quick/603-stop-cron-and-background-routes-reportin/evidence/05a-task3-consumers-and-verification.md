# 05a — Task 3: consumer grep, per-route before/after, and the verification greps

## 1. Consumer grep — run BEFORE a line was changed

Constraint 3 requires grepping for consumers of each response body before changing its shape.

```
$ grep -rn "totalPurged|markedOverdue|orgs_processed|blockedEmailsSent|tenantsSent|
            driverDocumentStats|processedTenants|total_dispatches_created|remindersSent" \
    --include="*.{ts,tsx,js,mjs}"
```

**Every single match is inside the route that produces the key.** No test, no script, no mobile
client, no monitoring integration, no e2e spec reads any cron response body.

The one thing that has ever read one is `apps/web/scripts/audit/602-execution-sweep.ts`, and it does
so as **opaque text** — `body = (await res.text()).slice(0, 300)` at line 343, recorded into its
report. It asserts on no key.

**Conclusion: the additive keys are unconditionally safe, and even the pre-existing keys have no
external reader.** They were kept anyway, per constraint 3.

## 2. The ONE non-purely-additive change, declared

`send-reminders`' `processedTenants` was the literal `tenants.length` — the number of tenants
**found**, published under a key that says **processed**. A tenant that threw at the bottom of the
loop was `continue`d and still counted as processed. It now counts completions, and `tenantsFound`
is added so the original number is still available.

**On a fully-successful run the two are identical**, so nothing observable changes on the success
path. Declared here rather than folded in silently.

## 3. Per-route before → after

| route | status before → after | body before → after | log before → after |
|---|---|---|---|
| `purge-deleted` | 200 always → **500 when any model fails** | `{success:true, totalPurged, results}` where a failed model wrote `-1` and the total's positives-only filter **erased it** → `{success:failures.ok, totalPurged, results, failureCount, failures[]}`; `results` now holds **successes only**, the `-1` sentinel and the filter are **deleted** | `logger.error(msg, {error:String(err)})` → `Error: [object Object]` → `failures.record` → real arity, real message, `serializeError` in the context |
| `send-reminders` | 200 always → **500 when any failure** | `{success:true, processedTenants:tenants.length, maintenance, documents, driverDocuments}` → `{success:failures.ok, processedTenants:<completions>, tenantsFound, …, failureCount, failures[]}`; the **tenant-level `continue` now counts and NAMES the lost tenant**, and a non-zero `result.failed` from the dispatcher is recorded too | already correct arity; unchanged in kind, now routed through `record` so the named entry and the log come from one call |
| `digest-daily-driver` | 200 always → **500 when any failure** | `{success:true, processedTenants, sent, skipped, failed}` → same + `{success:failures.ok, failureCount, failures[]}`; the dispatcher's own `result.failed` is recorded so `success` cannot be true beside `failed: 3` | already correct arity; unchanged in kind |
| `digest-weekly-owner` | as above | as above | as above |
| `digest-compliance-30day` | as above | as above | as above |
| `cleanup-quarantine` | 200 always → **500 when any object fails to delete** | `{success:true, scanned, deleted, errors}` → same + `{success:failures.ok, failureCount, failures[]}` | `{key, error:String(err)}` and `{error:String(err)}` in slot 2 → **both fixed** |
| `carrier-auto-dispatch` | 200 always → **500 when `total_errors > 0`** | `{success:true, orgs_processed, …, total_errors, details}` → same + `{success:failures.ok, failureCount, failures[]}`; `generateDispatches`' own `string[]` errors are now NAMED (they were only `logger.warn`ed, so they never reached Sentry as exceptions) | correct arity kept; the summary `logger.warn` is replaced by one named `record` per error |
| `carrier-compliance-alerts` | 200 always → **500 when any tenant or email fails** | `{success:true, orgs_processed, total_alerts_found}` → same + `{success:failures.ok, failureCount, failures[]}`; the tenant catch **used to have no counter at all** — a blown-up tenant was indistinguishable from one that does not exist | `{tenantId, error: err}` in slot 2 → fixed |
| `trip-reminders` | 200 always → **500 when `tenantsFailed > 0`** | `{ok:true, tenantsProcessed, tenantsFailed, remindersSent, windowHours}` → same + `{ok:failures.ok, failureCount, failures[]}` | **already correct** (real arity + `serializeError`) and unchanged; only the body and status moved |
| `workflow-digest` | 200 always → **500 when any tenant or email fails** | `{ok:true, tenantsSent, tenantsSkipped, tenantsErrored}` → same + `{ok:failures.ok, failureCount, failures[]}`; the **per-recipient email failure had no counter**, so every recipient of a tenant could fail and `tenantsSent++` still ran | `{error: err}` ×3 in slot 2 → all fixed |
| `workflow-notifications` | 200 always → **500 when any item or sweep fails** | `{ok:true, stats}` → `{ok:failures.ok, stats, failureCount, failures[]}` with a **new `stats.sweepsFailed`** | `{err}` ×4 in slot 2 → all fixed |
| `automations` | 200 on the happy path → **500 when any tenant's scheduling fails** | `{ok:true, ...evaluatorResult}` → `{ok:failures.ok, …, failureCount, failures[]}`; the per-tenant scheduling catch **had no counter**, and `runEvaluator`'s own `failed` count is now recorded too | `console.error` (never reached Sentry) → `failures.record` → `logger.error` → `Sentry.captureException` |

### The sharpest case, stated separately

`workflow-notifications`' two sweep-level catches swallowed a query failure with **no counter at
all**. If the STEP_OVERDUE query failed, the response was
`{ok:true, stats:{overdueSent:0, overdueErrors:0, …}}` — **byte-identical to a clean run with
nothing due**. No reading of that body could distinguish "nothing to do" from "the sweep never ran".
A failed SWEEP and a failed ITEM are different facts and now have different counters
(`sweepsFailed` vs `overdueErrors`).

## 4. Resilience is preserved — every loop still continues

No `try` was converted into a `throw` and no `continue` was removed. Each per-item catch carries a
comment saying so. The proof is Task 6's per-route survivor assertion, not this sentence.

## 5. The verification greps

```
$ cd apps/web
$ grep -n "filter(n => n > 0)" src/app/api/cron/purge-deleted/route.ts
(no match)

$ npx tsc --noEmit
(clean)

$ # PROBE — const __probe603: number = 'y'; appended to purge-deleted/route.ts
$ npx tsc --noEmit
src/app/api/cron/purge-deleted/route.ts(73,7): error TS2322: Type 'string' is not assignable to type 'number'.
$ # probe deleted, re-run clean. The gate is NOT blind.

$ grep -rn "success: true\|ok: true" src/app/api/cron/*/route.ts src/app/api/warmup/route.ts
src/app/api/cron/auto-close-tickets/route.ts:39      <- CLEAN route, genuinely-successful path
src/app/api/cron/auto-close-tickets/route.ts:64      <- CLEAN route, genuinely-successful path
src/app/api/cron/mark-overdue-invoices/route.ts:35   <- CLEAN route
src/app/api/warmup/route.ts:19                       <- CLEAN route, no catch at all
(+ 3 matches inside quick-603's own explanatory comments)
```

**Zero unconditional `success: true` / `ok: true` literals remain in any of the twelve fixed
routes.** The four that remain all belong to the three routes classified `CLEAN`, on paths that
genuinely cannot have failed — `auto-close-tickets` and `mark-overdue-invoices` both return 500 from
their catch, and `/api/warmup` has no catch.

```
$ node evidence/scripts/scan-logger-arity.mjs      # comment-stripped
scheduled-surface object-literal sites remaining: 0    (was 11)
```

## 6. A scanner correction made mid-task, and its re-verification

The scanner originally matched inside comments, so quick-603's own explanatory comments — which
quote the old broken calls verbatim — were counted as if they were code. `stripComments()` was
added, blanking `//` and `/* */` while preserving byte positions so line numbers stay correct.

**The pre-fix population was re-measured with the corrected scanner and is still 76.** No site in
the original population was ever a comment, so §3's headline number is unaffected.

```
$ git stash push -- apps/web/src && node scan-logger-arity.mjs   # HEAD, comment-stripped
files scanned: 1691
TOTAL logger.error calls: 610
OBJECT LITERAL in slot 2 (the defect): 76     <- unchanged
$ git stash pop
```

**One number DID move and is corrected here: the total is 610, not 621.** The grep-based 621
included **11 occurrences of the string `logger.error(` inside comments**. The honest denominator is
610, and the defect proportion is therefore **76 / 610 = 12.5%**, not 12.2%.
