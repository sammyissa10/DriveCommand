---
phase: quick-602
plan: 01
subsystem: security / RLS / tenant isolation
tags: [rls, tenant-context, tripwire, staging, migration, audit]
requires:
  - quick-597 (audit_log routed through current_tenant_id, SysAdminInvoice deny policies dropped)
  - quick-599 (tenant/audit/automation policy closure)
  - quick-600 (the app_admin privileged connection)
  - quick-601 (provisioning under app_user)
provides:
  - public.tenant_context_required(text) raising SQLSTATE TC001 with current_query() in DETAIL
  - a flag-gated tripwire branch inside current_tenant_id(), armed by app.tenant_context_tripwire
  - Tag/TagAssignment routed through current_tenant_id() — zero inline-GUC policies remain
  - scripts/audit/602-tripwire-verify.ts (baseline / mechanism / tag-equivalence / after / recheck / teardown)
  - scripts/audit/602-execution-sweep.ts (step 4 — real executions, four verdicts, by name)
  - scripts/audit/wrapper-countdown.ts + wrapper-countdown.json + its CI gate
  - docs/audits/unmigrated-path-tripwire.md
affects:
  - docs/audits/wrapper-migration-scope.md (§5 corrected in place)
  - docs/audits/policy-satisfiability-sweep.md (S5, §1 accounting, §2 census corrected in place)
tech-stack:
  added: []
  patterns:
    - a flag-gated raise reached only through a COALESCE null branch, keeping the SQL function inlinable
    - detection of a raised SQLSTATE by observing the DRIVER's promise rejections, so a route that swallows the error is still reported
    - a purely syntactic AST countdown that recognises a wrapper which does not exist yet
key-files:
  created:
    - apps/web/prisma/migrations/20260914180000_tenant_context_tripwire/migration.sql
    - apps/web/scripts/audit/602-tripwire-verify.ts
    - apps/web/scripts/audit/602-execution-sweep.ts
    - apps/web/scripts/audit/602-apply-staging.ts
    - apps/web/scripts/audit/wrapper-countdown.ts
    - apps/web/scripts/audit/wrapper-countdown.json
    - apps/web/tests/security/wrapper-migration-countdown.test.ts
    - docs/audits/unmigrated-path-tripwire.md
  modified:
    - apps/web/scripts/audit/rls-policy-canonical.json
    - apps/web/package.json (one script entry)
    - docs/audits/wrapper-migration-scope.md
    - docs/audits/policy-satisfiability-sweep.md
decisions:
  - "D1 — current_tenant_id() stays LANGUAGE sql STABLE: the COALESCE fast path was MEASURED not to raise, with EXPLAIN showing the raiser inlined and unreached"
  - "D2 — bypass-flagged statements are EXEMPTED from the tripwire, cost stated: ~211 sites unsignalled, owned by the Phase 0 bypass programme"
  - "The flag is a GUC read at call time, never a settings table, and the migration sets it NOWHERE"
metrics:
  tasks: 7
  commits: 7
  duration: one session
  completed: 2026-09-15
---

# quick-602: The unmigrated-path tripwire — Summary

Built the loud, flag-gated signal `wrapper-migration-scope.md` §5 designed, measured the three things
that design assumed, routed the last two inline policies through `current_tenant_id()`, and then ran
the application against staging as `app_user` with the tripwire on — reporting every path by name,
twice (in-process and over real HTTP).

**Staging only. Production was never written** — read at open and at close, quoted field by field in
`evidence/09-gates.md` §4, unchanged. No call site was migrated; `withTenantContext` still does not
exist. Nothing was installed.

## What was asked vs what came back

| asked | came back |
|---|---|
| re-confirm the baseline | **confirmed exactly** — 183 policies, 91/2/86/4, identical on both databases, empty set difference both ways |
| derive the 87 → 91 delta per policy | done from the SQL of the three intervening migrations; the arithmetic matches the plan's check table |
| measure the COALESCE short-circuit | **does not raise** — D1, `LANGUAGE sql` kept |
| measure the bypass OR | **raises in both policy orders, all three commands** — D2 taken, cost recorded |
| measure the TC001 payload | code + `current_query()` DETAIL confirmed; **the UNSET branch is unreachable through a session pooler** — a contradiction of the plan, reported |
| ship the migration, applied to staging, ledger row hand-written and read back | done; head is ours, `applied_steps_count = 0`, real SHA-256, sentinel visible first |
| prove the tripwire in SQL both directions | 9 probes raise with no context (reads AND writes), identical to flag-off when scoped, identical to the pre-migration baseline with the flag off |
| exercise the `ALTER ROLE` lever | **it does not exist** — `42501` for `postgres` and for `app_user`; the design was wrong and is corrected in the migration header and both audits |
| step 4 — execution, by name | 24 entry points invoked: **12 RAISED_TC001 / 8 COMPLETED / 4 OTHER_FAILURE**, plus 1 NOT_INVOKED kept separate |
| step 4e — the HTTP pass | **ran**, under all three guards; two disagreements with the in-process pass, both reported per route |
| step 5 — the countdown | 456 units named, gate proven RED three ways, overlap with step 4 measured at **0.88 %** |
| the write-up | `docs/audits/unmigrated-path-tripwire.md`, six deliverables, both predecessors corrected in place |

