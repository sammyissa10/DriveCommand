---
phase: quick-623
plan: 01
subsystem: security / multi-tenant isolation
tags: [rls, app_user-cutover, workflow-engine, seeder, swallowed-failure, census-batch-C4]
requires:
  - quick-622 query census (docs/audits/query-census.md), batch C4
provides:
  - seedStarterPlaybooks on a tenant client — 25 statements leave the cutover-gating set
  - a failed starter-playbook seed is visible to all three callers
  - 623-seed-verify.ts — staging proof with row counts and a real forced failure
affects:
  - apps/web/src/server/services/workflows/seedStarterPlaybooks.ts
  - apps/web/src/server/api/routers/workflows/__tests__/seed.test.ts
  - apps/web/scripts/seed-starter-playbooks.ts
  - apps/web/scripts/migrate.mjs
  - apps/web/src/app/(admin)/actions/tenants.ts
  - apps/web/src/app/(admin)/tenants/new/page.tsx
  - apps/web/scripts/audit/wrapper-countdown.json (567 -> 568)
decisions:
  - "the client is acquired where the transaction is OPENED; the three helpers keep `tx: Prisma.TransactionClient`"
  - "the seed script exits 1 on any failed tenant AND on zero enumerated tenants"
  - "migrate.mjs reports a failed seed as an ERROR but does not fail — the DDL is already committed"
  - "createTenant returns seedWarning; the page stays open to show it"
  - "the forced failure is a real 42501 (temporary REVOKE INSERT on PlaybookTrigger), not a synthetic throw"
metrics:
  statements_scoped: 25
  gating_before: "180 / 53 files (169 / 46 corrected)"
  gating_after: "155 / 52 files (144 / 45 corrected)"
  proof_cells: "10/10"
  completed: 2026-09-16
---

# quick-623 — seedStarterPlaybooks: 25 statements, one acquisition; the swallow fixed separately

Executed inline by the orchestrator rather than planner and executor subagents; `623-PLAN.md` records why.

## 0. Baseline and preconditions

**vitest from the working tree at `468f2fcc`, before any edit:** `2143 · 2024 passed · 64 failed · 52 pending ·
25 failing files`. That is byte-identical to quick-621's failing set (`00-vitest-baseline-failing.txt`).
`623-preconditions.ts` was written while that run was in progress. It is a script outside the test globs, and no
source file was touched during the run.

**Staging (`00-preconditions.txt`):**
- `app_user`, `rolbypassrls false`.
- Tripwire armed: unscoped read gives TC001, scoped read succeeds, disarmed read is a silent 0.
- `bypass_rls_policy` 86 on 86 tables.
- Sorted list identical to production (sha256 `315c31b0…`).

**The defect was already visible in the data.** Staging, on `app_user`, has **2 tenants and 0 seeded**. Production,
on `postgres`, has **32 active tenants, 0 unseeded** (read-only count).

## 1. The census rows, re-verified

**All 25 rows sit at the lines the census names**; `seedStarterPlaybooks.ts` was unchanged between `637a5f61` and
HEAD. **Nothing moved.**

| lines | statement | count |
|---|---|---:|
| 23 32 41 50 68 77 86 95 104 · 261 275 · 330 339 348 357 366 381 | `StepTemplate.create` | 17 |
| 115 · 285 · 392 | `Playbook.create` | 3 |
| 125 · 314 · 402 | `PlaybookStep.createMany` | 3 |
| 468 | `Playbook.findFirst` (the sentinel, bare) | 1 |
| 489 | `PlaybookTrigger.create` | 1 |

- **25 statements.** 24 are writes inside the transaction, plus the sentinel read.
- **3 helper functions receive the transaction:** `createCDLDriverOnboarding`, `createPreTripInspection`,
  `createPartnerSetup`.
- **Line 261 is one statement in the source that runs 11 times** (a `map` over the inspection items). That is why
  the seed writes 27 step templates from 17 `StepTemplate.create` statements.

## 2. The fix shape

- **Where it goes.** `getTenantPrismaForOrg(tenantId)` is called once, at the top of `seedStarterPlaybooks`,
  before the sentinel. Both the sentinel read and `db.$transaction(…, TX_OPTIONS)` run on that client, and the
  transaction's `tx` is what the helpers receive.
