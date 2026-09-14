# quick-600: Build the privileged admin connection (B5) — Summary

**One-liner:** A dedicated `app_admin` role (BYPASSRLS, not `postgres`) plus `getAdminDb(reason)` on
a second connection pool, a type-checked closed reason union, an allowlist gate proven to fire red
and go green, and both-directions staging evidence for every routed site — built and verified on
staging only, with 16 of 21 CROSS_TENANT sites, all 6 `Tenant` sysadmin writes, 4 of 7 BOOTSTRAP
sites and 22 real sysadmin-billing statements now routed off the `bypass_rls` no-op and onto a
countable, reviewable privileged surface.

**Date:** 2026-09-14
**Scope:** `docs/audits/bypass-replacement-design.md` §5 checklist item **B5**. STAGING ONLY
(`wyixpgunnjmzguhggocz`). No cutover. `DATABASE_URL` unchanged on both databases. Production
(`oqdhberkghtnszrkdvfm`) was never connected to for a write.

---

## The role decision, as built

`app_admin` — `BYPASSRLS`, `NOLOGIN` (LOGIN + password set out of band, never in git), created
idempotently in `apps/web/prisma/migrations/20260914140000_admin_connection_role/migration.sql`.
Not `postgres`: the decisive reason is the two-direction boot guard, which needs a role
`current_user` can actually distinguish from the tenant connection — with `postgres` on both pools,
`DATABASE_URL_ADMIN` mistakenly pointed at `DATABASE_URL` would be undetectable by construction.

**Exact grants held** (17 tables, least privilege per routed site; `app_admin` bypasses RLS
entirely so GRANTs are the only remaining control):

```
AppEvent                     INSERT, SELECT
AutomationRun                SELECT, INSERT, UPDATE
DriverInvitation             SELECT
GPSLocation                  SELECT
Load                         SELECT
NotificationTemplate         SELECT                    -- found via testing, see below
PlaybookInstance             SELECT
Subscription                 SELECT, UPDATE
StepInstance                 SELECT
SupportTicket                SELECT, UPDATE
SysAdminInvoice               SELECT, INSERT, UPDATE
SysAdminInvoiceItem           SELECT, INSERT, DELETE
Tenant                        SELECT, INSERT, UPDATE, DELETE
TenantNotificationSettings    SELECT, INSERT           -- found via testing, see below
TicketMessage                  SELECT, INSERT
Truck                          SELECT
User                           SELECT
```

Deliberately excluded: `GRANT ALL`, `ALTER DEFAULT PRIVILEGES`, schema `CREATE`, any role
membership, `LOGIN`/password, `_prisma_migrations`, `Plan`, `Promo`, sequences (none needed — every
id in the union is cuid/uuid, verified via `information_schema.columns`).

**Two tables found only by running the verification matrix, not by reading application code:**
`NotificationTemplate` (SELECT) and `TenantNotificationSettings` (SELECT + INSERT).
`INSERT INTO "Tenant"` fires an existing, non-`SECURITY DEFINER` `AFTER INSERT` trigger
(`trg_seed_tenant_notification_settings`, shipped in Phase 41) that runs as the invoking role —
`app_admin` — and needs both. `S10 — Tenant create` and `S12 — Tenant DELETE by id` both failed
`42501 permission denied for table TenantNotificationSettings` on the first real run; fixed by
adding the grants (migration §4), re-verified green. Full account:
`docs/audits/admin-connection.md` §5.

---

## Verified dependent list — final counts against expected 4 / 6 / 21

