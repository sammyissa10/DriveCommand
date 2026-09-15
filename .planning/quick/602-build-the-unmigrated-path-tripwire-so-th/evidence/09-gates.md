# quick-602 — closing gates

## 1. `npx tsc --noEmit` in `apps/web` — and it WAS lying on the first run

First run, immediately after the step-4e dev server was killed:

```
.next/dev/types/routes.d.ts(518,26): error TS1005: ';' expected.
.next/dev/types/routes.d.ts(519,4): error TS1109: Expression expected.
.next/dev/types/routes.d.ts(528,1): error TS1160: Unterminated template literal.
.next/dev/types/validator.ts(4123,1): error TS1128: Declaration or statement expected.
tsc exit=2
```

**Every error is a SYNTAX error and every one is inside `.next/`, so the gate was BLIND, not green** —
exactly the CLAUDE.md trap, hit here because killing `next dev` left two generated files truncated
mid-write. Remedy applied: delete `.next/dev/types/validator.ts`, `.next/dev/types/routes.d.ts` and
`tsconfig.tsbuildinfo`, then re-run.

```
tsc exit=0
```

**The probe, because a clean run is not evidence on its own.** `const __x602: number = 'y';` was
appended to `scripts/audit/602-execution-sweep.ts` — a file this task actually wrote:

```
scripts/audit/602-execution-sweep.ts(708,7): error TS2322: Type 'string' is not assignable to type 'number'.
tsc exit=2
```

tsc reported THAT error, so semantic checking really is running over this task's files. Probe removed
and re-confirmed:

```
tsc exit=0
```

No `__probe*` file and no `__x602` reference survives anywhere in `src`, `scripts` or `tests`
(`find` + `grep`, both empty), and `git status` is clean apart from intended files.

## 2. The full vitest suite, before and after, SAME reporter (`--reporter=default`)

The "before" was created in the MAIN tree — `git checkout 24624120 -- <touched files>` plus removal
of the files this task added — **not** a `git worktree`, which does not carry the gitignored
`apps/web/.env.local` and skews DB-dependent tests (quick-567). `next dev` was stopped first.

| run | Test Files | Tests |
|---|---|---|
| BEFORE (base `24624120`) | 19 failed \| 139 passed \| 6 skipped (**164**) | 64 failed \| 1856 passed \| 56 skipped \| 3 todo (**1979**) |
| AFTER (this task) | 18 failed \| 141 passed \| 6 skipped (**165**) | 64 failed \| 1871 passed \| 52 skipped \| 3 todo (**1990**) |

**Delta: +1 file, +11 tests — exactly the 11 tests in
`tests/security/wrapper-migration-countdown.test.ts`.** `1990 − 1979 = 11`.

**Failures are unchanged at 64 in both runs**, and the failing-FILE lists were diffed rather than
compared by count. The only difference:

```
< FAIL tests/carrier/driver-incident-report-persists.test.ts      (base run)
```

That file failed in the base run and passed in the after run. It is a **real-Postgres** test against
staging, i.e. the cold-cache flake class quick-549 documented; it is not touched by this task. Its
flip also explains the other two numbers: a file that fails early skips its remaining tests, so
`passed +15 / skipped −4` = 11 new tests + 4 that stopped being skipped.

All 64 failures are pre-existing and are the same set in both runs.

## 3. The body-level drift gate, re-run against staging after every commit

```
  Policies live            : 183
  Missing (expected−live)  : 0
  Unexpected (live−expect) : 0
  Canonical artefact hash  : aaf0f4d2845d1f408968981d2f1d363a8b5b3c27f15ddde6c1859fdb366e82cd
  Corpus hash (from disk)  : aaf0f4d2845d1f408968981d2f1d363a8b5b3c27f15ddde6c1859fdb366e82cd
  Policies compared        : 183
  Definition drift         : 0
  NOT CANONICALISED (live, no canonical entry — body unchecked): none

RESULT: CLEAN (exit 0) — repo and database agree on policy NAMES and BODIES.
```

## 4. PRODUCTION, read-only, field by field at close

```
policies: 183
policy Tag.tenant_isolation_policy           USING (("tenantId")::text = current_setting('app.current_tenant_id'::text, true))
policy TagAssignment.tenant_isolation_policy USING (("tenantId")::text = current_setting('app.current_tenant_id'::text, true))
current_tenant_id(): CREATE OR REPLACE FUNCTION public.current_tenant_id() RETURNS uuid LANGUAGE sql STABLE
                     AS $function$ SELECT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID; $function$
tenant_context_required present: 0
ledger head: 20260914170000_activation_progress_congrats_shown_at
pg_db_role_setting app_user: {idle_in_transaction_session_timeout=30s}
pg_stat_activity app_user connections: 0
```

Classification at close, from `evidence/12-close-survey.md`: **production 91 / 2 / 86 / 4 = 183**,
unchanged from `01-baseline`. During the step-4e HTTP pass, production's `app_user` connection count
was **0 at every one of the three readings** (`11-execution-http.md`, guard 2).

## 5. STAGING, left clean

```
RLS602 fixtures: {"tenants":0,"tags":0,"events":0}
tripwire_probe_602* tables: {"n":0}
probe_* functions: {"n":0}
bypass_rls_policy tables (sorted list, 86): ActivationProgress,AppEvent,AutomationRule,AutomationRun,
  Customer,CustomerInteraction,DispatchOverrideAudit,DocFeedback,Document,DriverHOSEntry,DriverIncident,
  DriverInvitation,DriverRouteJoin,ExpenseCategory,ExpenseTemplate,ExpenseTemplateItem,FleetMessage,
  FuelRecord,GPSLocation,Invoice,InvoiceItem,Load,MaintenanceEvent,NotificationLog,NotificationSendLog,… (86)
pg_db_role_setting app_user: {idle_in_transaction_session_timeout=30s}   <- byte-identical to 01-baseline
fresh app_user connection reads the tripwire flag as: null               <- FLAG OFF
```

Staging classification at close: **93 / 0 / 86 / 4 = 183**, ledger head
`20260914180000_tenant_context_tripwire`. The execution sweep's row-count snapshot over 16 tables
reported **no change** on any of them.
