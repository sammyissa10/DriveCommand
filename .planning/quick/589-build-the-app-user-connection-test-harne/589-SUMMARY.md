---
phase: quick-589
plan: 01
subsystem: carrier-rls-diagnostics
tags: [app_user, rls, diagnostics, harness, cutover-readiness]
dependency-graph:
  requires: [quick-582, quick-588]
  provides: [apps/web/scripts/audit/app-user-connection-harness.ts, apps/web/scripts/audit/app-user-harness-targets.ts, "npm run audit:app-user-harness"]
  affects: []
tech-stack:
  added: []
  patterns: ["pg.Client (never Pool) for GUC-safety", "oid-based catalogue resolution", "BEGIN/ROLLBACK write guard with in-transaction assertion"]
key-files:
  created:
    - apps/web/scripts/audit/app-user-harness-targets.ts
    - apps/web/scripts/audit/app-user-connection-harness.ts
  modified:
    - apps/web/package.json
    - apps/web/.env.example
decisions: []
metrics:
  duration: "~1 session"
  completed: 2026-09-03
---

# Phase quick-589: Build the app_user Connection Test Harness Summary

Built a read-only diagnostic harness that connects to Postgres AS the
`app_user` role and measures — rather than infers from a catalogue read
through a BYPASSRLS connection — what that role can actually see and do.
**The harness was gate-tested, not run against a real `app_user` connection.**
No credential exists in this project, so quick-582's grant/RLS/policy
predictions and quick-588's "zero fail-closed access paths" claim both
remain **PREDICTIONS**, unchanged by this task. This task delivers the
instrument; it does not perform the measurement.

## 1. Step-1 credential finding, as delivered

No credential exists anywhere in the project. Confirmed by grepping all four
env files this repo loads (`apps/web/.env.local`, `apps/web/.env`,
repo-root `.env`, repo-root `.env.local`) for `DATABASE_URL_APP_USER` —
zero matches in any of them.

- **What exists:** the `app_user` Postgres ROLE itself, correctly postured
  (`rolcanlogin=true`, `rolbypassrls=false`, `rolsuper=false`, no
  memberships) — this was independently re-confirmed by the harness's own
  gate logic, which refuses to proceed if `rolbypassrls` is ever `true`.
- **What is missing:** only the role's **password**.
- **Exactly where it goes:** `DATABASE_URL_APP_USER` in `apps/web/.env.local`.
- **Both connection-string shapes** (documented in the harness's
  not-configured message and in `apps/web/.env.example`):
  - Session Pooler (port 6543 — what the deployed app actually connects
    through): `postgresql://app_user.[ref]:[pass]@aws-1-[region].pooler.supabase.com:6543/postgres`
  - Direct (port 5432 — reachable from a developer machine):
    `postgresql://app_user:[pass]@db.[ref].supabase.co:5432/postgres`
- **The pooler username-format gotcha:** Supavisor requires the
  `<role>.<project_ref>` form — `app_user.oqdhberkghtnszrkdvfm`, not bare
  `app_user`. A bare username fails authentication on the pooler. The
  direct-connection form is the opposite: it uses the bare role name with
  no project-ref suffix. quick-410's earlier suggested string omitted the
  project ref and would have failed.
- **The 6543-vs-5432 reachability caveat:** port 6543 (the Session Pooler,
  what the deployed app runs on) is generally not reachable from a
  developer machine — this is why `_bootstrap-env.ts` already repoints
  `DATABASE_URL` at `DIRECT_URL` (5432) for every other script in this
  directory. A harness run through 5432 direct will connect successfully
  but will **not** reproduce Session Pooler connection reuse — which is the
  exact mechanism behind the explicit-GUC-clear requirement the harness
  mirrors (fact 7 of the plan: the pooler does not run `DISCARD ALL`
  between client sessions, so a fresh `Client()` can inherit a stale GUC).
  The harness prints this as a loud, explicit fidelity caveat any time it
  connects on a port other than 6543, both to the console and into the
  written report — it is not a footnote.

**No credential was created.** That is the correct outcome per the plan's
explicit instruction; issuing the password is out of band and not part of
this task.

## 2. Was the harness RUN?

**Gate-tested only — not run against a real `app_user` connection.** There
is no credential to run it against. The harness was executed twice:

1. Once to prove the credential gate fires correctly (captured verbatim
   below).
2. It was never executed past that gate, because `DATABASE_URL_APP_USER` is
   absent everywhere in the project (confirmed by grep, §1 above).

## 3. Behaviour table / reconciliation / cross-tenant findings

**Not applicable.** Suites 2 through 6 (tenant fixtures, class-(b)+control
5-probe reads/writes, all 12 defect-class tables, the six quick-588
transaction roots, cross-tenant isolation) never ran. No behaviour table
exists to report. No reconciliation against quick-582's predictions was
possible. No cross-tenant read was found or ruled out — the question is
simply unanswered by this task.

## 4. What steps 3-7 produced