| Category | Expected | Found | Explanation of every difference |
| --- | --- | --- | --- |
| Sysadmin billing **files** | 4 | 4 | Exact file match. But the "4" was always FILES, not statements — the real statement count across those 4 files is **22** (18 in `sysadmin-invoices.ts` alone, 1 in `billing/[id]/page.tsx`, 1 in `mark-overdue-invoices/route.ts`, 2 in `send-sysadmin-invoice.ts`), reported in full rather than reinterpreted to force a match. A 5th file, `(owner)/actions/subscription.ts`, also touches `SysAdminInvoice` and is the plan's named **CORRECT** candidate — moved to `getTenantPrismaForOrg`, never routed. |
| `"Tenant"` write **sites** | 6 | 6 | Exact match, all 6 at their named line numbers, all `ROUTE`. No difference. |
| CROSS_TENANT **sites** | 21 | 21 | Exact match at every named line. **16 ROUTE, 3 CORRECT (`workflow-notifications:81`, `:96`, `evaluator.ts:204`, all reclassified because the tenant is already in hand from the row a sweep just read — the plan explicitly pre-flagged 2 of these and asked this task to check the other one "for the same shape"), 2 LEAVE (`generateTicketNumber` × 2, decision already taken for B7).** `auto-close-tickets:53` was checked against the same shape and found NOT to match it (a batch `updateMany` naming ids across potentially different tenants in one statement has no single tenant to hang a GUC off) — stays `ROUTE`. |

**Additionally found, outside the original 4/6/21, each given its own verdict and reported rather
than silently folded in:** the 4 admin-reachable BOOTSTRAP sites + 3 left open (§4.1/B8), the
`cron/automations/route.ts:179` site Fact #9 flagged as missing from the design snapshot (CORRECT —
same known-tenant shape), `extendTrial`'s unflagged setup read (routed alongside its transaction,
same unit of work), `createTenant`'s `DriverInvitation` write (left alone, out of the named 6),
`accept-invitation`'s two extra bypass calls and `track/[token]`'s GPS call (left alone, DECORATIVE
or design-doc-stale, not part of the named 7), and 5 measured decorative loop-body statements
(`workflow-digest.ts` × 4, `evaluator.ts` Path-1 create × 1) left untouched against the design
doc's rounded "6" estimate. Full per-site accounting:
`.planning/quick/600-build-the-privileged-admin-connection-b5/ROUTING-MANIFEST.md`.

---

## The allowlist gate — verbatim failure output

Full evidence, both violations, both reverts, in
`.planning/quick/600-build-the-privileged-admin-connection-b5/evidence/02-allowlist-gate-fires.md`.
Excerpt — the out-of-allowlist import:

```
 ❯ tests/security/admin-connection-allowlist.test.ts (9 tests | 1 failed) 3358ms
     × allowlist equality, BOTH directions — importers of admin-prisma exactly equal ADMIN_ALLOWLIST 1148ms
 FAIL  tests/security/admin-connection-allowlist.test.ts > quick-600 (B5) — getAdminDb import allowlist > allowlist equality, BOTH directions — importers of admin-prisma exactly equal ADMIN_ALLOWLIST
AssertionError: these files import lib/db/admin-prisma but are NOT in ADMIN_ALLOWLIST: lib/logger.ts: expected [ 'lib/logger.ts' ] to deeply equal []
 Test Files  1 failed (1)
      Tests  1 failed | 8 passed (9)
```

The alias violation:

```
 ❯ tests/security/admin-connection-allowlist.test.ts (9 tests | 1 failed) 2897ms
     ✓ allowlist equality, BOTH directions — importers of admin-prisma exactly equal ADMIN_ALLOWLIST  841ms
     × no aliasing — import { getAdminDb as x } or { adminPrisma as x } anywhere in src 857ms
AssertionError: app/api/cron/mark-overdue-invoices/route.ts: getAdminDb aliased: expected [ Array(1) ] to deeply equal []
 Test Files  1 failed (1)
      Tests  1 failed | 8 passed (9)
```

Note the "allowlist equality" assertion stayed **green** on the alias run (the file was already
allowlisted) — proof the two rules fire independently, not as one check triggering twice. Both
reverted and re-confirmed 9/9 green.

**Compile-time reason enforcement, also demonstrated:**
- `getAdminDb()` with no argument: `error TS2554: Expected 1 arguments, but got 0.`
- `getAdminDb('this is not a real reason')`: `error TS2345: Argument of type '"this is not a real
  reason"' is not assignable to parameter of type '"compliance digest tenant sweep" | ... | 20 more
  ... | "sysadmin invoice email lookup"'.`

---

## Both-directions evidence table

