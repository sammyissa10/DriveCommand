# quick-611 — the 17 `25P02` sites: 0 live, 16 dormant, 1 impossible

**Date:** 2026-09-15
**Target:** `drivecommand-staging` (`wyixpgunnjmzguhggocz`), `app_user`, tripwire armed.
**Production: never written, never connected to.**

**No application code was changed.** That is the result, not a gap — there was nothing live to fix,
and wrapping something in a transaction to make the finding true was out of bounds.

---

## 0. Staging at open

`current_user=app_user` · `rolbypassrls=false` · `tenant_context_required` present · the tripwire
branch live inside `current_tenant_id()` · 183 policies · PostgreSQL 17.6.

---

## 1. Per-site verdict

Method: `apps/web/scripts/audit/611-transaction-scope.ts` — AST over the TypeScript compiler API, no
Program, no type checker. A grep cannot answer a nesting question.

**The predicate:** is the swallowing `try` lexically inside a function expression passed **as an
argument** to a `$transaction(...)` call (its own transaction), or is its enclosing function called
from inside one (a caller's)? Anything else is autocommit and cannot cascade.

**`own tx?`** = the catch is inside a `$transaction` callback. **`wraps?`** = the try BLOCK contains
the `$transaction` call, i.e. the catch is its sibling.

| # | site | enclosing fn | own tx? | wraps? | callers in tx | **verdict** |
|---|---|---|---|---|---|---|
| W1 | `lib/carrier/fleet-drivers.ts:276` | `createCarrierDriver` | no | no | 0/1 | **DORMANT** |
| W2 | `lib/carrier/inspection-service.ts:703` | `overrideInspection` | no | no | 0/1 | **DORMANT** |
| W3 | `lib/carrier/trips.ts:786` | `transitionTripStatus` | no | no | 0/2 | **DORMANT** |
| R1 | `app/(owner)/actions/team-permissions.ts:152` | `inviteTeamMember` | no | no | 0/2 | **DORMANT** |
| R2 | `app/(owner)/carrier/fleet/drivers/[id]/compensation/page.tsx:21` | `DriverCompensationPage` | no | no | 0/0 | **DORMANT** |
| R3 | `app/(owner)/crm/[id]/page.tsx:39` | `CustomerDetailPage` | no | no | 0/0 | **DORMANT** |
| R4 | `app/(owner)/crm/page.tsx:19` | `CRMPage` | no | no | 0/0 | **DORMANT** |
| R5 | `app/(owner)/invoices/[id]/edit/page.tsx:18` | `EditInvoicePage` | no | no | 0/0 | **DORMANT** |
| R6 | `app/(owner)/invoices/[id]/page.tsx:52` | `InvoiceDetailPage` | no | no | 0/0 | **DORMANT** |
| R7 | `app/(owner)/invoices/new/page.tsx:20` | `NewInvoicePage` | no | no | 0/0 | **DORMANT** |
| R8 | `app/(owner)/loads/[id]/page.tsx:44` | `LoadDetailPage` | no | no | 0/0 | **DORMANT** |
| R9 | `app/(owner)/loads/page.tsx:18` | `LoadsPage` | no | no | 0/0 | **DORMANT** |
| R10 | `app/(owner)/payroll/[id]/edit/page.tsx:18` | `EditPayrollPage` | no | no | 0/0 | **DORMANT** |
| R11 | `app/api/driver-pay/settlements/[settlementId]/finalize/route.ts:74` | `POST` | no | no | 0/51 | **DORMANT** |
| R12 | `app/api/driver/gps-ping/route.ts:67` | `POST` | no | **YES** | 0/51 | **IMPOSSIBLE** |
| R13 | `lib/carrier/documents.ts:101` | `uploadDocument` | no | no | 0/1 | **DORMANT** |
| R14 | `lib/carrier/trips.ts:720` | `transitionTripStatus` | no | no | 0/2 | **DORMANT** |

The three WRITE sites' call chains were also read by hand, because a name-based caller search is the
audit's own stated method limit: `overrideInspection` ← `inspection-handlers.ts:598`;
`transitionTripStatus` ← `dispatches/[id]/status/route.ts:93` and `inspection-handlers.ts:573`;
`createCarrierDriver` ← `fleet/drivers/route.ts:68`; `uploadDocument` ← `documents/route.ts:42`.
**Every one of those files contains zero `$transaction`.** `0/51` on R11/R12 is the name-based search
matching every `POST` in the app — meaningless for a route handler, which has no in-repo callers at
all, and it does not affect the verdict.

### Three corrections to the source audit

1. **`api/driver/gps-ping/route.ts` is the SAFE shape and was counted as a risk.** The `try` wraps
   the whole `prisma.$transaction(...)` call — the catch is its **sibling**, not inside the callback.
   The transaction has already rolled back when the catch runs, and the write after it is a fresh
   `getTenantPrisma()` acquisition. **IMPOSSIBLE**, not merely dormant: wrapping the function cannot
   wake it; only restructuring it can. This was the brief's nominated "strongest live candidate".
2. **`team-permissions.ts` is under `app/(owner)/actions/`, not `lib/carrier/`.** That path does not
   exist. Line numbers had drifted generally, so the analyser re-resolves by nearest swallowing
   `try` rather than trusting the audit's line.
3. **`trips.ts:720` and `:786` sit inside `after(async () => {`** deferred callbacks — post-response,
   structurally outside any request transaction.

---

## 2. Live sites: NONE

Nothing qualifies, so there is nothing to report under "what the swallowed error currently costs" and
nothing to fix. **`createCarrierDriver` does not qualify** — the brief's expectation that it would is
the reversal worth stating plainly. Its comment (*"Non-fatal — driver record still valid, can be
linked later"*) is **true today**, and the data-loss scenario the source audit describes cannot
currently occur.

---

## 3. The cascade, proven on staging

With zero live sites there is no live path to force. Stopping there would have left the dormant
verdict resting on folklore, so the **mechanism** was measured instead — which is what the brief's
"a claim about PostgreSQL semantics is not the same as this codebase doing it" actually asks for.

`apps/web/scripts/audit/611-cascade-probe.ts`, real Prisma client via `getTenantPrismaForOrg`, real
`carrier_drivers` rows in the staging Alpha tenant, as `app_user` with the tripwire armed. The
failure is forced exactly as it would occur in production: set `userId` to a uuid that is not a
`User`, violating `carrier_drivers_user_id_fkey`. Three controls, because one proves nothing:

```
CONTROL A — TRUE POSITIVE — swallowed failure INSIDE the transaction callback
  shape              : tx.create -> try{ tx.update FAILS }catch{swallow} -> tx.create
  swallowed SQLSTATE : P2003
  later write        : FAILED 25P02
  EARLIER WRITE      : *** GONE ***
  MATCHED            : true

CONTROL B — FALSE POSITIVE — the try WRAPS the transaction (api/driver/gps-ping shape)
  shape              : create -> try{ $transaction{ update FAILS } }catch{swallow} -> create
  swallowed SQLSTATE : P2003
  later write        : SUCCEEDED
  EARLIER WRITE      : SURVIVED
  MATCHED            : true

CONTROL C — THE REMEDY — SAVEPOINT around the statement allowed to fail
  shape              : tx.create -> SAVEPOINT -> try{ tx.update FAILS }catch{swallow + ROLLBACK TO} -> tx.create
  swallowed SQLSTATE : P2003
  later write        : SUCCEEDED
  EARLIER WRITE      : SURVIVED
  MATCHED            : true

ALL THREE CONTROLS MATCHED EXPECTATION.
[611-cascade] teardown : deleted 4, left 0
```

**A** is the cascade, in this stack, with an earlier write destroyed — not a description of it.
**B** is what makes R12's IMPOSSIBLE verdict falsifiable: the same forced failure, the same tables,
and no cascade. **C** banks the remedy: the savepoint works through
`tx.$executeRawUnsafe('SAVEPOINT …')` / `ROLLBACK TO SAVEPOINT` on the same `tx`, with the catch
still swallowing. Prisma 7 has no `$savepoint()` API, so that needed measuring rather than assuming.

Teardown asserted its own landing — `deleted 4, left 0`. No pre-existing row was read or written.

---

## 4. Fixes applied: NONE

Correct outcome for a zero-live result. The prohibitions were explicit: do not remove a catch, do not
wrap anything new in a transaction to make the finding true. Both honoured.

---

## 5. Dormant sites — the waking condition

**One condition wakes all 16, and it is a single edit:**

> Wrap the function — or any caller of it, at any depth — in a `$transaction(async (tx) => …)`
> **and** have the swallowed statement run on that `tx`.

That is precisely what the `withTenantContext` migration would have done to 456 units, which is why
the source audit found these in the first place. It is also what a routine "make this atomic" change
does, which is the likelier trigger now.

**Per class, what wakes it and what it costs:**

| sites | waking condition | cost if woken |
|---|---|---|
| **W1** `createCarrierDriver` | wrap it or `POST /api/v1/carrier/fleet/drivers` | **the driver row itself is rolled back.** The owner is told a driver was created; it does not exist. The source comment asserting the opposite becomes false in the same edit. |
| **W2** `overrideInspection` | wrap it or `inspection-handlers.ts:598` | the override audit write fails, rolling back **the override itself** — the trip stays blocked and the DVIR history loses the reason. |
| **W3** `transitionTripStatus` | wrap it or `dispatches/[id]/status/route.ts:93` | the swallowed "auto-generate next dispatch failed" rolls back **the status transition that already succeeded**. Currently shielded twice: no transaction, and it is inside `after()`. |
| **R1–R11, R13–R14** (reads) | wrap the page/route/function | the fallback stops being a fallback. `catch { render empty }` is written to degrade one query; once the transaction is aborted every later query fails too, so "render partial" silently becomes "render empty". |
| **R12** `gps-ping` | **not wakeable by wrapping** — only by moving the catch inside the `$transaction` callback | — |

**Nothing here was fixed**, per the brief.

**The record is not prose — it is a gate.** `apps/web/tests/security/transaction-abort-sites.test.ts`
freezes all 17 verdicts and fails the moment one goes LIVE, in the same diff that changes it. Its
failure message carries the remedy and tells the reader not to delete the catch. It also carries a
**wider named negative**: no swallowing catch anywhere in `src` may sit inside a `$transaction`
callback — because the 17 were listed for a different question, and a site that is live today but was
never on that list would be invisible to a re-check of the 17 alone.

**Both assertions witnessed RED**, then reverted:

```
AssertionError: R13 (lib/carrier/documents.ts:101, uploadDocument) is now LIVE, expected DORMANT.
  reason: called from inside a $transaction callback at app/api/v1/carrier/documents/route.ts:42

AssertionError: a swallowing try/catch now sits inside a $transaction callback — see the remedy in
this file's header: expected [ Array(1) ] to deeply equal []
```

The first exercises the caller-chain branch, the second the own-transaction branch — different code
paths, so both needed witnessing.

### Why "0 live" is a measurement and not a broken walker

The repo-wide sweep found **no real hit anywhere on the tree**, so nothing in the codebase
demonstrates that the predicate can ever return true. With the failure mode of a source scan being
GREEN (quick-546), "0 live" would otherwise rest on an unexercised predicate. The **self-test** is
what closes that: it drives the predicate over a synthetic positive and a synthetic negative and
asserts **both** — the positive alone is satisfied by a predicate that says yes to everything, the
negative alone by one that says no to everything.

```
SELF-TEST  positive detected: true   negative rejected: true
files scanned            : 1692
$transaction callbacks   : 237   <- anti-vacuity counter
```

---

## 6. The count

| verdict | n | meaning |
|---|---|---|
| **LIVE** | **0** | inside a transaction today — would cascade now |
| **DORMANT** | **16** | no enclosing transaction today; one wrapping edit away |
| **IMPOSSIBLE** | **1** | R12 — the catch is the transaction's sibling; cannot be woken by wrapping |
| reclassified from the audit's implied "all 17 at risk" | **17** | all of them: the audit's risk was conditional on a migration that is not happening |

---

## 7. Gates

| gate | result |
|---|---|
| `npx tsc --noEmit` | **clean**, and **PROBED** — injected `const x: number = 'y'` reported as `TS2322` in the file edited, then removed |
| `npm run build` | see §closing |
| new guard | 6/6, both assertions witnessed RED |
| vitest failing-FILE set | see §closing |

---

## 8. What remains before the `app_user` cutover

| # | item | status | changed by 611? |
|---|---|---|---|
| 1 | **`AutomationRule` DELETE split** | OPEN. `WITH CHECK` closed INSERT/UPDATE on staging (quick-599) and **cannot reach DELETE**, which is checked against `USING` alone — 6 SYSTEM rows still deletable by a tenant-scoped connection. Fix is a four-policy command split, named not built. Production PENDING even for the INSERT/UPDATE half. | no |
| 2 | **The 17 `25P02` sites** | **CLOSED as a cutover blocker.** 0 live; the risk is future-tense and now gated. The 16 dormant remain dormant **by condition, not by luck** — the gate is what keeps them that way. | **yes — this task** |
| 3 | **`app_admin` LOGIN on production** | OPEN. The role is created `NOLOGIN`; LOGIN + password are granted out of band and were minted for staging only. **Not re-verified live — production was never connected to.** | no |
| 4 | **The bypass policy drop** | OPEN and not begun. 86 `bypass_rls_policy` rows on staging; none dropped. | no |

**Newly found:** nothing beyond the three audit corrections in §1. Notably **no live site anywhere on
the tree** — the repo-wide sweep looked past the 17 and found none.

---

## 9. Artefacts

| file | what |
|---|---|
| `apps/web/scripts/audit/611-transaction-scope.ts` | the AST analyser, with the self-test and the repo-wide sweep |
| `apps/web/scripts/audit/611-cascade-probe.ts` | the three staging controls, disposable rows, asserted teardown |
| `apps/web/tests/security/transaction-abort-sites.test.ts` | the gate |
| `evidence/01-site-scope.{json,txt}` | the 17 verdicts |
| `evidence/02-cascade-controls.json` | controls A / B / C |
| `evidence/00-suite-before.json` | the baseline |