**Nothing.** Steps 3 through 7 (all six probe suites plus the reconciliation
report) produced **zero measurements** and wrote **no report file** —
confirmed: `docs/diagnostics/app-user-connection-harness.md` does not exist
after either run. quick-582's and quick-588's findings therefore remain
exactly what they were before this task: predictions derived from a
catalogue read through a BYPASSRLS (`postgres`) connection, never yet
exercised as `app_user`.

**The harness is delivered ready to run.** The moment
`DATABASE_URL_APP_USER` is set in `apps/web/.env.local` with a real
password, `npm run audit:app-user-harness` (from `apps/web/`) will:
connect as `app_user`; refuse to proceed if that role somehow has
`rolbypassrls=true`; print a connection-fidelity report (host/port,
`current_user`, `inet_server_addr/port`, and a loud caveat if not on 6543);
discover live RLS/FORCE/policy/grant state for every table in scope by
`pg_class.oid` (never a cached prediction, never a string cast to
`regclass`); run the class-(b) + `facilities`-control 5-probe suite (read
as tenant A, read as tenant B, read with GUC explicitly cleared, an INSERT
inside `BEGIN`/`ROLLBACK`, an UPDATE inside `BEGIN`/`ROLLBACK` matching zero
rows by design); read all 12 defect-class tables; walk the six quick-588
transaction roots (anchor table count, then each nested table's count
joined to `dispatches` through its real foreign key); run the pass/fail
cross-tenant leak check over every policy-bearing, tenant-column-resolvable
table; and write a full markdown reconciliation report to
`docs/diagnostics/app-user-connection-harness.md`, naming every divergence
from quick-582 and every probe that could not be run.

## 5. What could not be tested, and why

Everything downstream of the credential gate — by construction, not by
choice. Nothing else was skipped: every piece of code required by the plan
(targets module, credential gate, GUC mirror, oid-based discovery,
`probeRead`, `withRollback`, all six suites, the reconciliation report
writer, the npm entry point, the `.env.example` documentation) was written,
typechecks, and was exercised as far as it can be without a live `app_user`
session. The single blocking input, stated once and precisely: an
`app_user` password, set as `DATABASE_URL_APP_USER` in
`apps/web/.env.local`, in either of the two forms documented in §1.