Full matrix (22 statement shapes, one row per DISTINCT SQL SHAPE rather than one row per individual
`getAdminDb(` call site — **a deliberate, documented consolidation**: several call sites inside one
routed reason issue byte-identical SQL against the same table — e.g. `suspendTenant` and
`reactivateTenant` both run `UPDATE "Tenant" SET ... WHERE id = $1`; the 4 digest crons run the
exact same `Tenant` sweep. What a grant or policy says about one instance it says about every
byte-identical instance. Every call site sharing a shape is named in that shape's row):
`.planning/quick/600-build-the-privileged-admin-connection-b5/evidence/03-routed-sites.md` and
`.json`. **All 22/22 PASS.**

| Shape | Direction A (admin) | Direction B (tenant A naming tenant B) |
| --- | --- | --- |
| S1 Tenant active-tenant sweep (4 digests + reminders) | rows spanning ≥2 tenants | 0 rows |
| S2 PlaybookInstance active-tenant sweep | rows spanning ≥2 tenants | 0 rows |
| S3 StepInstance overdue sweep | rows spanning ≥2 tenants | 0 rows |
| S4 PlaybookInstance blocked sweep | rows spanning ≥2 tenants | 0 rows |
| S5 SupportTicket batch close (id IN (...)) | 2 rows affected | 0 rows |
| S6 AutomationRun create for arbitrary tenant | 1 row created | `42501` (WITH CHECK) |
| S7 AutomationRun status update by id | 1 row affected | 0 rows |
| S8 Subscription update by tenantId (extendTrial) | 1 row affected | 0 rows |
| S9 Tenant listing, unfiltered | rows spanning ≥2 tenants | 0 rows |
| S10 Tenant create | 1 row created (after the found grants) | `42501` (bootstrap policy needs unset GUC) |
| S11 Tenant UPDATE by id (status/profile/settings, 4 call sites) | 1 row affected | 0 rows |
| S12 Tenant DELETE by id | 1 row (throwaway, dependent-free) deleted | 0 rows |
| S13 User+Tenant lookup by userId | 1 row | 0 rows |
| S14 DriverInvitation lookup by id | 1 row | 0 rows |
| S15 Load lookup by trackingToken | 1 row | 0 rows |
| S16 SupportTicket status update | 1 row affected | 0 rows |
| S17 TicketMessage create for arbitrary tenant's ticket | 1 row created | `42501` (measured, not assumed — see note below) |
| S18 TicketMessage thread read | 1 row | 0 rows |
| S19 SysAdminInvoice create for arbitrary tenant | 1 row created | `42501` |
| S20 SysAdminInvoice audit-trail read | 1 row | 0 rows |
| S21 SysAdminInvoice batch OVERDUE sweep | 1 row affected | 0 rows |
| S22 SysAdminInvoice+User owner lookup | 1 row | 0 rows |

**S17 was run as a real probe, not assumed.** `TicketMessage` carries no tenant column of its own;
whether a cross-tenant insert is refused depends entirely on whether a policy subqueries
`SupportTicket.tenantId`. Measured: it does — the cross-tenant attempt raised `42501 new row
violates row-level security policy for table "TicketMessage"`. Reported as evidence, not inferred
from the table's shape.

---

## What still has no route after this lands, named individually

- **Both `generateTicketNumber` copies** (`actions/support-tickets.ts:98`,
  `api/mobile/support/ticket/route.ts:39`) — **B7.** Decision already taken by the plan: an admin
  connection would paper over the real fix, `CREATE SEQUENCE support_ticket_number` + `GRANT USAGE`.
  Still break silently at cutover (an empty-GUC read returns 0 rows, not an error, so
  `generateTicketNumber` would mint `TKT-0001` on every insert).
- **`lib/auth/supabase.ts:164`'s `getCurrentUser` sysadmin branch** — **B8.** 37 of 38 accounts
  resolve from the JWT with no DB call; only the sysadmin fallback needs admin, and building it
  safely needs the 9-call-chain-unit restructuring B8 owns, not this task.
- **`lib/onboarding/provision-tenant.ts:36` and its repository twin** — **B3 / §4.1.** The two
  global bootstrap probes need hoisting onto admin AND the `Tenant` insert's GUC needs setting
  precisely between unset (before insert) and set (immediately after, same transaction) — real
  transaction-boundary surgery on the live sign-up flow, reported rather than half-done.
- **`api/track/[token]/route.ts`'s second bypass statement** (GPS lookup, filtered by `truckId`
  only) — not one of the 7 named BOOTSTRAP sites; design §1.1's claim that it reuses
  `load.tenantId` and "needs nothing" is **stale** against today's code. Flagged as a design-doc
  correction, not fixed.