## The two measured decisions

**D1 — `current_tenant_id()` stays `LANGUAGE sql STABLE`.** With the flag ON and a real uuid, the
function returned the uuid and a policy scan calling it returned its row; `EXPLAIN (VERBOSE)` shows
the whole expression inlined with the raiser present and unreached (`evidence/02-mechanism.md` §1).
The plpgsql fallback was not taken because its trigger condition did not occur.

**D2 — bypass-flagged statements are exempted.** Six probes across two policy-creation orders all
raised `TC001`, so without an exemption every one of ~211 bypass sites would fail at once. The
exemption lives inside `tenant_context_required()`. **Cost: ~211 sites unsignalled**, and
`evidence/06-tripwire-matrix.md` Direction D shows it on a live table — with bypass on and no tenant
context, `SELECT count(*) FROM "Tag"` returned rows belonging to two different tenants, silently.

## Four measurements that contradicted the plan

1. **`ALTER ROLE`/`ALTER DATABASE … SET` of the tripwire GUC is `42501`** for `postgres` and for
   `app_user` — Supabase's `postgres` is not a superuser and the GUC is a placeholder. The
   connection-string `options` parameter is silently dropped by Supavisor. **Only a session-level
   `SET` works.**
2. **The UNSET branch of the TC001 message is unreachable** through the session pooler: a warm backend
   reads `''` for `app.current_tenant_id` while a never-set control name reads NULL.
3. **The cron mechanism classes overlap.** Five of the fourteen routes carry two mechanisms and one
   carries none; `auto-close-tickets` is marked `getAdminDb` and still raised.
4. **The countdown's file count is 202, not 198**, and the corpus is 1,689 files, not 1,694. Units
   agree **exactly** at 456. The file difference is reported unreconciled rather than smoothed away.

## Two findings worth more than the numbers

- **`purge-deleted` raised `TC001` seven times and nothing outside the process could see it.** Over
  HTTP it returned `200 {"success":true}` and the log said `Error: [object Object]` — the
  `logger.error` arity bug. The signal was perfect; the observability was zero.
- **A path routed to `getAdminDb` is structurally invisible to the tripwire** (`app_admin` carries
  `rolbypassrls`, so no policy is consulted). That is a real interaction between quick-600 and this
  task. It is per-statement, not per-route: two of the three routes quick-600 moved there still
  raised, because they also issue statements on the tenant connection.

## Deferred, and named

- **The migration has not reached production.** It is committed, so the next `vercel --prod` applies
  it — deliberately a behavioural no-op, because the flag is set nowhere. The only production-visible
  change is the `Tag`/`TagAssignment` predicate, whose two edge cases are measured and named.
- **No call site was migrated.** `withTenantContext` does not exist and the countdown reads 456.
- **The countdown gate is green with a NON-ZERO count by design.** It asserts equality, not zero.
- **Arming staging needs application code that does not exist.** The HTTP pass used a temporary,
  uncommitted, env-guarded `pool.on('connect')` in `lib/db/prisma.ts`, reverted immediately.
- **~211 bypass sites are outside the signal** until the Phase 0 bypass programme lands.

## Gates

- `tsc --noEmit` — **0 errors, and proven not blind**: the first run reported only syntax errors
  inside `.next/` (the CLAUDE.md trap, triggered by killing `next dev`); after deleting the corrupt
  artefacts, an injected `const __x602: number = 'y'` in a file this task wrote was reported by tsc
  before the clean run was believed. Probe removed; no stray survives.
- **vitest, same reporter both sides**: 164 files / 1979 tests → 165 files / **1990** tests. Delta is
  exactly the 11 new tests. Failures unchanged at 64, same set, apart from one pre-existing
  real-Postgres test file that flipped (cold-cache flake, untouched by this task).
- `npm run audit:rls-policy-drift` — **`RESULT: CLEAN`**, 0 missing / 0 unexpected / 0 definition
  drift / 0 not-canonicalised.
- Staging left **flag-off**, zero `RLS602` fixtures, zero probe objects, 86 `bypass_rls_policy` as a
  sorted list, `pg_db_role_setting` byte-identical to the baseline reading.