One thing worth naming about the harness's own write-probe logic, since it
could not be exercised: `buildMinimalRow` (suite 3, probes 4-5) resolves
required NOT NULL columns for `stops` / `route_template_stops` /
`carrier_documents` by reading real foreign-key rows and
`pg_get_constraintdef`-parsed CHECK enums live from the catalogue at run
time — it never hardcodes a legal value from memory (including from this
project's own CLAUDE.md, which documents these CHECK constraints as
historically drifting from the app's assumed vocabulary). Any column it
cannot resolve deterministically is refused and reported by name as
`skipped`, per the plan's explicit "do not guess" rule. This logic has
never executed against the live database and its correctness is therefore
unverified beyond typechecking and code review.

## 6. Both tsc runs

**Probe run (red) — confirms the gate is live, not blind:**

```
scripts/audit/app-user-connection-harness.ts(3,7): error TS2322: Type 'string' is not assignable to type 'number'.
[exited with code 2]
```

Injected `const __probe: number = 'y';` as the first statement after the
`_bootstrap-env` import in `app-user-connection-harness.ts` (the file
actually edited by this task), ran `npx tsc --noEmit` from `apps/web/`, and
confirmed the reported error names that exact injected line — not a syntax
error, not an error in `.next/` or an untouched file. `tsconfig.tsbuildinfo`
and `.next/dev/types/validator.ts` were cleared first (neither was present).

**Clean run, after deleting the probe:**

```
[exited with code 0]
```

Zero errors. `git diff apps/web/scripts/audit/app-user-connection-harness.ts`
after removing the probe line showed no diff against the committed version —
the probe left no trace. No stray `__probe.ts` was found in
`apps/web/scripts/` or `apps/web/src/lib/document-import/` either before or
after.

## Path corrections carried forward (fact 2 of the plan)

The brief's file list was wrong for two of the six quick-588 transaction
roots. Recorded here, and in `app-user-harness-targets.ts`'s header comment,
so the next task does not re-inherit the wrong paths:

- `apps/web/src/lib/carrier/driver-routes.ts` **does not exist**. The real
  file is `apps/web/src/app/(driver)/actions/driver-routes.ts`
  (`getMyActiveDispatch`, `getMyDispatchHistory` — two of the six roots).
- `apps/web/src/lib/carrier/driver-load.ts` **does not exist**. The real
  file is `apps/web/src/app/(driver)/actions/driver-load.ts` (`getMyLoads`).
- Confirmed present as given:
  `apps/web/src/app/api/mobile/carrier/driver/dispatches/route.ts`,
  `apps/web/src/app/api/mobile/carrier/driver/dispatches/[id]/route.ts`,
  `apps/web/src/app/(owner)/carrier/stops/[id]/page.tsx`.

## What was built

- **`apps/web/scripts/audit/app-user-harness-targets.ts`** — pure data, no
  I/O. Quick-582's predicted classes (a/b/c) plus the `facilities` control,
  and the six `TRANSACTION_ROOTS` with physical table names resolved from
  `schema.prisma`'s `@@map` directives (cited, not guessed): `CarrierDriver`
  → `carrier_drivers`, `Trip` → `dispatches`, `CarrierLoad` → `loads`,
  `CarrierStop` → `stops`, `CarrierDocument` → `carrier_documents`,
  `CarrierExpense` → `carrier_expenses`. Header comment states explicitly
  that every list is a prediction, never an assertion.
- **`apps/web/scripts/audit/app-user-connection-harness.ts`** (~1040 lines)
  — the harness itself:
  - Credential gate (`DATABASE_URL_APP_USER` absent → exit 1, no results, no
    report file; `DATABASE_URL` absent → same, separate message).
  - Two independent `pg.Client` instances (never a `Pool`, matching
    `verify-app-user-role.ts`'s reasoning about GUC bleed).
  - Connection fidelity report: `current_user`, `inet_server_addr/port`,
    configured host/port, a loud fidelity caveat when not on 6543, and a
    hard refusal (`process.exit(1)`) if `rolbypassrls` is ever `true`.
  - `setTenantGuc` mirroring `getTenantPrisma()`/`getTenantPrismaForOrg()`
    verbatim: `set_config('app.current_tenant_id', $1, false)` — session
    scope, never the transaction-scope `TRUE` variant `tenantRawQuery` uses.
  - Runtime discovery by `pg_class.oid` (never `regclass` string-casting):
    `relrowsecurity`, `relforcerowsecurity`, live `pg_policy` count,
    `has_table_privilege` for all four DML verbs, and a tenant-column probe
    over `tenantId | tenant_id | orgId | org_id` — tables with none are
    recorded as `NOT_ISOLATION_TESTABLE`, never silently skipped. (This
    matters concretely: `stops`, `route_template_stops` and
    `carrier_documents` themselves carry no tenant column at all — they are
    scoped only through their `dispatch_id`/`facility_id` foreign keys —
    which the runtime discovery will surface rather than assume.)
  - `probeRead` — a classifying read that returns `rows | empty | error`,
    never swallowing a permission error.
  - `withRollback` — the sole DML path: `BEGIN`, an in-transaction guard
    (`now() < statement_timestamp()`, run as two separate awaited queries
    rather than one multi-statement string, since node-postgres's handling
    of the latter is not something to depend on for a safety guard), the
    caller's write, `ROLLBACK` unconditionally in a `finally`. Zero `commit`
    statements in the file (grep-verified both in the file's own comments —
    deliberately lower-cased so the documentation doesn't trip its own
    check — and in the executable SQL).
  - Suites 2-7: tenant fixtures; class-(b) + `facilities`-control 5-probe
    reads/writes with live-catalogue-driven row construction; all 12
    defect-class tables; the six transaction roots (anchor count, then each
    nested table joined to `dispatches` via its real, `information_schema`-
    resolved foreign key); cross-tenant leak detection (`IS DISTINCT FROM`
    tenant A, the only pass/fail suite, sets the process exit code); and a
    markdown reconciliation report, written to
    `docs/diagnostics/app-user-connection-harness.md` only on a real run.
- **`apps/web/package.json`** — added
  `"audit:app-user-harness": "tsx scripts/audit/app-user-connection-harness.ts"`.
- **`apps/web/.env.example`** — added a placeholder-only
  `DATABASE_URL_APP_USER` block documenting both connection forms, the
  pooler suffix requirement, and that the app itself never reads this
  variable.

## Deviations from Plan

None — the plan executed as written. The only judgement calls made were
implementation details left open by the plan: local identifier quoting
(pure JS double-quote escaping of catalogue-resolved names, rather than a
server round-trip through `quote_ident`) and the write-probe row-builder's
specific fallback ladder (real FK row → parsed CHECK enum → arbitrary value
for an otherwise-unconstrained scalar → refuse with a named reason). Both
are documented inline in the harness file itself.

## Self-Check

```
FOUND: apps/web/scripts/audit/app-user-harness-targets.ts
FOUND: apps/web/scripts/audit/app-user-connection-harness.ts
FOUND: apps/web/package.json contains "audit:app-user-harness"
FOUND: apps/web/.env.example contains "DATABASE_URL_APP_USER"
```

Commits:
- `c2b3bf54` — feat(quick-589): app_user connection harness — credential
  gate, GUC mirror, runtime discovery, six probe suites
- `332f0180` — chore(quick-589): npm entry point + .env.example slot for the
  app_user harness

```
git log --oneline --all | grep -q c2b3bf54 && echo FOUND || echo MISSING   -> FOUND
git log --oneline --all | grep -q 332f0180 && echo FOUND || echo MISSING   -> FOUND
```

`git diff --stat` against the pre-task tree touches exactly the five files
named in the plan's `files_modified` — no application source, no migration,
no `schema.prisma`, no policy/grant SQL, no `.env*` file carrying a real
value, and no report artifact (confirmed absent after both harness runs).

## Self-Check: PASSED