- **`api/cron/automations/route.ts`'s 4 `candidateQuery()` reads** — bare, unflagged, genuinely
  cross-tenant, outside the 211-site grep this whole migration is scoped to. Will return 0 rows
  silently under `app_user`, breaking every cron-driven activation nudge at cutover with no error.
- **5 DECORATIVE loop-body statements** left untouched (`workflow-digest.ts` × 4, `evaluator.ts`
  Path 1 × 1) — `getTenantPrismaForOrg` is correct for these; A2 governs when the bypass line comes
  out, not this task.

---

## Production runbook — who, where, what shape

Full checklist: `docs/audits/admin-connection.md` §6. Summary: a human (1) applies this migration to
**production** via `node scripts/migrate.mjs` with both env vars pinned to production, (2) runs
`ALTER ROLE app_admin LOGIN PASSWORD '<minted>'` out of band, directly against production, never in
a file, (3) sets `DATABASE_URL_ADMIN` in Vercel Production+Preview as a port-5432 session-mode
string, (4) confirms with a `current_user`/`rolbypassrls` read-back, (5) arms `DB_ROLE_ASSERT`
`off → warn → enforce` in that order, never straight to `enforce`. This task performed none of it —
production has no `app_admin` role at all.

---

## What this task deliberately did NOT do

- No cutover. `DATABASE_URL` byte-identical to before, both databases.
- Production never written — every instrument refuses on the production ref before any statement.
- No policy added, dropped, or weakened. `bypass_rls_policy`: 86 before, 86 after, identical sorted
  table list (`evidence/00-baseline.md` vs. the post-apply read-back). Every migration statement
  here is `CREATE ROLE` / `ALTER ROLE` / `GRANT` — zero `CREATE POLICY` / `DROP POLICY`.
- No credential in git. `app_admin` created `NOLOGIN`; password minted for staging only, set via one
  out-of-band `ALTER ROLE` statement, stored only in the gitignored `apps/web/.env.staging`. Grepped
  the staged diff for the minted string before every commit: zero hits.

---

## Deviations from the plan

### Auto-fixed issues (Rule 1/3 — blocking, found via testing)

**1. [Rule 3 — blocking] `app_admin` lacked grants two tables the code never showed on a static
read** — see "The role decision" above and `docs/audits/admin-connection.md` §5. Fixed by adding
`NotificationTemplate` (SELECT) and `TenantNotificationSettings` (SELECT, INSERT) to the migration
and re-applying the delta to staging; re-verified green (`evidence/03-routed-sites.json`, S10/S12).

**2. [Rule 3 — blocking] `tests/unit/auth/accept-invitation.test.ts` broke** after routing the
POST handler's invitation lookup onto `getAdminDb` — the test mocked `@/lib/db/prisma` only. Fixed
by adding a matching `vi.mock('@/lib/db/admin-prisma', () => ({ getAdminDb: vi.fn(async () => tx)
}))`, reusing the existing `tx` stub so every `tx.driverInvitation.findUnique.mockResolvedValue(...)`
in the file kept driving the route unchanged. Confirmed no other regressions via a full
`git stash`-clean baseline diff (`before-fail-files.txt` vs `after-fail-files.txt`) — this was the
only new failure introduced by this task's routing.

**3. [Rule 1 — bug, in my own new test] The boot-guard-shape test false-positived on its own
comment.** The first draft of `admin-connection-allowlist.test.ts`'s connect-initialiser check
matched the bare substring `pool.on('connect'`, which also appears in `admin-prisma.ts`'s own
explanatory prose. Fixed to match the real call shape (`pool.on('connect', (`), verified both
directions (present in `prisma.ts`, absent from `admin-prisma.ts`).

