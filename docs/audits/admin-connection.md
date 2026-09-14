# The privileged admin connection — B5

**Date:** 2026-09-14
**Status:** BUILT ON STAGING ONLY (`wyixpgunnjmzguhggocz`). Production
(`oqdhberkghtnszrkdvfm`) is untouched — no migration applied, no role created, no
`DATABASE_URL_ADMIN` set anywhere for production. `DATABASE_URL` is unchanged on both
databases. No part of the `app_user` cutover was performed.
**Predecessor:** `docs/audits/bypass-replacement-design.md` §3.2, §5 checklist item **B5**.
**This task:** quick-600. Manifest: `.planning/quick/600-build-the-privileged-admin-connection-b5/ROUTING-MANIFEST.md`.

---

## 1. Why `app_admin`, and not `postgres`

`postgres` (today's `DATABASE_URL`) is far more than "a role that bypasses RLS": it carries
`rolcreaterole=true`, `rolcreatedb=true`, `pg_signal_backend`, `pg_read_all_data`, and membership
in `{app_user, service_role, authenticated, anon, supabase_privileged_role, ...}`. The admin
connection this task builds needs `BYPASSRLS` plus DML on the tables the routed paths touch, and
nothing else.

**The decisive reason is the boot guard.** With `postgres` on the admin pool, after a future
cutover `DATABASE_URL_ADMIN` and today's `DATABASE_URL` would be the SAME credential —
`current_user` identical on both pools, so nothing could distinguish a correct deployment from one
where `DATABASE_URL` was mistakenly pointed at the admin string. **A naming convention is not a
control.** With a dedicated role, `getAdminDb`'s two-direction boot guard becomes a real assertion:
the admin pool must report `current_user = 'app_admin'` AND `rolbypassrls = true`; the tenant pool
must report a DIFFERENT `current_user` (weak check, assertable today) and, once
`DB_ROLE_EXPECT_TENANT_ROLE` is armed post-cutover, must equal that exact role with
`rolbypassrls = false` (strict check).

It is also separately revocable (`ALTER ROLE app_admin NOLOGIN`) without touching whatever role
migrations themselves run as, and separately visible in `pg_stat_activity` and the Supabase logs —
`postgres` traffic today is everything, so nothing there is currently attributable to "the
privileged surface" as opposed to "the app".

---

## 2. The grant scope — GRANTs are the ONLY control left

`app_admin` has `BYPASSRLS`, so **policies do not constrain it at all.** GRANTs are the entire
remaining control surface, which is why the list is explicit, alphabetised, and per-table narrow —
never `GRANT ALL` and never `ALL TABLES IN SCHEMA public`.

17 tables, least privilege per routed site (see `ROUTING-MANIFEST.md` for the exact
site-to-table-to-operation mapping):

```
AppEvent                     INSERT, SELECT
AutomationRun                SELECT, INSERT, UPDATE
DriverInvitation             SELECT
GPSLocation                  SELECT
Load                         SELECT
NotificationTemplate         SELECT   -- found via testing, see §5
PlaybookInstance             SELECT
StepInstance                 SELECT
Subscription                 SELECT, UPDATE
SupportTicket                SELECT, UPDATE
SysAdminInvoice               SELECT, INSERT, UPDATE
SysAdminInvoiceItem           SELECT, INSERT, DELETE
Tenant                        SELECT, INSERT, UPDATE, DELETE
TenantNotificationSettings    SELECT, INSERT   -- found via testing, see §5
TicketMessage                  SELECT, INSERT
Truck                          SELECT
User                           SELECT
```

**Deliberately excluded, and why:**
- `GRANT ALL` on any table — the whole point is a countable, narrow surface.
- `ALTER DEFAULT PRIVILEGES` — a table added later must NOT be automatically reachable; adding an
  admin path is always its own migration.
- `CREATE` on schema `public` — `app_admin` never creates objects.
- Any role membership — no `GRANT app_user TO app_admin` or the reverse.
- `LOGIN` and any password — granted out of band, by a human, never in a migration file.
- `_prisma_migrations`, `"Plan"`, `"Promo"` — untouched by any routed site.
- `GRANT USAGE, SELECT ON SEQUENCE ...` — checked via `information_schema.columns.column_default
  LIKE 'nextval%'` over the full table union; every id in this set is cuid/uuid, none is a
  serial/identity column, so no sequence grant is needed anywhere.

---

## 3. What `getAdminDb(reason)` is, and is not

`apps/web/src/lib/db/admin-prisma.ts` — a **second, separate module**, deliberately not an
addition to `prisma.ts`:

- Second `Pool` from `process.env.DATABASE_URL_ADMIN`, `max: 1`, lazily instantiated on first
  `getAdminDb()` call.
- **No `pool.on('connect', ...)` tenant-GUC initialiser** — a bypassing connection has no use for a
  tenant GUC, and copying the initialiser would make the two pools look interchangeable, which is
  exactly what this module exists to prevent.
- `getAdminDb(reason: AdminReason)` — `reason` is required and typed over a closed string-literal
  union (`lib/db/admin-reasons.ts`); calling with no argument or an unrecognised literal is a
  **compile** error, not a runtime check (probed and demonstrated in quick-600's Task 2).
- Logs every call at `info` (`logger.info('[admin-db] privileged query', { reason })`) — never
  `warn`, which would fire `Sentry.captureMessage` on every routine call.
- `adminPrisma` (the client itself) is **never exported** from the module, under this name or any
  other. The only door out is `getAdminDb`.

**The NOT-list, restated because a comment is not a control:** it does not set, read or clear
`app.current_tenant_id`; it does not apply `withTenantRLS`; it must never be reachable from a
request path that already has a tenant (that's `getTenantPrismaForOrg`'s job) — **and the import
allowlist test is what enforces that, not this sentence.**

---

## 4. The two-direction boot guard

`DB_ROLE_ASSERT` — `off` (default) | `warn` | `enforce`. `off` skips the query entirely (a missing
`DATABASE_URL_ADMIN` must not break every request that never touches an admin path). `warn` runs it
and logs a failure without throwing. `enforce` throws. `apps/web/.env.staging` sets `enforce`.

- **Admin direction — always assertable, pre- and post-cutover:** `current_user = 'app_admin'` AND
  `rolbypassrls = true`.
- **Tenant direction — pre-cutover (weak, assertable today):** `current_user <> 'app_admin'` — the
  one thing checkable while `DATABASE_URL` is still `postgres`, and precisely the mistake a naming
  convention cannot catch.
- **Tenant direction — post-cutover (strict, armed by `DB_ROLE_EXPECT_TENANT_ROLE`):**
  `current_user` equals the configured role (will be `app_user`) AND `rolbypassrls = false`.

Memoised once per process; awaited by `getAdminDb`'s first call and by `getTenantPrismaForOrg`'s
first call (`lib/context/tenant-context.ts`), so the tenant-direction half runs on ordinary
tenant-scoped traffic too, not only when an admin path happens to fire first.

---

## 5. Found via testing, not anticipated by the static read of application code

`ROUTING-MANIFEST.md` was built by reading every candidate site by hand. Two grants it could not
have predicted were found only by running Task 3's both-directions matrix for real, on staging:

`INSERT INTO "Tenant"` (the `sysadmin tenant create` routed site) fires an EXISTING `AFTER INSERT`
trigger, `trg_seed_tenant_notification_settings` (shipped in
`20260514200001_add_notification_system`, long before this task). It is not `SECURITY DEFINER`, so
it runs with the INVOKING role's privileges — `app_admin`'s. The trigger function reads
`"NotificationTemplate"` and does `INSERT ... ON CONFLICT ("tenantId","triggerKey") DO NOTHING`
into `"TenantNotificationSettings"`. `app_admin` had none of the three grants this needs
(`NotificationTemplate` SELECT; `TenantNotificationSettings` both SELECT — required by the
`ON CONFLICT` clause independent of INSERT — and INSERT), so `S10 — Tenant create` and
`S12 — Tenant DELETE by id` (which also creates a throwaway tenant to isolate the DELETE question
from an unrelated `User_tenantId_fkey` constraint) both failed on the first real run with
`42501 permission denied for table TenantNotificationSettings`. Fixed by adding the three grants
(migration §4), re-verified green. **A clean migration apply proves nothing about a trigger's own
permission needs** — only a real exercise of the statement does.

---

## 6. The production runbook — who does what, and when

**This task did none of the following.** They are named so the person who eventually does this has
a checklist, not a guess:

1. Apply `apps/web/prisma/migrations/20260914140000_admin_connection_role/migration.sql` to
   **production**, via `node scripts/migrate.mjs` with both `DIRECT_URL` and `DATABASE_URL` pinned
   to the **production** connection string (never staging's), per the established discipline
   (DEC-17).
2. A human runs, **out of band, never in a migration file**:
   `ALTER ROLE app_admin LOGIN PASSWORD '<minted for production>';` against production directly.
3. That human sets `DATABASE_URL_ADMIN` in **Vercel Production and Preview** environment variables
   — a **port 5432, session-mode** connection string
   (`postgresql://app_admin.<production-ref>:<password>@<pooler-host>:5432/postgres`), the same
   route migrations use. Never port 6543/pgbouncer — this pool is `max: 1` and long-lived per the
   capacity decision below.
4. Confirm with a read-back: `SELECT current_user, (SELECT rolbypassrls FROM pg_roles WHERE
   rolname=current_user)` over the new connection string returns `app_admin` / `true`, exactly as
   this task verified on staging.
5. `DB_ROLE_ASSERT` stays `off` in production until this whole checklist item is trusted; flipping
   it to `warn` first, observing logs, then `enforce`, is the recommended order — never `enforce`
   on the first deploy of a new env var.

**The production value's shape, never its value:** `postgresql://app_admin.oqdhberkghtnszrkdvfm:
<REDACTED>@<pooler-host>:5432/postgres`. The password lives only in Vercel's encrypted environment
variable store — never in git, never in a log line (every place this task prints a connection
string masks the credential segment).

---

## 7. The capacity decision

Both pools are `max: 1`. A warm lambda that touches ANY admin path draws **two** Supabase pooler
slots instead of one for the lifetime of that warm instance — this pool's and `prisma.ts`'s.
`max_connections` is 60 on both staging and production. This pool is instantiated **lazily**, on
the first `getAdminDb()` call in a given process, so a lambda that never touches an admin path still
draws exactly one slot, unchanged from today. Stated here as an explicit decision taken up front,
not discovered later as a production incident.

---

## 8. The allowlist growth rule

A new admin call is **three deliberate edits**, never one:

1. A new `AdminReason` string-literal member in `lib/db/admin-reasons.ts` — describing what the
   path DOES, never that it "needs admin" or is a "bypass".
2. A new (or updated) entry in `ADMIN_ALLOWLIST` in
   `tests/security/admin-connection-allowlist.test.ts`, with its own `getAdminDb(` call count.
3. A migration, if the new call touches a table `app_admin` has no grant on yet.

That the count can only go up by an explicit, reviewable edit — never by an import alone — is the
whole guarantee. It has been **proven to fire red** on both a deliberate out-of-allowlist import and
a deliberate alias; see `evidence/02-allowlist-gate-fires.md`.

---

## 9. What still has no route after this lands

Named individually, with the checklist item that owns each:

- **Both `generateTicketNumber` copies** (`actions/support-tickets.ts:98`,
  `api/mobile/support/ticket/route.ts:39`) — **B7**. An admin connection is the wrong fix here (it
  would paper over a data-model problem); the correct fix is `CREATE SEQUENCE
  support_ticket_number` + `GRANT USAGE` to `app_user`, which removes the cross-tenant read AND the
  live race between the two copies in one change. They still break silently at the `app_user`
  cutover — reads under an empty GUC return zero rows, not an error, so `generateTicketNumber`
  would issue `TKT-0001` for every new ticket, colliding immediately.
- **`lib/auth/supabase.ts:164`'s `getCurrentUser` sysadmin branch** — **B8**. 37 of 38 production
  accounts already resolve their tenant from the JWT claim with no database call; only the single
  `isSystemAdmin` account needs an admin-connection fallback, and building that safely means
  restructuring a function with 9 call-chain units reaching it (`wrapper-migration-scope.md` §1b) —
  a bigger, separate task.
- ~~**`lib/onboarding/provision-tenant.ts:36` and its repository twin
  (`lib/db/repositories/tenant.repository.ts:33`)** — **B3 / §4.1**~~ — **CLOSED by quick-601, and
  deliberately NOT routed onto the admin connection.** The paragraph below described a GUC that had
  to be "unset before the insert and set immediately after"; that ordering is impossible, because
  the `AFTER INSERT` trigger runs inside the same statement and needs the GUC already set. quick-601
  dissolved the constraint instead — `tenant_bootstrap_insert`'s body became
  `id = current_tenant_id()` and the application mints the tenant uuid, so the GUC is declared
  BEFORE the insert and every check on the path agrees. The two global probes became narrow
  `SECURITY DEFINER` functions (plus a third the design never named,
  `generateVehicleIds` on the hydration path), returning one scalar each. **An admin connection was
  rejected for this path specifically:** sign-up is the highest-traffic unauthenticated surface in
  the product, and a function that returns one boolean leaks strictly less than a `BYPASSRLS`
  client. See `docs/audits/provisioning-path.md`.

  *Original text, for the record:* The two global bootstrap
  probes (email uniqueness, slug uniqueness) need to be hoisted onto the admin connection AND the
  `Tenant` insert needs its GUC set precisely between "unset" (before insert, for
  `tenant_bootstrap_insert`) and "set to the new tenant's id" (immediately after, for every
  subsequent statement in the same transaction) — restructuring the live sign-up flow's transaction
  boundary is out of this task's scope and reported rather than half-done.
- **`api/track/[token]/route.ts`'s GPS lookup** (today's second bypass statement in that file,
  filtered by `truckId` only, no tenant predicate at all) — not one of the design doc's named 7
  BOOTSTRAP sites; design §1.1's claim that it "needs nothing" because it reuses `load.tenantId` is
  **stale** against today's code. Reported as a design-doc correction, not fixed.
- **`api/cron/automations/route.ts`'s four `candidateQuery()` reads** (`activationProgress.findMany`
  x3, `subscription.findMany` x1) — bare, unflagged, genuinely cross-tenant reads with no
  `@bypass_rls` marker at all, so outside the 211-site grep this whole migration is scoped to. They
  will return zero rows silently under `app_user` with an empty GUC, breaking every cron-driven
  activation nudge at cutover with no error. Belongs with A1/A7's re-verification.
- **The five DECORATIVE loop-body statements** left deliberately untouched inside
  `workflow-digest/route.ts` (4) and `lib/automations/evaluator.ts` Path 1 (1) — `getTenantPrismaForOrg`
  is the correct destination for these (tenant already known), and A2's rule (delete the bypass line
  in the same commit that wraps the unit of work in `withTenantContext`) governs when, not this task.

---

## 10. What this task deliberately did NOT do

- No cutover of any kind. `DATABASE_URL` is byte-identical to before this task, on both databases.
- Production was never connected to for a write — every instrument refuses on the production
  project ref before issuing a single statement.
- No policy was added, dropped, or weakened. `bypass_rls_policy`: 86 before, 86 after, identical
  sorted table list (`evidence/00-baseline.md` vs the post-apply read-back).
- `bypass_rls_policy` itself was never touched — every migration statement here is `CREATE ROLE` /
  `ALTER ROLE` / `GRANT`, nothing else.
- No credential reached git. The migration creates `app_admin` `NOLOGIN`; the password was minted
  by this task's executor for staging only, set via one out-of-band `ALTER ROLE ... LOGIN PASSWORD`
  statement never written to a file, and the resulting connection string lives only in the
  gitignored `apps/web/.env.staging`.