- **Helper signatures: unchanged.** They take `tx: Prisma.TransactionClient`, and the interactive-transaction
  client of the tenant client satisfies that type (tsc clean, probed).
- **Other callers: none.** All three helpers are **non-exported**. Repo-wide, their only call sites are
  `seedStarterPlaybooks.ts:478-480`; every other match is a planning doc. **No signature change, nothing to stop
  on.**
- `seedStarterPlaybooks(tenantId)` itself keeps its signature. Its callers are:
  - `(admin)/actions/tenants.ts:120`;
  - `scripts/seed-starter-playbooks.ts`;
  - `scripts/backfill-driver-onboarding-instances.ts`, which already counts errors and exits 1.

`TX_OPTIONS` was added to the transaction. The original used Prisma's 5 s default for 30+ round trips over the
pooler; the owner layout uses the same options.

## 3. The swallow, decided separately

| caller | before | after |
|---|---|---|
| `scripts/seed-starter-playbooks.ts` (spawned by `migrate.mjs` after every migration) | printed ✓/✗ per tenant, **always exit 0** | **exit 1 if any tenant fails** (summary: "FAILED for N of M"); **exit 1 on zero enumerated tenants** |
| `scripts/migrate.mjs` | `console.warn('…non-zero exit code — continuing.')` | `console.error` naming the consequence and the re-run command; **still does not fail** |
| `(admin)/actions/tenants.ts` `createTenant` | `logger.error`, then `{ success: true, tenant }` | same log, plus **`seedWarning`** on both success returns |
| `(admin)/tenants/new/page.tsx` | redirected to `/tenants` | **stays on the page** and renders the warning in the existing amber banner |

**Is the per-tenant ✓/✗ sufficient? No, for two reasons.**
- The only consumer that acts on the script, `migrate.mjs`, reads the **exit status**, not the lines. On a
  successful deploy nobody reads build output line by line.
- **Under `app_user` the per-tenant path is never reached.** The script enumerates tenants on the bare client, and
  `"Tenant"`'s only read policy is `id = current_tenant_id()`. Measured on staging:
  - **disarmed**, it printed `Seeding starter playbooks for 0 tenant(s)...` and **exited 0**: no ✗ anywhere;
  - **armed**, it raised TC001.

  So the zero-tenant guard is what makes the cutover case visible at all.

**Exit status when a tenant fails.**
- **The script:** 1.
- **`migrate.mjs`:** stays 0, with an ERROR line. By the time the seeder runs, the migrations are committed.
  - Failing the Vercel build would block a deploy whose schema has already moved.
  - Failing `npm start` (`node scripts/migrate.mjs && next start`) would keep the app down for every tenant over
    one tenant's playbooks.

  The seed is idempotent and re-runnable, which is why it was non-gating in the first place. What changes is that
  its failure is no longer worded as "continuing".

## 4. Applied

| commit | what |
|---|---|
| `ad1b26d6` | scoping: 2 files. One `getTenantPrismaForOrg(tenantId)`, **no userId**; every `tenantId` in the data kept; the unit test mocks the tenant client and adds two tests: acquisition with `[tenantId]` only, before the sentinel (**witnessed red against the pre-fix seeder**); and a failed transaction rejects |
| `68052419` | swallow: 4 files, the table in §3 |
| `8eea19d9` | wrapper countdown 567 → 568: exactly `seedStarterPlaybooks:475`, assertion untouched |
| `ff1922f9` | the three 623 audit scripts |

tsc: clean, **proven not blind** (a TS2322 probe in the edited file was reported, then removed).

## 5. Proof on staging — `623-seed-verify.ts`, 10/10

`bypass_rls_policy` dropped on **`Playbook`, `StepTemplate`, `PlaybookStep`, `PlaybookTrigger`**. Capture, drop,
restore and self-heal are copied verbatim from 621.
- **Rehearsal first:** `--throw-after-drop` went 86 → 82 → 86, sorted list identical, exit 3.
- **Every cell ran in a cold child process as `app_user`** with the tripwire armed and the dual-form driver hook
  installed. Rows were counted on the privileged connection.

