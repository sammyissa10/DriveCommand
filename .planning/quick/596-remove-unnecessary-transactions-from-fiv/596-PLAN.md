# Quick 596 — Remove unnecessary transactions from five shared helpers

**Date:** 2026-09-12
**Input:** `docs/audits/wrapper-migration-scope.md` group 1b
**Target:** application code only. No migrations, no DB writes, no production access.

---

## The premise changed under investigation

The brief (and the scope audit) assumed these five helpers open transactions for
**write atomicity**, and that `getCurrentUser` "does not need its transaction at all".

Reading all five: **every transaction in all five files is paired 1:1 with a
`set_config('app.bypass_rls', 'on', TRUE)`.** 18 transactions, 18 bypass calls, across the
five files. The transaction is not an atomicity wrapper — it is the **scoping mechanism for
an RLS bypass**. `TRUE` means transaction-local, so the transaction is what stops the bypass
leaking; without it, a bare `set_config(..., TRUE)` in autocommit applies only to its own
statement and the following query is not bypassed at all.

This inverts the remedy the brief prescribes. "Accept an optional client parameter defaulting
to the current one, so a caller already inside a transaction passes theirs" is **unsafe for
this pattern**: setting `app.bypass_rls = on` transaction-locally on the *caller's*
transaction leaves it on for the remainder of the caller's entire unit of work. Under
`withTenantContext` that is every subsequent query in the request. A deadlock is loud; a
silent RLS bypass across a whole unit of work is the exact failure class this migration
exists to prevent.

So the classification below turns on a different question than the brief anticipated:
**is the bypass actually needed for this table?** That is answerable from the catalog, and
it was answered read-only (no writes, staging only).

---

## Evidence — RLS state of each table touched (read from `pg_class` / `information_schema`)

| table | RLS enabled | forced | policies | `app_user` grants |
|---|---|---|---|---|
| `NotificationEmailConfig` | **false** | false | **0** | SELECT |
| `PushToken` | true | true | 3 | full DML |
| `ActivationProgress` | true | true | 2 | full DML |
| `AppEvent` | true | true | 2 | full DML |
| `PlaybookInstance` | true | true | 2 | full DML |
| `User` | true | true | 2 | full DML |

`PushToken`'s isolation policy is
`USING ("userId"::text = current_setting('app.current_user_id', true))`, and **nothing in this
repo ever sets `app.current_user_id`** — the only occurrence is a comment in
`lib/auth/mobile-auth.ts:21` noting it is not set from the HTTP context. That policy can
therefore never pass, so the bypass is the only thing that makes the query return rows.

---

## Classification

| # | helper | verdict | reason |
|---|---|---|---|
| 1 | `resolveSenderConfig` | **UNNECESSARY** | bypass is a **no-op** — RLS is disabled on `NotificationEmailConfig` and `app_user` holds a plain SELECT grant. Remove the transaction. |
| 2 | `getCurrentUser` | **NECESSARY** (bypass-scoping) | `User` is FORCE-RLS. Bootstrap path has no tenant GUC, so the bypass is required and must stay scoped. |
| 3 | `sendPushToUser` | **NECESSARY** (bypass-scoping) | `PushToken`'s user policy is dead (`app.current_user_id` never set). Without the bypass the query returns zero tokens and no push is ever sent. |
| 4 | `recordActivationEvent` | **NECESSARY** (bypass **and** genuine atomicity) | FORCE-RLS on `ActivationProgress` + `AppEvent`, called from sessionless contexts; and its writes have a real atomicity requirement (below). |
| 5 | `sendInstanceBlocked` | **NECESSARY** (bypass-scoping) | `PlaybookInstance` is FORCE-RLS; the caller may be a sessionless workflow event. Read-only, but the read returns nothing without the bypass. |

### What breaks if `recordActivationEvent`'s writes are not atomic

It performs `activationProgress.update` (sets the step timestamp **and** recomputes
`completionPct`), then `appEvent.create` for that step, then conditionally a second
`appEvent.create` for `tenant.activated`. The function is **idempotent by field** — it only
writes each timestamp once. So a partial failure between the progress update and the event
insert leaves `completionPct` advanced with **no event recorded**, and because the field is
now set, a retry takes the idempotent early-exit and never writes the missing event. The
activation funnel loses that step permanently, and `tenant.activated` can fire against a
progress row whose events do not add up. That is unrecoverable without a manual backfill,
which is why the atomicity here is load-bearing and the transaction stays.

---

## Tasks

**Task 1 — remove the no-op transaction from `resolveSenderConfig`.**
Replace the `prisma.$transaction(async tx => { set_config bypass; findFirst })` with a plain
`prisma.notificationEmailConfig.findFirst(...)`. Keep the surrounding try/catch, the
field-by-field env fallback, and the 60s cache exactly as they are. Update the `@bypass_rls`
comment to record why the bypass was removed rather than deleting the reasoning.

**Task 2 — record the four NECESSARY helpers in place.**
Add a short header note to each of the four explaining that the transaction is a bypass scope,
not an atomicity wrapper, and that it must not be replaced by an optional-client parameter
that sets the bypass on a caller's transaction. This is the enforcement mechanism against the
next task re-deriving the wrong conclusion — the previous audits show comments asserting an
invariant are not enough on their own, so the note states the failure mode concretely.

**Task 3 — re-run the call-graph analysis and report the new group 1b count.**

---

## Verification gates

- `npx vitest run` — before and after, measured the same way, same reporter.
- `npx tsc --noEmit` clean, **probed with a deliberate type error** to prove the gate is live.
- `npm run build` succeeds.
- Call-graph re-run: report new 1b count against the previous 64.

## Out of scope / reported, not built

The four NECESSARY helpers cannot be fixed without a decision that is above this task:
either a **privileged second connection** (`PRIVILEGED_DATABASE_URL`, already recommended in
`docs/audits/bypass-call-classification.md`) so bypass work never touches the caller's
transaction, or **per-table policy work** so the bypass is not needed at all. Both are
recorded in the summary as the follow-up.
