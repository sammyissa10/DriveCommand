# Quick 596 — Summary

**Date:** 2026-09-12
**One-liner:** One of the five helpers had a transaction worth removing; the other four turned out
to be RLS-bypass scopes, not atomicity wrappers, and the remedy the brief prescribed would have
leaked the bypass across a caller's whole unit of work. Group 1b: **64 → 57**.

---

## 1. The premise did not survive contact

The brief and `wrapper-migration-scope.md` §1b both assumed these five open transactions for **write
atomicity**, and that `getCurrentUser` "does not need its transaction at all".

Counted across the five files: **18 `$transaction` calls, 18 `set_config('app.bypass_rls','on',TRUE)`
calls — paired 1:1.** Not one of them is an atomicity wrapper. The transaction is the *scoping
mechanism* for an RLS bypass: `TRUE` is transaction-local, so without a transaction a bare
`set_config(..., TRUE)` in autocommit applies only to its own statement and the following query is
not bypassed at all.

That inverts the prescribed remedy. "Accept an optional client parameter defaulting to the current
one, so a caller already inside a transaction passes theirs" is **unsafe here**: setting
`app.bypass_rls = on` on the *caller's* transaction leaves it on for the remainder of that caller's
entire unit of work. Under `withTenantContext` that is every subsequent query in the request. A
deadlock is loud and fails closed; a silent RLS bypass across a whole unit of work fails open, and is
the exact failure class the migration exists to prevent. It was not built.

## 2. Evidence — RLS state of every table involved

Read from `pg_class` / `information_schema` on staging, read-only (no writes, no production):

| table | RLS enabled | forced | policies | `app_user` grants |
|---|---|---|---|---|
| `NotificationEmailConfig` | **false** | false | **0** | SELECT |
| `PushToken` | true | true | 3 | full DML |
| `ActivationProgress` | true | true | 2 | full DML |
| `AppEvent` | true | true | 2 | full DML |
| `PlaybookInstance` | true | true | 2 | full DML |
| `User` | true | true | 2 | full DML |

`PushToken`'s isolation policy is `USING ("userId"::text = current_setting('app.current_user_id', true))`
and **nothing in this repo ever sets `app.current_user_id`** — the sole occurrence is a comment at
`lib/auth/mobile-auth.ts:21` saying it is *not* set from the HTTP context. That policy can never pass.

## 3. Classification

| # | helper | verdict | evidence |
|---|---|---|---|
| 1 | `resolveSenderConfig` | **UNNECESSARY — removed** | the bypass is a **no-op**: RLS disabled on `NotificationEmailConfig`, zero policies, plain `GRANT SELECT` to `app_user` |
| 2 | `getCurrentUser` | **NECESSARY** (bypass scope) | `User` is FORCE-RLS; the bootstrap read runs before any tenant GUC exists |
| 3 | `sendPushToUser` | **NECESSARY** (bypass scope) | `PushToken`'s user policy is dead; without the bypass the read returns zero tokens and every push silently stops |
| 4 | `recordActivationEvent` | **NECESSARY** (bypass **and** real atomicity) | FORCE-RLS on two tables, sessionless callers, plus the atomicity argument below |
| 5 | `sendInstanceBlocked` | **NECESSARY** (bypass scope) | `PlaybookInstance` is FORCE-RLS; without the bypass the read returns null and no dispatcher is told a driver is blocked |

Code quoted for each in `596-PLAN.md`; the reasoning is now also written into each of the four files
as a header note, because the previous audits (quick-547, quick-548) showed a design comment that
merely *asserts* an invariant is not enough — these notes name the concrete failure mode instead.

### What breaks if `recordActivationEvent`'s writes are not atomic

It runs `activationProgress.update` (sets a step timestamp **and** recomputes `completionPct`), then
`appEvent.create` for that step, then conditionally `appEvent.create` for `tenant.activated`. The
function is **idempotent by field** — each timestamp is written once. So a partial failure between the
update and the event insert leaves `completionPct` advanced with **no event recorded**, and the retry
takes the idempotent early-exit and never writes the missing event. The activation funnel loses that
step permanently, and `tenant.activated` can fire against a progress row whose events do not add up.
Only a manual backfill recovers it. That is why the transaction stays.

## 4. What changed