| cell | result |
|---|---|
| `hook-control` | caller TC001, hook recorded 1 |
| `control:pre-fix-seeder` (`ad1b26d6^`) | **rejects TC001** at the sentinel `Playbook.findFirst`; **0 rows**. This is the failure every caller logged as success |
| `fn:create-tenant` (real sysadmin action) | `success: true`, **no `seedWarning`**; tenant created on `app_admin`; **3 playbooks · 27 steps · 27 step templates · 1 trigger counted**; 0 TC001 |
| `fn:seed-fresh-tenant` | before 0 rows; after **CDL Driver Onboarding / New Partner Setup / Pre-Trip Inspection (DVIR), 27 / 27 / 1**; a **second call adds 0**, so the scoped sentinel sees its own row; other tenants' rows **non-zero (3/27/27/1) and unchanged**; 0 TC001 |
| `caller:script-fixed-armed` | **exit 1**, TC001 on the Tenant enumeration with the tripwire's hint |
| `caller:script-fixed-disarmed` | **exit 1**, "enumerated ZERO active tenants … Nothing was seeded." |
| `witness:script-pre-fix-disarmed` | **exit 0** over "0 tenant(s)". The old silent success, reproduced |
| `fn:forced-failure-seeder` | with `INSERT ON "PlaybookTrigger"` **revoked** from app_user (the seeder's **last** write, so 23 statements had landed): **rejects 42501** `permission denied for table PlaybookTrigger`; **rolled back to 0 rows** |
| `fn:forced-failure-create-tenant` | same REVOKE: `success: true` **with `seedWarning`** naming the tenant id; 0 playbook rows. Before the fix this returned a bare success |

**Restore and teardown:**
- **Grant restored:** `has_table_privilege` true; app_user holds exactly `DELETE, INSERT, SELECT, UPDATE` again.
- **Policy restored:** re-created 4, live 86, sorted list identical, 0 body mismatches.
- **Teardown:** 5 fixture tenants deleted, **0 leftover rows** across `"Tenant"` and every table with a foreign key to it (82 checked).
- **Against production** (`05-sorted-list-hashes.json`): 86 = 86, **identical**, sha256 `0fa356b9…`, md5
  `29498ef6…`.
- **Preconditions re-run after:** all PASS. They overwrote `00-preconditions.json`; the step-0 text is in
  `00-preconditions.txt`.

**Two harness accommodations, stated:**
- **`createTenant`'s stubs.** Only `requireAuth`/`isSystemAdmin`, the owner-invitation email and `revalidatePath`
  are stubbed. The admin connection, tenant create, seeder and invitation insert are real.
- **Staging schema drift.** `"DriverInvitation"."middleName"` exists on **production** and in `schema.prisma`, but
  **no migration in the repo creates it**, so staging lacks it. The invitation insert's `RETURNING` raised 42703
  **after** the seed, and the action's catch-all turned it into a generic error. The harness narrows that insert's
  returned columns to `{ id }`, the only field `createTenant` reads. The first run, without the accommodation, is
  why this is known: the seed rows were counted 3/27/27/1 even though the action failed.

## 6. Gating count

`622-query-census.ts --out evidence/06-query-census.json`, reconciled row by row against quick-622's artefact
(`06-reconciliation.json`):

| | statements | files |
|---|---:|---:|
| cutover gating, as scanned: **before → after** | **180 → 155** | **53 → 52** |
| cutover gating, corrected for §3.1's 11 driver-pay rows | **169 → 144** | **46 → 45** |
| statements total | 1,825 → 1,825 | |

- **Left the gating set: exactly 25**, all in `seedStarterPlaybooks.ts`, with the §1 breakdown
  (17 + 3 + 3 + 1 + 1). **Entered: 0.**
- All 25 now score `SCOPED`: 24 `TX(TENANT_ORG)` and 1 `TENANT_ORG`.
- 155 − 11 = 144, and 52 − 7 = 45.

**Not in the census, and therefore not in 144:** `scripts/seed-starter-playbooks.ts`'s `Tenant.findMany`. The
census scans `src` only. This one statement stays a cutover item: it needs a connection that can see every tenant
(`getAdminDb`), which requires `DATABASE_URL_ADMIN` in the build environment. Until then, the zero-tenant guard makes
it fail loudly instead of silently.

## 7. Click-throughs with the in-process detector

Server: `620-start-staging-server.js`, hook preloaded, **hook control PASS in 6 server processes**. **Arming
counter-assertion: all four parts PASS** (`07-arming-control.txt`).

| run | entries | pass | fail | not-reachable | in-process TC001 |
|---|---:|---:|---:|---:|---:|
| web (604 passes 1+2) | 66 | **59** | **1** | 6 | **1** |
| mobile (617) | 30 | 24 | 5 | 0 | **0** |

**Neither run exercised this code.**
- `createTenant` is a server action, and the server log shows **no POST except 8 `/api/auth/login`**.
- **0 "starter playbooks" log lines.**
- The seed script is not a route.

**§5 is the only proof.**

**Mobile** is identical to quick-621 entry for entry (its 5 are the known P2022 drift / missing-parameter 400).

**Web's one failure is not this task's, but it is real.** DRIVER_A `/my-load` was marked fail with 1 TC001. What
the log shows:
- The raised statement is a `Document` count on `tenantId + driverId`. That is `(driver)/actions/driver-dashboard.ts:124`,
  on `getTenantPrisma()`, scored **`SCOPED`** by the census, inside a `Promise.all` behind a bare `catch`.
- Its hook line prints straight after `GET /home 200`. **The click-through's byte-window correlation credited
  `/home`'s raise to the next request.**
- Re-requested as DRIVER_A: **`/home` raised on 6 of 6, `/my-load` on 0 of 2** (`07-driver-home-repeat.txt`).
- quick-621 recorded 0 TC001 on the same entry.

Why this can't be this task's change:
- `seedStarterPlaybooks.ts` is imported only by `(admin)/actions/tenants.ts`.
- `tenants.ts` is imported only by `(admin)/tenants/**` and `(admin)/admin-dashboard`.
- None of those files is in `/home`'s import graph.

The GUC reads "the EMPTY STRING" at that moment. The only writer of `''` is `prisma.ts`'s `pool.on('connect')`
initialiser, so the likely mechanism is **a physical connection replaced mid-request after the request's
`set_config`**. That is not established here. **Reported, not fixed: a scoped statement that still raises is a
different class from the census's, and the census cannot see it.**

## 8. Gates

| gate | result |
|---|---|
| `tsc --noEmit` | clean, **proven not blind** |
| `npm run build` | **exit 0**; the two docs search-index files reverted as pre-existing drift |
| vitest after the last code/test commit (`ff1922f9`) | `2145 / 2026 / 64 / 52`, 25 failing files (+2 tests: the new seeder tests) |
| vs step-0 baseline | **failing-file set IDENTICAL** |
| intermediate run before the countdown commit | 26 files: `wrapper-migration-countdown` (567 → 568); regenerated, not weakened |

## 9. Remaining batches

**Cutover class, as scanned: 155 statements in 6 batches (144 corrected).** Sizes are quick-622's, less C4's 25.

| # | batch | stmts / files |
|---:|---|---|
| C4 | workflow-engine remainder: `generatePlaybookInstance` 2 · `playbookStepService` 2 · `routers/workflows/playbook` 2 · `trigger`, `stepInstance`, `computeDispatchReadiness`, `failInspectionItem` 1 each | **10 / 7** |
| C1 | owner carrier load + template editors | 34 / 5 |
| C2 | owner portal remainder (10 SWALLOWED) | 33 / 12 |
| C3 | notifications pipeline (design task) | 31 / 7 |
| C5 | lib/carrier + security | 24 / 6 |
| C6 | API remainder (11 of the 23 are the driver-pay rows that leave via one line in `require-driver.ts`) | 23 / 15 |

10 + 34 + 33 + 31 + 24 + 23 = **155**.

**Bypass-drop class: 56 (67 with the 11), unchanged.** D4 request paths 30 / 15 · D3 background 13 / 4 · D2 auth +
bootstrap 7 / 4 · D1 `SupportTicket` 6 / 1.

**Outside both, found here:**
1. `scripts/seed-starter-playbooks.ts` Tenant enumeration → `getAdminDb` (1 statement, needs `DATABASE_URL_ADMIN` at
   build time).
2. `/home`'s scoped `Document` count raising TC001 on staging (§7).
3. `"DriverInvitation"."middleName"` exists on production with **no migration**, which is schema/migration drift
   of the kind the 2026-05-30 incident rule forbids.