### None requiring a checkpoint

No Rule 4 (architectural) deviations. No auth gates encountered.

---

## Key files

**Created:**
- `apps/web/prisma/migrations/20260914140000_admin_connection_role/migration.sql`
- `apps/web/src/lib/db/admin-prisma.ts`
- `apps/web/src/lib/db/admin-reasons.ts`
- `apps/web/tests/security/admin-connection-allowlist.test.ts`
- `apps/web/scripts/audit/600-admin-verify.ts`
- `docs/audits/admin-connection.md`
- `.planning/quick/600-build-the-privileged-admin-connection-b5/ROUTING-MANIFEST.md`
- `.planning/quick/600-build-the-privileged-admin-connection-b5/evidence/` (00-baseline.md/.json,
  01-role-and-grants.json, 02-allowlist-gate-fires.md, 03-routed-sites.md/.json)

**Modified (routing + corrections):**
`apps/web/src/actions/support-tickets.ts`,
`apps/web/src/app/(admin)/actions/automations.ts`,
`apps/web/src/app/(admin)/actions/sysadmin-invoices.ts`,
`apps/web/src/app/(admin)/actions/tenants.ts`,
`apps/web/src/app/(admin)/billing/[id]/page.tsx`,
`apps/web/src/app/(owner)/actions/subscription.ts`,
`apps/web/src/app/api/auth/accept-invitation/route.ts`,
`apps/web/src/app/api/cron/auto-close-tickets/route.ts`,
`apps/web/src/app/api/cron/automations/route.ts`,
`apps/web/src/app/api/cron/digest-compliance-30day/route.ts`,
`apps/web/src/app/api/cron/digest-daily-driver/route.ts`,
`apps/web/src/app/api/cron/digest-weekly-owner/route.ts`,
`apps/web/src/app/api/cron/mark-overdue-invoices/route.ts`,
`apps/web/src/app/api/cron/send-reminders/route.ts`,
`apps/web/src/app/api/cron/workflow-digest/route.ts`,
`apps/web/src/app/api/cron/workflow-notifications/route.ts`,
`apps/web/src/app/api/track/[token]/route.ts`,
`apps/web/src/lib/automations/evaluator.ts`,
`apps/web/src/lib/context/tenant-context.ts`,
`apps/web/src/lib/db/repositories/tenant.repository.ts`,
`apps/web/src/lib/email/send-sysadmin-invoice.ts`,
`apps/web/tests/unit/auth/accept-invitation.test.ts`,
`docs/audits/bypass-replacement-design.md`, `.planning/STATE.md`, `CLAUDE.md`.

## Decisions

- `app_admin`, not `postgres` — the boot-guard argument, stated as decisive.
- Names diverge from the design doc where this plan said to: `DATABASE_URL_ADMIN` (not
  `ADMIN_DATABASE_URL`), `getAdminDb(reason)` (not `withAdminContext(reason, fn)`), `reason` typed
  over a closed `AdminReason` union rather than a plain `string`.
- Matrix consolidated to one row per statement SHAPE (22) rather than one row per call site (38) —
  documented, every call site named against its shape.

## Metrics

- **Duration:** ~5.5 hours (single session).
- **Tasks completed:** 3 of 3.
- **Files touched:** 21 modified, 8 created (excluding evidence subfiles).
- **Test suite:** 64 failed / 1826 passed / 56 skipped / 3 todo (1949 total) — identical to the
  `git stash`-clean baseline (64 / 1817 / 56 / 3, 1940 total) plus this task's 9 new passing tests.
  Zero regressions.
- **rls-isolation:** 156/156 passed, 4 files.
- **Policy drift:** exit 0, zero name drift, zero body drift.
- **`bypass_rls_policy`:** 86 before, 86 after, identical sorted table list. Total `pg_policy`: 183
  before, 183 after.
- **Build:** succeeded (Next.js 16.2.1, Turbopack). tsc: clean, probed twice (Task 2 and Task 3,
  each time confirming tsc reports the injected error before deleting the probe).

## Self-Check: PASSED

See below.