- `src/lib/email/sender-config.ts` — `$transaction` + bypass replaced by a direct
  `prisma.notificationEmailConfig.findFirst`. Cache, try/catch and field-by-field env fallback
  untouched. Comment records why the bypass went and that reinstating a transaction is the wrong fix
  if the table ever gains RLS.
- Four header notes: `lib/auth/supabase.ts`, `lib/notifications/send-push.ts`,
  `lib/onboarding/activation-tracker.ts`, `server/services/workflows/notifications.ts`.
- `src/lib/email/__tests__/transport.test.ts` — three mocks updated from the `$transaction`-and-`tx`
  shape to the direct client. **Assertions unchanged**; only the double's shape moved. This was caught
  by the test suite, not assumed: the first post-change run failed
  `resolveSenderConfig prefers the database row over env` with `expected 'env' to be 'database'`,
  because the mock supplied `notificationEmailConfig` on the tx object only.

**No call site was changed.** `tenant-context.ts`, the RLS extension and every policy are untouched.

## 5. Group 1b: 64 → 57, a reduction of 7 (not 14)

Re-ran the scope audit's call-graph analysis. `resolveSenderConfig` went 14 → 0 as a resolver, but
the total fell by only 7, because the BFS attributes each unit to the *first* resolver it reaches and
**seven of those fourteen units have a second path to a transaction**:

| | left group 1b entirely (7) | still in 1b, now via `sendPushToUser` (7) |
|---|---|---|
| | `lib/carrier/notifications.ts` ×4 (237, 480, 569, 973) | `(owner)/actions/load-driver-assignments.ts:168` |
| | `lib/carrier/pay-calculator.ts:61` | `(owner)/actions/team-permissions.ts:120` |
| | `lib/email/send-fleet-message-notifications.ts:52, :125` | `api/cron/trip-reminders/route.ts:58` |
| | | `lib/carrier/fleet-drivers.ts:223, :437` |
| | | `lib/carrier/inspection-service.ts:576` |
| | | `lib/document-import/persistence.ts:394` |

**Remaining balance of the 57:** `sendPushToUser` 20 · `getCurrentUser` 9 · `recordActivationEvent` 5
· `sendInstanceBlocked` 5 · `saveRouteTemplateCore` 4 · `generatePlaybookInstance` 3 ·
`getTicketById`/`persistStops`/`loadStepInstance` 2 each · five more at 1 each.

`sendPushToUser` is now the single largest resolver at 20 units — it absorbed the seven — so it is the
next highest-leverage target, and it is the one that cannot be fixed without either repairing the dead
`PushToken` policy or moving to a privileged connection.

## 6. Verification

| gate | result |
|---|---|
| `npx vitest run` BEFORE (edits stashed) | tests=1967 passed=1838 failed=64 pending=62 |
| `npx vitest run` AFTER | tests=1967 passed=1838 failed=64 pending=62 — **identical** |
| newly failing files | 1 — `document-import-commit-rollback.test.ts`, **passes 9/9 in isolation in 94s**; a real-DB timing flake (quick-549 class), touches nothing changed here |
| `npx tsc --noEmit` | **0 errors**, gate proven live with a deliberate probe (`__probe.ts` reported TS2322, nothing else), probe deleted |
| `npm run build` | ✓ Compiled successfully in 74s, 229/229 static pages, **exit 0** |

Both test runs used the same reporter (`--reporter=json`) and the baseline was measured with the edits
**stashed** in the main tree, not inherited from a prior summary and not a worktree (which would lack
`.env.local`). An earlier baseline was discarded: it had been started before the edits and was still
running while files changed — the quick-565 contamination trap.

## 7. Follow-up — reported, not built

The four NECESSARY helpers need a decision above this task:

1. **A privileged second connection** (`PRIVILEGED_DATABASE_URL`), already the recommendation in
   `docs/audits/bypass-call-classification.md`. Bypass work would run on its own pool, never touching
   the caller's transaction — this closes all four at once and is the only option that also closes
   `sendPushToUser`.
2. **Per-table policy work** so the bypass is not needed: repairing `PushToken`'s dead
   `app.current_user_id` policy would remove the largest resolver's need for a bypass entirely.

`PushToken`'s policy being unsatisfiable is worth raising on its own account, independently of this
migration: it means the table's RLS provides no isolation today and is held up entirely by the
bypass every reader already sets.
