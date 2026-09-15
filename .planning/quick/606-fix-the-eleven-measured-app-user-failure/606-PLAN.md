---
phase: quick-606
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
files_modified:
  - apps/web/scripts/audit/604-click-through.ts
  - apps/web/scripts/audit/604-classify.ts
  - apps/web/scripts/audit/604-survey.ts
  - apps/web/scripts/seed-staging.ts
  - apps/web/src/app/api/cron/digest-compliance-30day/route.ts
  - apps/web/src/app/api/cron/digest-daily-driver/route.ts
  - apps/web/src/app/api/cron/digest-weekly-owner/route.ts
  - apps/web/src/app/api/cron/send-reminders/route.ts
  - apps/web/src/app/api/cron/purge-deleted/route.ts
  - apps/web/src/app/api/cron/trip-reminders/route.ts
  - apps/web/src/app/api/cron/carrier-compliance-alerts/route.ts
  - apps/web/src/app/api/cron/workflow-notifications/route.ts
  - apps/web/src/app/(owner)/actions/notifications.ts
  - apps/web/src/app/(owner)/carrier/trips/page.tsx
  - apps/web/src/app/(driver)/documents/page.tsx
  - apps/web/src/app/track/[token]/page.tsx
  - apps/web/src/lib/notifications/check-upcoming-maintenance.ts
  - apps/web/src/lib/notifications/check-expiring-documents.ts
  - apps/web/src/lib/notifications/check-expiring-driver-documents.ts
  - apps/web/src/lib/notifications/digests/compliance-30day-payload.ts
  - apps/web/src/lib/notifications/digests/daily-driver-payload.ts
  - apps/web/src/lib/notifications/digests/weekly-owner-payload.ts
  - apps/web/src/lib/db/admin-reasons.ts
  - apps/web/tests/security/admin-connection-allowlist.test.ts
  - apps/web/tests/security/tenant-mechanism-fence.test.ts
  - apps/web/tests/security/606-report-integrity.test.ts
  - apps/web/tests/cron/digests.test.ts
  - apps/web/prisma/migrations/**
  - docs/audits/app-user-failure-remediation.md

must_haves:
  truths:
    - "Every one of the thirteen measured failures carries a FRESH staging verdict taken before any fix in this task, and any that no longer reproduce is reported with its reason."
    - "The three digest routes, send-reminders, /carrier/trips, purge-deleted and trip-reminders no longer raise TC001 on staging as app_user."
    - "workflow-notifications no longer raises 42501 on PlaybookNotification."
    - "carrier-compliance-alerts no longer asks a runtime connection to run DDL."
    - "withTenantRLS survives, is composed only inside createTenantClient, and a source-scan guard makes any new direct use a reviewable edit."
    - "/track/[token] is decided on evidence about whether the feature is live on production, and the decision is defended in the report."
    - "The closing numbers come from a re-run of 604-click-through.ts and a re-derivation by 604-classify.ts, never from arithmetic on the old table."
    - "Production is read-only at open and at close and reads identically: 156 / 183 / 20260914170000_activation_progress_congrats_shown_at."
  artifacts:
    - path: "docs/audits/app-user-failure-remediation.md"
      provides: "The remediation report — re-verification, per-failure fix, re-run, and what still fails"
      contains: "## 1."
    - path: "apps/web/tests/security/tenant-mechanism-fence.test.ts"
      provides: "The withTenantRLS / createTenantClient fence, CRLF-normalised, anti-vacuous, witnessed RED"
    - path: "apps/web/tests/security/606-report-integrity.test.ts"
      provides: "sum === failure-count re-assertion over THIS task's artefacts"
    - path: ".planning/quick/606-fix-the-eleven-measured-app-user-failure/evidence/"
      provides: "Every number in the report, cited"
  key_links:
    - from: "apps/web/src/app/api/cron/digest-daily-driver/route.ts"
      to: "getTenantPrismaForOrg"
      via: "per-tenant client acquisition that sets app.current_tenant_id"
      pattern: "getTenantPrismaForOrg\\(tenant\\.id\\)"
    - from: "apps/web/tests/cron/digests.test.ts"
      to: "@/lib/context/tenant-context"
      via: "the mock retargeted to the function the route now calls"
      pattern: "getTenantPrismaForOrg"
    - from: "apps/web/tests/security/admin-connection-allowlist.test.ts"
      to: "ADMIN_ALLOWLIST"
      via: "a per-file getAdminDb call count for every newly routed file"
      pattern: "ADMIN_ALLOWLIST"
---

<objective>
Fix the measured `app_user` failures from quick-604, on staging, with a fresh verdict before and
after each one.

Purpose: quick-604 measured and deliberately fixed nothing. Thirteen surfaces fail as `app_user` with
the tripwire armed; eleven of them sit in files the 456-unit countdown does not name. Those eleven are
the reason the cutover cannot happen. This task closes the ones that can be closed and states plainly
what each of the rest needs.

Output: the fixes, two migrations (staging-applied, production-no-op, both proven), a source-scan
fence that makes the `withTenantRLS` class a reviewable edit rather than an accident, a re-run of the
harness, and `docs/audits/app-user-failure-remediation.md`.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@docs/audits/staging-app-user-end-to-end.md
@docs/audits/unmigrated-path-tripwire.md
@docs/audits/policy-satisfiability-sweep.md
@docs/audits/admin-connection.md
@docs/audits/nuqs-adapter-render-failure.md
@apps/web/src/lib/db/extensions/tenant-rls.ts
@apps/web/src/lib/db/tenant-client.ts
@apps/web/src/lib/context/tenant-context.ts
@apps/web/src/lib/db/admin-reasons.ts
@apps/web/tests/security/admin-connection-allowlist.test.ts
@apps/web/scripts/audit/604-click-through.ts
@apps/web/scripts/audit/604-classify.ts
@apps/web/scripts/audit/604-survey.ts
</context>

---

<standing_rules>

Read these once. They bind every task below.

**R1 — PRODUCTION IS NEVER WRITTEN.** Read-only `SELECT`s against production are permitted and two
of them are required (Task 4's `information_schema.columns`, Task 6's `Load.trackingToken` count).
Everything else production-facing goes through `604-survey.ts`'s frozen SELECT-only array. Open and
close the ledger with it; both readings must be **156** `_prisma_migrations` rows, **183** `pg_policy`
rows in `public`, head `20260914170000_activation_progress_congrats_shown_at`. `--close` exits 1 on a
mismatch and that exit code is the evidence, not a sentence in the report.

**R2 — THE SILENT ZERO.** An UPDATE or DELETE refused by RLS is **0 rows and no error**
(`policy-satisfiability-sweep.md` §4.1, as corrected by quick-599). Every write path this task
touches — Task 5's `purge-deleted`, Task 5's `carrier_compliance_alert_log` INSERT — needs a
**counter-read on a separate privileged connection** (`STAGING_DIRECT_URL`, `postgres`), asserting the
connection's `current_user` is **not** `app_user` first. And the counter-read watches **the field the
handler claims to change**, read off the handler, never the field a name suggests (quick-604 §5's
false `SILENT_NO_OP`).

**R3 — A `pass` THAT IS A PASS ONLY BECAUSE STAGING HAS NO DATA IS NOT A PASS.** quick-605 established
this on `/carrier/driver-pay/reports` and the words *"a LATENT row is not a safe row"* are in that
report. Any row the re-run cannot drive is **`NOT_MEASURED`**, never folded into pass. Any row that
answers 200 because the query found nothing is **`LATENT`**, named, with the reason.

**R4 — DO NOT BEGIN THE `withTenantContext` MIGRATION.** Moving a `withTenantRLS` or a bare-client
call to `getTenantPrismaForOrg` / `getTenantPrisma` is fixing a measured failure and is in scope.
Converting existing `getTenantPrisma` call sites to a wrapper is the migration and is **out of scope**.
`wrapper-countdown.json`'s four protected counts must not move except as a regeneration whose diff is
inspected and quoted.

**R5 — DO NOT WIDEN A POLICY. DO NOT GRANT DDL TO ANY RUNTIME ROLE.** A `GRANT SELECT` on one table
to `app_admin` (Task 5) is in scope. A schema-level grant, a `CREATE` grant, or any change to a
`pg_policy` body is not.

**R6 — `getAdminDb` IS THREE DELIBERATE EDITS, NEVER ONE** (`admin-connection.md` §8): a new
`AdminReason` member describing what the path DOES; an `ADMIN_ALLOWLIST` entry with its own
`getAdminDb(` **call count**; a migration if the call touches a table `app_admin` has no grant on.
The allowlist test FAILING on a new call site is by design. Treat each edit as reviewable, not a
formality.

**R7 — GUARDS ARE PROVEN RED BEFORE ACCEPTED GREEN** (quick-549). A source-scanning guard needs CRLF
normalisation (`core.autocrlf=true`, no `.gitattributes`), a **"was it actually found"** assertion, a
**length floor** parameterised per named file (never a blanket floor over a swept tree — quick-562),
and a **counter-assertion** so an empty corpus cannot pass it.

**R8 — tsc GOES BLIND ON ANY PARSE ERROR ANYWHERE IN THE PROGRAM.** Before believing any clean
`npx tsc --noEmit`, inject `const x: number = 'y'` into a file this task **actually edited**, confirm
tsc reports THAT error at THAT line, delete the probe, re-run. If the only errors are syntax errors,
or are all in files you did not touch, the gate is blind — delete `apps/web/.next/dev/types/validator.ts`
and `apps/web/tsconfig.tsbuildinfo` and re-run.

**R9 — DO NOT INSTALL ANY PACKAGE.** Everything is hoisted at the **repo root** `node_modules`.
**Never import `scripts/_bootstrap-env`** in anything new — it assigns `DATABASE_URL = DIRECT_URL`,
and `DIRECT_URL` is PRODUCTION.

**R10 — REUSE THE HARNESS.** `604-click-through.ts`, `604-classify.ts`, `604-survey.ts`,
`seed-staging-auth.ts`, `seed-staging.ts`. Extend them **additively**, the way quick-605's
`--surfaces3` did: a new mode that writes into **this task's** evidence directory and correlates
against **its own** server log. quick-604's `04-click-through.json`, `04-server.log`,
`05-writes.json` and `06-classification.*` must be **byte-identical** at close — assert it by sha256
in the report. Do not write a new harness.

**R11 — THE STAGING SHELL.** There is no `.env.staging.runtime`. `apps/web/.env.staging` holds six
keys. Before starting the server, export **both**:
- `DATABASE_URL` from `STAGING_DATABASE_URL_APP_USER`
- `DATABASE_URL_ADMIN` from `STAGING_DATABASE_URL_ADMIN`

Omitting the second makes six cron routes fail `ECONNREFUSED` out of `getAdminDb` and reads exactly
like an application defect (§4 of the 604 audit — a whole run was thrown away for it). **Repoint every
string from `:6543` to `:5432` and strip `?pgbouncer=true`** — the pooled port is unreachable from this
machine. Guard the run as §2 does: log the `DATABASE_URL` **ref only**, extracted through `new URL()`,
never the string; and read `pg_stat_activity` on **both** databases before and after, expecting
`app_user` connections on production to be **0** at every reading.

**R12 — DEC-17, FOR BOTH MIGRATIONS.** Neither Supabase MCP tool writes the `_prisma_migrations` row.
Apply the SQL, then **write the resolved-not-run row by hand** — real SHA-256 of `migration.sql` over
**LF** bytes, `logs=''`, `started_at = finished_at`, **`applied_steps_count = 0`** — then **query the
table and read the newest row back**. "The DDL is live" is evidence of the half that was never in
doubt. On staging the read-back must be taken on the **privileged** connection: `_prisma_migrations`
has RLS on, zero policies and **no `app_user` grant**, so as `app_user` it returns
`42501 permission denied`, and from a non-owner role generally it can return **zero rows with no
error** — indistinguishable from "never written". Confirm a known-good sentinel row is visible before
treating an empty result as absence. **Apply to STAGING ONLY.** Both migration files are committed and
will be applied to production by `scripts/migrate.mjs` on the next deploy — which is why each must be
proven a **no-op against production** before it is written.

**R13 — `pg_constraint` / `information_schema` BEFORE ANY COLUMN OR ENUM CLAIM** (DEC-14). "It is in
a migration" and "it is in the database" are different claims. "It is in `schema.prisma`" is a third.

</standing_rules>

---

<the_thirteen>

The failure set, from `staging-app-user-end-to-end.md` §6. **Eleven are `OUTSIDE_456`** (§7) and two
are `IN_456_FILE_ONLY`. All thirteen are in scope — leaving `trip-reminders` and
`workflow-notifications` unfixed because of an attribution label would be arbitrary, and the brief
names `workflow-notifications`' grant explicitly.

| # | surface | SQLSTATE | shape | task |
|---|---|---|---|---|
| 1 | `/carrier/trips` | `TC001` | bare-client tenant-scoped read (§7a) | 4 |
| 2 | `/documents` | `P2022` | staging `Document` column drift (§7e) + a latent §7a read | 4 |
| 3 | `/api/cron/carrier-auto-dispatch` | — | fixture data (§7f) — a `NOT_INVOKED` in all but name | 6 |
| 4 | `/api/cron/carrier-compliance-alerts` | `42501` schema | runtime connection asked to run DDL (§7c) | 5 |
| 5 | `/api/cron/digest-compliance-30day` | `TC001` | `withTenantRLS` (§7b) | 2 |
| 6 | `/api/cron/digest-daily-driver` | `TC001` | `withTenantRLS` (§7b) | 2 |
| 7 | `/api/cron/digest-weekly-owner` | `TC001` | `withTenantRLS` (§7b) | 2 |
| 8 | `/api/cron/purge-deleted` | `TC001` | bare-client cross-tenant DELETE sweep (§7a) | 5 |
| 9 | `/api/cron/send-reminders` | `TC001` | `createTenantClient` direct, at `check-upcoming-maintenance.ts:31` | 2 |
| 10 | `/carrier/driver-pay/settlements` | — | `nuqs` adapter (§7g) — **quick-605 mounted it at the root** | 1 |
| 11 | `/checklists/automation` | — | `nuqs` adapter (§7g) — **quick-605 mounted it at the root** | 1 |
| 12 | `/api/cron/trip-reminders` | `TC001` | bare `prisma.tenant.findMany` sweep at `:74` | 5 |
| 13 | `/api/cron/workflow-notifications` | `42501` | `app_admin` lacks SELECT on `PlaybookNotification` | 5 |

Plus the two rows quick-604/605 left **unmeasured**, which R3 forbids folding into pass:

| surface | why unmeasured | task |
|---|---|---|
| `/track/[token]` | legacy `"Load"` holds **0 rows** on staging; the page reads the bare client with no tenant context | 6 |
| `/carrier/imports/[id]/stops` | `document_imports` holds **0 rows** on staging; no id to substitute | 1 (report as `NOT_MEASURED`) |

</the_thirteen>

---

<tasks>

<task type="auto">
  <name>Task 1: Open the ledger, and RE-VERIFY all thirteen before touching anything</name>
  <files>
apps/web/scripts/audit/604-click-through.ts
.planning/quick/606-fix-the-eleven-measured-app-user-failure/evidence/01-open.json
.planning/quick/606-fix-the-eleven-measured-app-user-failure/evidence/02-reverify.json
.planning/quick/606-fix-the-eleven-measured-app-user-failure/evidence/02-reverify.md
  </files>
  <action>
**This is a RE-VERIFICATION, not a restatement.** The click-through was several commits ago
(`49bf351d`) and quick-605 has since changed the root layout (`408a84ec` mounted `NuqsAdapter` at the
root and deleted the empty `(dev)` group). Rows 10 and 11 are expected to have moved. Any row that no
longer reproduces is **reported with the reason** and is not "fixed by this task".

1. **Ledger open.** `npx tsx scripts/audit/604-survey.ts --open`, writing to **this task's** evidence
   directory. Assert 156 / 183 / `20260914170000_…`. Record staging's preconditions the same way §1
   does: `current_user` = `app_user`, `rolbypassrls` = **false**, `tenant_context_required` present,
   the tripwire branch present inside `current_tenant_id()`, `pg_policy` count, and the row counts for
   `Tenant` / `User` / `auth.users` / `loads` / `document_imports` / legacy `"Load"` /
   `PlaybookInstance` / `Document`. **Do not re-seed** — staging is left armed and seeded (§9), and
   `seed-staging-auth.ts --teardown` was not run. Confirm the eight logins still work; re-seed only if
   they do not, and say so.

2. **Bring the server up per R11.** Record guard 1 (refs only) and guard 2 (`pg_stat_activity` on both
   databases) into evidence. Set `RESEND_API_KEY=''` and `GMAIL_USER=''` and leave Upstash unset, so
   `authLimiter` is `null` and the fixture logins cannot lock the run out of itself.

3. **Extend `604-click-through.ts` additively** with a `--surfaces606` mode, modelled exactly on
   quick-605's `--surfaces3`: its own surface list, `--out <file>`, and `CLICK_THROUGH_LOG` pointing at
   **this task's** server log. R10 — the default `--surfaces` / `--surfaces2` / `--writes` paths must be
   byte-for-byte unchanged, and quick-604's four artefacts must hash identically at close.

   The `--surfaces606` list is **all thirteen rows above, plus the two unmeasured rows**, with the same
   roles, the same pass criterion (2xx/3xx to the requested path, **no `TC001` in the correlated
   server-log window**, no swallowed-failure marker in the body — the **log slice, not the status code,
   is the authority**), and the same evidence shape. `TC001` is detected **by code, never by message
   prose** (`unmigrated-path-tripwire.md` §3.3).

4. **Run it. Every row gets its own fresh verdict**, one of `pass` / `fail` / `NOT_MEASURED` /
   `LATENT`, with its SQLSTATE and its correlated log byte range. Per R3, a 200 that is a 200 because a
   query found nothing is `LATENT`, named. `/carrier/imports/[id]/stops` is `NOT_MEASURED`
   (`document_imports` = 0). `/track/[token]` is `NOT_MEASURED` (legacy `"Load"` = 0).

5. **Write `02-reverify.md`** as a per-row table: `quick-604 verdict` | `606 re-verified verdict` |
   `changed?` | `reason`. For rows 10 and 11, if they now pass, say **quick-605 fixed them** and cite
   `408a84ec`; they are then carried as ALREADY-FIXED, not as this task's work. **These fresh numbers
   are the ones carried forward into every later task and into the report.** The quick-604 table is
   never the source again.

No application code changes in this task.
  </action>
  <verify>
`604-survey.ts --open` exits 0 with 156/183/head unchanged. `02-reverify.json` carries exactly 15 rows,
each with a verdict, a SQLSTATE field and a log byte range. sha256 of quick-604's
`04-click-through.json`, `04-server.log`, `05-writes.json`, `06-classification.json` recorded and
unchanged from the values at task open. `npx tsc --noEmit` in `apps/web` exits 0, **probed per R8**.
  </verify>
  <done>
Fifteen fresh staging verdicts exist, with every change from quick-604 explained. Production read
156/183/head at open. quick-604's evidence is provably untouched.
  </done>
</task>

<task type="auto">
  <name>Task 2: The `withTenantRLS` / `createTenantClient` family — nine call sites, one shape</name>
  <files>
apps/web/src/app/api/cron/digest-compliance-30day/route.ts
apps/web/src/app/api/cron/digest-daily-driver/route.ts
apps/web/src/app/api/cron/digest-weekly-owner/route.ts
apps/web/src/app/api/cron/send-reminders/route.ts
apps/web/src/app/(owner)/actions/notifications.ts
apps/web/src/lib/notifications/check-upcoming-maintenance.ts
apps/web/src/lib/notifications/check-expiring-documents.ts
apps/web/src/lib/notifications/check-expiring-driver-documents.ts
apps/web/src/lib/notifications/digests/compliance-30day-payload.ts
apps/web/src/lib/notifications/digests/daily-driver-payload.ts
apps/web/src/lib/notifications/digests/weekly-owner-payload.ts
apps/web/tests/cron/digests.test.ts
  </files>
  <action>
**The finding, restated so the fix is not mistaken for a deletion.** `withTenantRLS` is **not** dead
weight and must **not** be removed. `lib/db/tenant-client.ts:26` composes it inside
`createTenantClient`, and `getTenantPrisma` / `getTenantPrismaForOrg` both **set the GUC** *and* apply
it. The defect is **direct use from feature code**:

- `withTenantRLS(id)` alone → application-layer `tenantId` injection, **no GUC** → `TC001`.
- `createTenantClient(id)` alone → the same, plus audit columns → **no GUC** → `TC001`.
- `getTenantPrismaForOrg(id)` → sets the GUC **and** applies `withTenantRLS` → correct.

**The five direct `withTenantRLS` sites:**
```
src/app/(owner)/actions/notifications.ts:65    globalPrisma.$extends(withTenantRLS(tenantId))
src/app/(owner)/actions/notifications.ts:130   globalPrisma.$extends(withTenantRLS(tenantId))
src/app/api/cron/digest-compliance-30day/route.ts:60
src/app/api/cron/digest-daily-driver/route.ts:60
src/app/api/cron/digest-weekly-owner/route.ts:60
```
All three digest routes carry a comment at `:40` calling the scoping **"DECORATIVE"**. Somebody
already suspected, wrote it down, and left it. **Quote that comment verbatim in the report** — it is
the clearest example in the repo of a known defect surviving because nobody owned it.

**`src/app/api/cron/send-reminders/route.ts:24` imports `withTenantRLS` and appears never to call it.**
Confirm by grep over the whole file (CRLF-normalised) before acting. If genuinely unused, remove the
import. If it IS used, **report that instead** and leave it — do not guess.

**The `createTenantClient` direct sites on the measured path.** `send-reminders`' attributed site is
`src/lib/notifications/check-upcoming-maintenance.ts:31` (`findUpcomingMaintenance`), which does
`createTenantClient(tenantId)` — a fourth shape the brief's five-site list does not cover. Its two
siblings, `check-expiring-documents.ts:34` and `check-expiring-driver-documents.ts:24`, are the same
statement issued from the same `Promise.all` at `send-reminders/route.ts:99-101`. **Fix all three** —
they are one call, one route, one defect; the first one merely raised first.

**The change, at every one of these sites:** replace the acquisition with
`await getTenantPrismaForOrg(tenantId)` from `@/lib/context/tenant-context`. Keep the existing
`: any` annotations where the routes already carry them; do not restructure the loops.

Two things to check rather than assume:
- `notifications.ts:65/130` sit inside `unstable_cache`. `getTenantPrismaForOrg` reads no headers, so
  it is safe outside a request scope — **confirm by running the surface**, not by reasoning. Note in
  the report that `/dashboard` measured `pass` in quick-604: these two are **LATENT**, and the likely
  reason they did not raise is `unmigrated-path-tripwire.md` §8 item 7 — the pool holds `max: 1`, so a
  bare statement can inherit a GUC an earlier scoped one left set. Name it.
- The three `lib/notifications/digests/*-payload.ts` modules document their parameter as *"already
  extended with withTenantRLS"*. **Move the doc comments with the call sites** — a doc comment
  asserting a mechanism the caller no longer uses is the quick-547/548 class.

**`tests/cron/digests.test.ts:39` mocks `withTenantRLS`**:
`vi.mock('@/lib/db/extensions/tenant-rls', () => ({ withTenantRLS: () => ({}) }))`. Once the routes
stop calling it, that mock injects into a **dead code path** and the file goes green forever while
testing nothing — the Phase-10 `sendDispatchAssignedNotification` shape exactly. **Retarget it** to
`getTenantPrismaForOrg` on `@/lib/context/tenant-context`, and confirm the retarget is load-bearing by
making the mock throw once and watching the suite go RED.

**Verify on staging, not by reading the diff.** Re-run `--surfaces606` for rows 5, 6, 7 and 9 only and
record the fresh verdicts. A digest route that now answers 200 having found zero drivers is `LATENT`
under R3, not `pass` — check the body's `sent`/`skipped` counters and say which it is.
  </action>
  <verify>
`grep -rn "withTenantRLS" apps/web/src` returns **only** `lib/db/tenant-client.ts`,
`lib/db/extensions/tenant-rls.ts`, `lib/db/extensions/tenant-rls-bound.prototype.ts` and comment
references. Rows 5, 6, 7, 9 of `--surfaces606` no longer carry `TC001` in their correlated log slice.
`npx vitest run tests/cron/digests.test.ts` passes, and was witnessed RED with the retargeted mock made
to throw. `npx tsc --noEmit` exits 0, probed per R8.
  </verify>
  <done>
No feature-code module applies `withTenantRLS` or `createTenantClient` directly on any of these nine
sites. Four measured `TC001` failures have a fresh staging verdict showing the raise is gone. The
"DECORATIVE" comment is quoted in the report. The digests test mock points at the function the routes
actually call.
  </done>
</task>

<task type="auto">
  <name>Task 3: Fence the tenant mechanisms — the guard, proven RED</name>
  <files>
apps/web/tests/security/tenant-mechanism-fence.test.ts
  </files>
  <action>
`apps/web` has **no working lint entry point** (quick-562 — `next lint` no longer accepts `--dir` on
this Next version and ESLint 9 finds no `eslint.config.js`). **Say that in the report rather than
proposing an ESLint rule.** A vitest source scan under `tests/` is the only enforcement available, and
it is the shape quick-600 already proved.

Follow `tests/security/admin-connection-allowlist.test.ts` **structurally**, not loosely:

1. **Import match by MODULE PATH, never by imported name** — an alias cannot dodge a path match.
2. **Two-direction set equality** against a committed allowlist: a file on the list that no longer
   imports fails as loudly as an importer missing from the list.
3. **Per-file call COUNT**, so a new call inside an already-allowlisted file is still a reviewable diff.
4. **Alias ban** — `import { withTenantRLS as x }` / `{ createTenantClient as x }` anywhere in `src`
   is a violation on its own.
5. **Anti-vacuity (R7)**: a floor on files actually visited; a per-file `minBytes` floor on each named
   entry; and a **counter-assertion** — a file deliberately NOT on the list is confirmed READ and
   confirmed to contain zero matches, so an empty-corpus walker cannot pass.
6. **CRLF normalisation** on every read (quick-546 — this repo has no `.gitattributes` and
   `core.autocrlf=true`, and the failure mode of a bad slice is GREEN).

**Two lists, because there are two situations and merging them would make the guard useless:**

- **`withTenantRLS` — a closed fence.** After Task 2 the only legitimate importers are
  `src/lib/db/tenant-client.ts`, `src/lib/db/extensions/tenant-rls-bound.prototype.ts` (the prototype)
  and the named tests that legitimately exercise the extension directly
  (`src/lib/db/__tests__/driver-pay-tenant-isolation.test.ts`, `tests/security/audit-log-isolation.test.ts`,
  `tests/security/restricted-documents.test.ts`, `src/__tests__/security/tenant-header-forgery.test.ts`).
  Enumerate them, with counts. Any new `src` importer is a failure.

- **`createTenantClient` — a FROZEN INVENTORY, not a fence.** After Task 2 there are still direct
  callers this task is not converting, because they were **not measured failures** and R4 forbids
  starting the migration: `app/(owner)/actions/dashboard.ts` (2),
  `app/(owner)/actions/tenant-notification-settings.ts` (3), `lib/db/repositories/base.repository.ts`
  (1), plus `lib/context/tenant-context.ts` (2, the legitimate ones). **Verify these counts by grep
  before freezing them** — do not copy the numbers out of this plan. Freezing them makes a new one a
  reviewable edit and, just as importantly, **names the latent set in a place a reader will find it**.
  A fence here would be red against correct existing code, and a red test everyone learns to ignore
  protects nothing (quick-562).

Write the file header to say all of that — including, in one sentence, **what happens to
`withTenantRLS`: it survives, it is composed only inside `createTenantClient`, and direct use is now a
deliberate edit.**

**Prove it RED before accepting it green (R7):** add a throwaway `src` file importing `withTenantRLS`,
watch the set-equality assertion fail, quote the verbatim failure into evidence, delete it, re-run
green. Then do the same for the alias ban. Both witnessed REDs go in the report.
  </action>
  <verify>
`npx vitest run tests/security/tenant-mechanism-fence.test.ts` passes. Evidence carries two verbatim
RED outputs (a new importer; an alias) and the green run after each revert. The counter-assertion file
is confirmed read and confirmed to contain zero matches. `npx tsc --noEmit` exits 0, probed per R8.
  </verify>
  <done>
A committed guard makes any new direct `withTenantRLS` use fail the suite, and any new direct
`createTenantClient` use a deliberate count bump. Both were proven to fire.
  </done>
</task>

<task type="auto">
  <name>Task 4: The two tenant-scoped bare-client reads — `/carrier/trips` and `/documents`</name>
  <files>
apps/web/src/app/(owner)/carrier/trips/page.tsx
apps/web/src/app/(driver)/documents/page.tsx
apps/web/prisma/migrations/&lt;ts&gt;_staging_document_column_drift/migration.sql
  </files>
  <action>
**4a — `/carrier/trips` (failure 1).** `page.tsx:19` issues
`prisma.carrierDriver.findMany({ where: { orgId }, … })` plus two more tenant-scoped statements on the
**bare** client. This is §7a's exemplar and it is worth stating plainly in the report: the trips list —
one of the most-visited screens in the carrier portal — carries no `getTenantPrisma`, no bypass flag
and no marker, which is why it is invisible to both the 211-site bypass grep and the 456-unit AST pass.
The countdown names `trips/[id]/page.tsx`, `trips/[id]/stops/page.tsx` and `trips/new/page.tsx` — but
**not the list page itself**.

Replace the bare `prisma` in the `Promise.all` with `await getTenantPrisma()`. The page already
resolves and null-checks `session.tenantId` before the reads, so the session-derived resolver is the
right door — do **not** use `getTenantPrismaForOrg` here; the escape hatch is for callers with no
session (`tenant-context.ts:44`). Leave `getResumableImports(orgId, session.userId)` alone unless the
re-run shows it raising; if it does, report it as a separate site rather than widening this task.

**4b — `/documents` (failure 2): TWO defects, and only one of them is about `app_user`.**

*The one that raises:* `P2022 ColumnNotFound`. `staging-environment.md` §2 and 604 §7e: five `Document`
columns exist on production and in `schema.prisma` and are **missing on staging** — `expiryDate`,
`externalUrl`, `loadId`, `notes`, `description` — and `expiryDate`/`externalUrl` appear in **zero**
migration files. The page orders by `expiryDate`, so it 500s. **The repository cannot rebuild its own
database from scratch.**

*The one that hides behind it:* the read is `prisma.document.findMany({ where: { driverId } })` on the
**bare** client with no tenant scope — the §7a shape, unmeasurable while the P2022 raises first.

**The migration is CONDITIONAL and the condition is a production read.** Per R1 a read-only
`SELECT column_name, data_type, is_nullable, character_maximum_length, numeric_precision, numeric_scale
FROM information_schema.columns WHERE table_name = 'Document'` against production is permitted and is
required. Take the same read against staging and against `schema.prisma`.

- **If all five exist on production with one unambiguous type each, and staging lacks exactly those
  five:** write `prisma/migrations/<ts>_staging_document_column_drift/migration.sql` using
  `ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS …` with the **production types, verbatim**, so the
  file is a provable no-op on production when `migrate.mjs` applies it on the next deploy. Apply to
  **staging only**, then R12's hand-written ledger row and read-back.
- **If ANY column differs in type, nullability or precision, or is ambiguous:** write **no migration**.
  Report the discrepancy column by column and leave `/documents` as `NOT_MEASURED`. An `ADD COLUMN`
  whose type you guessed is a production defect this task would be shipping.

Then fix the read: `await getTenantPrisma()` in place of the bare client.

**The verification has a trap (R3).** If staging holds **zero** `Document` rows for the fixture driver,
a 200 proves the P2022 is gone and **nothing at all** about the scoping. Count the rows first. If zero,
seed one `Document` for `driver1@alpha.staging.test` on the privileged connection, re-run, assert it
renders, then assert a driver from the **other** tenant does not see it. If that cannot be arranged,
record the row as `LATENT` with the reason spelled out — never as `pass`.
  </action>
  <verify>
`--surfaces606` rows 1 and 2 re-run: no `TC001` in the correlated slice for `/carrier/trips`; no
`P2022` for `/documents`. If the migration was written: the newest `_prisma_migrations` row on staging
is this migration, read back on the **privileged** connection with `applied_steps_count = 0` and a real
SHA-256 over LF bytes, and a known-good sentinel row was confirmed visible in the same query.
`information_schema.columns` on staging now lists all five. Production ledger still reads 156 — assert
it. `npx tsc --noEmit` exits 0, probed per R8.
  </verify>
  <done>
Both pages acquire their client through the session-derived resolver. `/carrier/trips` renders clean as
`app_user`. `/documents` either renders with the drift closed and its scoping measured, or is reported
`NOT_MEASURED` with the exact column discrepancy that blocks it. Production untouched.
  </done>
</task>

<task type="auto">
  <name>Task 5: The cross-tenant sweeps and the two 42501s</name>
  <files>
apps/web/src/app/api/cron/carrier-compliance-alerts/route.ts
apps/web/src/app/api/cron/purge-deleted/route.ts
apps/web/src/app/api/cron/trip-reminders/route.ts
apps/web/src/lib/db/admin-reasons.ts
apps/web/tests/security/admin-connection-allowlist.test.ts
apps/web/prisma/migrations/&lt;ts&gt;_grant_playbook_notification_to_app_admin/migration.sql
  </files>
  <action>
**5a — `workflow-notifications` (failure 13): ONE grant, and confirm WHICH ROLE first.**

The classification said `MISSING_GRANT ×2`, but **the two are not the same shape**:
`carrier-compliance-alerts` is `42501 permission denied for schema public` — the DDL of 5b, not a table
grant at all. So the real grant work here is **one**.

`route.ts:145` is `getAdminDb('workflow blocked-instance sweep')` and its `findMany` carries a nested
`notifications: { none: { notificationType: 'INSTANCE_BLOCKED', channel: 'EMAIL' } } }`. That nested
filter reads `PlaybookNotification`, and `20260914140000_admin_connection_role` grants `app_admin`
SELECT on `PlaybookInstance` and `StepInstance` but **not** `PlaybookNotification`. So the denied role
is almost certainly **`app_admin`, not `app_user`** — confirm it by querying
`information_schema.role_table_grants` for both roles on that table before writing anything. This is
the same class `admin-connection.md` §5 records: grants a static read of application code could not
predict, found only by running the path.

Also required, and explicitly asked for: **check whether `PlaybookNotification` is the ONLY table that
path lacks.** Walk both sweeps' `select`/`include`/nested-filter trees and check each table against
`role_table_grants` for `app_admin`. And confirm the nested filter is genuinely needed by the path
rather than pulled in by an over-broad query — read the surrounding logic; the filter excludes
instances that already had an EMAIL escalation, which is load-bearing, but **say so from the code, not
from this plan**.

Then write `prisma/migrations/<ts>_grant_playbook_notification_to_app_admin/migration.sql`:
`GRANT SELECT ON "PlaybookNotification" TO app_admin;` — **SELECT only**, wrapped in a
`DO $$ … IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_admin') … $$` guard so it is a no-op
where the role has not been created. Per R5 nothing schema-level, nothing beyond this one table.
Production already carries `app_admin` (migration `20260914140000` is behind head
`20260914170000`) — **verify that read-only** rather than assuming it. Apply to **staging only**, then
R12's ledger row and read-back.

**5b — `carrier-compliance-alerts` (failure 4): delete the DDL, then measure what surfaces.**

`route.ts:37-54` runs `CREATE TABLE IF NOT EXISTS carrier_compliance_alert_log (…)` plus two
`CREATE INDEX IF NOT EXISTS` on **every invocation**, in a try/catch returning
`500 {"error":"Failed to initialize log table"}`. Under `app_user` that is
`42501 permission denied for schema public`. **A runtime connection is being asked to run DDL** and no
policy change can fix it.

The table is real: created by `20260515000000_repair_carrier_compliance_alert_log`, further touched by
`20260515000001_db_security_standardization` and `20260527000001_quick410_advisor_rls_fix`, carrying a
live `tenant_isolation_policy` on `org_id` (sweep S10) and an `app_user` grant. **It is NOT in
`schema.prisma`** — grep returns nothing — so it is a raw-SQL-only table. Per R13, **confirm it exists
on BOTH staging and production** via `information_schema.tables` before deleting the bootstrap: "it is
in a migration" and "it is in the database" are different claims. If it is missing on either, write a
migration creating it there rather than leaving a route that depends on a table that may not exist.

Delete the bootstrap block. Then **re-run the route and read what comes next**, because the DDL was
masking the rest:
- `:63` is `prisma.tenant.findMany({ where: { isActive: true } })` on the **bare** client under a
  `@bypass_rls reason: system-operation` comment — and **nothing in the file sets
  `app.bypass_rls`**, so that comment is decorative in the same way the digests' was. As `app_user` with
  an empty GUC this is very likely a **silent zero tenants**, i.e. a cron that reports success having
  done nothing — worse than a raise. Measure it; do not predict it in the report.
- the per-tenant `$executeRaw INSERT INTO carrier_compliance_alert_log` needs the GUC set on the
  connection it runs on.

Fix shape, consistent with the five sweeps quick-600 already routed: tenant list →
`getAdminDb('<new reason>')`; per-tenant work → `getTenantPrismaForOrg(tenant.id)`, and issue the raw
INSERT **on that returned client**, not on the bare `prisma` — relying on a max:1 pool to have inherited
the GUC is `unmigrated-path-tripwire.md` §8 item 7 and is exactly what this task exists to stop.
`app_admin` needs SELECT on `Tenant` — it already has it; verify.

**5c — `purge-deleted` (failure 8): the DELETE sweep, and R2 is not optional here.**

`:51` runs `model.deleteMany({ where: { deletedAt: { not: null, lt: cutoffDate } } })` across seven
models on the bare client. Route the tenant list to `getAdminDb('<new reason>')` and run each
`deleteMany` per tenant through `getTenantPrismaForOrg(tenant.id)`. **Prefer the per-tenant loop over
routing the deletes themselves to `getAdminDb`** — the latter needs DELETE grants for `app_admin` on
seven tables, which is exactly the "never `ALL TABLES IN SCHEMA`" widening R5 forbids, and it would
remove seven statements from the tripwire's reach (§8 item 2).

**A DELETE refused by RLS is a SILENT ZERO (R2).** The current code would then report
`totalPurged: 0` — indistinguishable from a clean run with nothing to purge, which is precisely the
erasure quick-603 removed from this file once already. Verification: on the privileged connection seed
**one disposable soft-deleted row per model per tenant** with `deletedAt` beyond
`SOFT_DELETE_RETENTION_DAYS`, note their ids, run the cron, then **counter-read on the privileged
connection** that each id is gone and that no row belonging to any other criterion disappeared. Assert
`results[model] > 0` in the response body AND the counter-read agrees. Clean up anything the sweep did
not remove, and assert zero probe rows survive.

**5d — `trip-reminders` (failure 12).** `:74` is `prisma.tenant.findMany({ where: { isActive: true } })`
on the bare client — the same sweep shape, and the only `TC001` site in that file; its per-tenant work
already uses `getTenantPrismaForOrg` correctly. Route the sweep to `getAdminDb('<new reason>')`.

**5e — R6, three deliberate edits, for each newly routed file.** New `AdminReason` members in
`lib/db/admin-reasons.ts`, following the file's own stated rule: **the string says what the path DOES,
never that it needs admin** — never the words "bypass" or "cross-tenant" as the whole string. One
member per routed unit of work. Then an `ADMIN_ALLOWLIST` entry per file in
`tests/security/admin-connection-allowlist.test.ts` with its own `getAdminDb(` **call count** and a
`minBytes` floor. Confirm the allowlist test goes RED first with the new call and no entry — **that is
the gate working, and it goes in evidence** — then add the entries and watch it go green.
  </action>
  <verify>
`--surfaces606` rows 4, 8, 12, 13 re-run with fresh verdicts and no `TC001` / `42501` in their
correlated slices. `purge-deleted`'s counter-read proves each seeded disposable row is gone and its
response body reports a non-zero count for each model — not a silent zero. `role_table_grants` confirms
`app_admin` now holds SELECT on `PlaybookNotification` on staging and that no other table on those two
sweeps is missing. `information_schema.tables` confirms `carrier_compliance_alert_log` on both
databases. `npx vitest run tests/security/admin-connection-allowlist.test.ts` passes, with the
pre-entry RED captured verbatim. Newest staging `_prisma_migrations` row read back per R12. Production
ledger still 156/183. `npx tsc --noEmit` exits 0, probed per R8.
  </verify>
  <done>
No runtime connection is asked to run DDL. Four cross-tenant sweeps acquire their tenant list through
`getAdminDb` with a named reason and an allowlist entry, and do their per-tenant work under a client
that sets the GUC. The one genuine missing grant is granted, scoped to SELECT on one table, applied to
staging only, and proven a no-op for production. `purge-deleted` is proven to actually delete.
  </done>
</task>

<task type="auto">
  <name>Task 6: `/track/[token]` — decided on evidence — and the `carrier-auto-dispatch` fixture</name>
  <files>
apps/web/src/app/track/[token]/page.tsx
apps/web/tests/security/admin-connection-allowlist.test.ts
apps/web/scripts/seed-staging.ts
  </files>
  <action>
**6a — `/track/[token]`. Establish liveness FIRST. Do not design anything before this read.**

`page.tsx:17` does `prisma.load.findUnique({ where: { trackingToken: token } })` on the bare client,
with its own comment reading *"Query load directly — no auth, no RLS, no tenant context"*, and then a
second bare read of `gPSLocation`. The caller is an anonymous member of the public: there is **no
session and therefore no tenant until the token resolves one**. The token IS the capability. **The page
cannot have a tenant context it cannot have, and the report must not pretend otherwise.**

It reads the **LEGACY `"Load"`** model, which holds **0 rows on staging**. So step one is a read-only
production query (permitted by R1):

```sql
SELECT count(*) FROM "Load" WHERE "trackingToken" IS NOT NULL;
```

- **If that is 0**, the honest outcome may be **"report, do not build"**. Say so, with the count.
- **If it is non-zero**, the feature is live and must be fixed.

**The three options, weighed — and the decisive fact the brief did not have.** There is already an API
twin: `src/app/api/track/[token]/route.ts:26` does
`getAdminDb('public shipment tracking lookup')` for **byte-identical** query shape, and
`20260914140000_admin_connection_role` already grants `app_admin` SELECT on **`Load`** and on
**`GPSLocation`** *for exactly this path*. So:

- **(a) a narrow `SECURITY DEFINER` resolver `token → tenantId`, then everything tenant-scoped.** The
  most principled shape. Cost: it is DDL, therefore a migration, therefore staging/production drift
  this task would then own — and it would create a **second mechanism** for a lookup that already has
  an approved one, three files apart, which is the failure mode this repo names over and over.
- **(b) route the page to `getAdminDb('public shipment tracking lookup')`,** the existing reason, the
  existing grants, no new DDL and no new `AdminReason`. This is not a new decision: it is **applying
  the decision already made and reviewed for the same statement**, and leaving the page and its API
  twin disagreeing is itself a defect. Cost, stated rather than buried: `app_admin` bypasses RLS, so
  `unmigrated-path-tripwire.md` §8 item 2 applies — routing this path removes it from the tripwire's
  reach. It needs an `ADMIN_ALLOWLIST` entry (rule 2 of R6) and a per-file call count.
- **(c) leave it and report.** Correct only if the production count is 0.

**Default to (b) if the production count is non-zero, and defend it in the report on the twin and the
existing grants.** If the executor concludes otherwise, the report must say why a tenant-scoped path
cannot serve it and why a second mechanism beats reusing the approved one.

Whichever is chosen: the page's `gPSLocation.findFirst` must move with it — the API twin does that read
inside a `set_config('app.bypass_rls','on', TRUE)` transaction, and `app_admin` already holds SELECT on
`GPSLocation`, so on (b) it moves to the same client. Do not leave one of the page's two reads on the
bare client.

**Measuring it.** `--surfaces606` cannot drive this row today (0 rows). Seed **one** disposable legacy
`Load` with a `trackingToken` on the privileged staging connection, scoped to OWNER_A's tenant (quick-605's
trap: "the first row in the table" belonged to the other tenant and the page answered 404 — a
measurement of the id the script chose). Drive the page **with no session at all**. Assert 200 and the
load number in the body. Then **hard-delete the probe row and assert zero survive.** If the seed cannot
be arranged, the row stays `NOT_MEASURED` — R3, never folded into pass.

**6b — `carrier-auto-dispatch` (failure 3): the fixture, and the product finding underneath it.**

The 500 is `Error: Template has no recurrenceRule — nothing to generate`, raised by
`generateDispatches` for a seeded route template with `autoGenerateDaysAhead > 0` and no
`recurrenceRule`. quick-604 classified it `SOMETHING_ELSE` / `SQLSTATE_UNRECOVERED` correctly — no
statement was refused — and §8 item 10 records it as **a `NOT_INVOKED` in all but name**: the route
never reached its database work, so its tenant-scoped statements have never been measured at all.

Correct the **staging fixture** so the route can be driven: give the seeded template a valid
`recurrenceRule`, or set `autoGenerateDaysAhead = 0`. Prefer fixing `scripts/seed-staging.ts` so the
correction is reproducible rather than a one-off UPDATE; apply the same correction to the existing
staging row on the privileged connection. Then re-run the row and **report what is underneath** — that
is the actual result here, and it may be a new failure, which is a finding and not a regression.

**Report, do not fix:** the product permits a template with `autoGenerateDaysAhead > 0` and no
`recurrenceRule` (quick-521 lowered that floor to 0), and the cron 500s on it. That is a real defect
with a real owner and it is not this task's.
  </action>
  <verify>
The production `Load.trackingToken` count is recorded in evidence with its exact value. If (b) was
taken: `ADMIN_ALLOWLIST` carries `app/track/[token]/page.tsx` with a call count, the allowlist test
passes and its pre-entry RED is captured. `--surfaces606` row for `/track/[token]` carries a real
verdict or an explicit `NOT_MEASURED` with the reason. `SELECT count(*) FROM "Load" WHERE
"trackingToken" LIKE '606-probe%'` on staging = 0, asserted. `carrier-auto-dispatch` re-run carries a
fresh verdict and the report states what surfaced behind the fixture error. `npx tsc --noEmit` exits 0,
probed per R8.
  </verify>
  <done>
`/track/[token]` has a decision backed by a production liveness count and defended against the two
alternatives, or is reported as not-live. `carrier-auto-dispatch` is driven past its fixture error and
whatever lies behind it is named.
  </done>
</task>

<task type="auto">
  <name>Task 7: Re-run, re-derive, close the ledger, write the report</name>
  <files>
apps/web/scripts/audit/604-classify.ts
apps/web/tests/security/606-report-integrity.test.ts
docs/audits/app-user-failure-remediation.md
.planning/quick/606-fix-the-eleven-measured-app-user-failure/evidence/
  </files>
  <action>
**The closing numbers come from a RE-RUN, never from arithmetic on the old table.**

1. **Restart the server** per R11 (both variables exported, `:5432`, refs logged, `pg_stat_activity` on
   both databases before and after). A dev server that has watched this many file changes is not a
   clean instrument — and if any route reports missing work that is on disk, that is a poisoned
   Turbopack cache before it is a regression: stop the server, delete `apps/web/.next`, restart,
   **re-run** (never assume).

2. **Re-run `604-click-through.ts --surfaces606`** over the full fifteen rows in one pass, into this
   task's evidence directory against its own server log. **The harness's own JSON is the source** for
   every number in the report.

3. **Extend `604-classify.ts` additively** with `--in <click.json> --out <dir>` so it can classify this
   task's artefact. Defaults unchanged; quick-604's `06-classification.json` / `.md` byte-identical
   (assert by sha256). Re-derive the five category counts and **re-assert the equality**: the failure
   count derived independently from the verdict fields
   (`entries.filter(v === 'fail').length + writes.filter(v === 'SILENT_NO_OP' || v === 'REFUSED').length`),
   never read from the classification's own header, must equal the category sum. Keep `TC001` detection
   **by code, never by message prose**. Keep the live `pg_policy` query that separates
   `RLS_DENIAL_SATISFIABLE` from `RLS_DENIAL_NO_POLICY`, and **do not assert either where it was not
   tested**.

4. **`tests/security/606-report-integrity.test.ts`** — a NEW file over THIS task's artefacts; do not
   modify `604-report-integrity.test.ts`, whose inputs must stay untouched. Assert: the sum equality;
   that every row carries a verdict; that `NOT_MEASURED` and `LATENT` rows each carry a reason and are
   **never merged into pass or fail**; and the anti-vacuity floor (a minimum row count, so an empty
   artefact cannot pass). **Witness it RED** by decrementing one count, quote the failure, revert.

5. **Close the ledger.** `604-survey.ts --close`. Expect **156 / 183 / `20260914170000_…` unchanged** —
   unchanged is the proof production was never written, even though this task committed two migration
   files. Record the `.env` sha256 pair the way §1 does.

6. **The finishing gates**, each with its artefact:
   - `npm run audit:rls-policy-drift` against **staging** reports **zero** (body-level detector).
   - `npm run build` succeeds.
   - Full `apps/web` suite: **same reporter both sides**, compare the failing-file set **BY NAME**, in
     both directions — a count comparison alone misses a swap. The stated baseline is ~**2097** tests /
     **64** failed / **18** failing files; **re-measure it rather than trusting it** (quick-561: three
     consecutive tasks published a baseline that measured something other than the tree they thought).
     Take the BEFORE **in the main tree** by `git checkout <base> -- <this task's touched files>`, not
     in a `git worktree` — a worktree does not carry the untracked `apps/web/.env.local` and measures a
     different tree (quick-567). Stop `next dev` first. **`--reporter=basic` does not exist in vitest 4
     and exits 0 having run ZERO tests** — a run whose output shows no `Test Files … | Tests …` summary
     is not a green run. Take the AFTER **after the last code commit** (quick-561).
   - `npx tsc --noEmit` exits 0, probed per R8, probe deleted.
   - `npx eslint` — **NOT RUN, NOT CLAIMED.** State the reason (quick-562: no working lint entry point).
   - If `wrapper-countdown.json` goes red on `filesScanned`, regenerate it and **inspect and quote the
     diff**, confirming all four protected counts (`unmigratedUnits`, `unmigratedCallSites`,
     `withTenantContextCallSites`, `filesWithUnmigratedUnits`) are byte-identical. R4 — a moved
     protected count is a scope breach, not a re-baseline.
   - `rls-policy-replay.test.ts` fails **pre-existing** (434 vs 403). Confirm with
     `git diff --name-only` over the migration corpus that this task cannot have caused it; report, do
     not fix.

7. **Write `docs/audits/app-user-failure-remediation.md`**, house style — the style of
   `staging-app-user-end-to-end.md`: every number cites the evidence file it came from; **every row is
   its own verdict and there is no summary row**; what was NOT measured is a section, not an omission.
   Required sections:
   - **§0 — what this fixed and what it deliberately did not.** Name R4 and R5 explicitly.
   - **§1 — production at open and at close**, field by field, plus staging preconditions.
   - **§2 — THE RE-VERIFICATION.** Task 1's table: quick-604 verdict vs 606 fresh verdict, with every
     change explained. **Rows 10 and 11 credited to quick-605 (`408a84ec`), not to this task.**
   - **§3 — `withTenantRLS`: what happens to it.** Explicitly: it **survives**; it is composed only
     inside `createTenantClient`; `getTenantPrisma`/`getTenantPrismaForOrg` set the GUC *and* apply it;
     the nine direct feature-code sites moved; the fence makes a new one a reviewable edit. **Quote the
     digest routes' own "DECORATIVE" comment verbatim** — somebody wrote the defect down and left it.
   - **§4 — per-failure: what it was, what was done, the fresh AFTER verdict.** All thirteen.
   - **§5 — the write paths and their counter-reads** (R2), including `purge-deleted`'s disposable-row
     proof.
   - **§6 — the two migrations**: the production no-op proof for each, the staging application, the
     hand-written ledger row and its read-back (R12), and the sentinel-row check.
   - **§7 — the guards**, with their **witnessed REDs quoted verbatim**.
   - **§8 — WHAT STILL FAILS AND WHAT IT NEEDS.** A plain statement, one row per item, each naming the
     concrete thing required — a column, a grant, a migration, a decision, an owner. Include at minimum:
     anything from the thirteen not closed; the latent `createTenantClient` inventory from Task 3; the
     `carrier-auto-dispatch` product defect from Task 6b; and the **standing caveat** that a pass on a
     `max: 1` pool may have inherited a GUC an earlier scoped statement set
     (`unmigrated-path-tripwire.md` §8 item 7), so every `pass` should be read with it.
   - **§9 — gates**, as a table, each with its exact result and the probe that makes it believable.

8. **Corrections in place, dated**, if this task's measurements contradict another document —
   `staging-app-user-end-to-end.md` §7e and §8, `staging-environment.md` §2 are the likely ones. Correct
   in place with a dated note; do not silently supersede.

9. Update `.planning/STATE.md` and commit. **Do not push** — the user pushes.
  </action>
  <verify>
`606-classification.json`'s category sum equals the independently derived failure count, and
`606-report-integrity.test.ts` asserts it and was witnessed RED. `604-survey.ts --close` exits 0 at
156/183/head. `npm run audit:rls-policy-drift` reports zero against staging. `npm run build` succeeds.
The failing-file sets before and after are identical **by name in both directions**, with both counts
taken under the same reporter and both `Test Files … | Tests …` summary lines quoted. sha256 of
quick-604's four artefacts unchanged from Task 1. The report exists with all ten sections and §8 names
every remaining item and what it needs.
  </verify>
  <done>
Every closing number came from a re-run of the committed harness and a re-derivation by the committed
classifier. Production reads identically at close. The report states what still fails and what each
one needs, in plain words.
  </done>
</task>

</tasks>

<verification>
- Task 1's re-verification table, not quick-604's table, is the source for every carried-forward number.
- `grep -rn "withTenantRLS" apps/web/src` names no feature-code module.
- `tenant-mechanism-fence.test.ts` and the extended `admin-connection-allowlist.test.ts` both pass, and
  each has a verbatim witnessed RED in evidence.
- `--surfaces606` re-run: fifteen rows, each with its own verdict; no row folded into pass on the
  strength of an empty table.
- Both migrations applied to STAGING ONLY, each with a hand-written `_prisma_migrations` row read back
  on the privileged connection, each proven a no-op against production before being written.
- `604-survey.ts --close` exits 0: 156 / 183 / `20260914170000_activation_progress_congrats_shown_at`.
- quick-604's `04-click-through.json`, `04-server.log`, `05-writes.json`, `06-classification.json`
  byte-identical, by sha256, at open and at close.
- `npm run audit:rls-policy-drift` → zero against staging. `npm run build` → success.
- Suite failing-file set unchanged, compared BY NAME in both directions, same reporter both sides.
- `npx tsc --noEmit` → 0, probed per R8, probe deleted.
</verification>

<success_criteria>
1. Every one of the thirteen carries a fresh BEFORE verdict and a fresh AFTER verdict, both from the
   harness's own JSON.
2. The report states explicitly what happened to `withTenantRLS` — it survives, fenced, not deleted.
3. No policy was widened. No DDL right was granted to any runtime role. The one grant is SELECT on one
   table to `app_admin`.
4. Production was never written and reads identically at open and close.
5. Every write path touched carries a counter-read on a privileged connection.
6. §8 of the report states, in plain words, what still fails and what each one needs.
</success_criteria>

<output>
After completion, create
`.planning/quick/606-fix-the-eleven-measured-app-user-failure/606-SUMMARY.md`.
</output>
