# The provisioning path, statement by statement, under `app_user`

**Date:** 2026-09-14 · **Task:** quick-601 (B3 / `bypass-replacement-design.md` §4.1)
**Status:** MEASURED. Every verdict below was executed as `app_user` against **staging**
(`wyixpgunnjmzguhggocz`) inside `BEGIN … ROLLBACK`. Production was read (`SELECT` only) to confirm
policy and grant parity; production was never written.
**Predecessors:** `docs/audits/trigger-grant-sweep.md` · `docs/audits/bypass-replacement-design.md` §4 ·
`docs/audits/admin-connection.md` §9.

Line numbers in the **Before** table are against the tree at `63835e13` (the commit this task
started from). The **After** table names the same statements at their post-change lines.

---

## 0. Scope — what counts as "the provisioning path"

Three user-facing operations, in the order a new company meets them:

| Flow | Entry point | Bypass sites today |
|---|---|---|
| **Sign-up** | `apps/web/src/app/(auth)/sign-up/actions.tsx:50` `signUpAction` | 2 (`provision-tenant.ts:36`, `actions.tsx:232`) |
| **Email confirmation** | `apps/web/src/app/api/email-confirm/[token]/route.ts:25` `GET` | 1 (`route.ts:54`) |
| **Onboarding hydration** | `apps/web/src/app/onboarding/welcome/page.tsx:43` `WelcomePage` | 5 (`page.tsx:27,50,70`, `hydrate-tenant.ts:13,36`) |
| *(unreferenced twin)* | `apps/web/src/lib/db/repositories/tenant.repository.ts:26` `provisionTenant` | 1 (`:34`) |

**8 live bypass sites + 1 in an unreferenced method.** `TenantProvisioningRepository.provisionTenant`
has **zero callers** in the repository (`grep -rn "TenantProvisioningRepository"` returns the class
declaration and nothing else); its two siblings `findTenantByUserId` and `listAllTenants` were routed
onto the admin connection by quick-600 and are live. It is included because it is a `"Tenant"` INSERT
on the bare client and the new policy changes what it would do if it were ever called.

---

## 1. The two failures, measured

Both reproduced as `app_user` on staging with **no** `app.bypass_rls` and **no** tenant GUC, with two
active `NotificationTemplate` rows present so the trigger actually writes a row. Staging carries
**zero** `NotificationTemplate` rows in its normal state, which is why nothing here reproduces
without a fixture — the trigger's `INSERT … SELECT` inserts zero rows, and a `WITH CHECK` that is
never evaluated never fails.

| Probe | SQLSTATE | Message |
|---|---|---|
| `INSERT INTO "Tenant" (name, slug, "updatedAt") VALUES (…)` | `42501` | `new row violates row-level security policy for table "TenantNotificationSettings"` |
| `INSERT INTO "Tenant" (name, slug, "updatedAt") VALUES (…) RETURNING id` | `42501` | `new row violates row-level security policy for table "Tenant"` |
| the same `RETURNING` insert with `app.bypass_rls = 'on'` | — | **1 row** (today's live behaviour) |

**The sweep derived the first and did not have the second.** A `RETURNING` clause makes PostgreSQL
apply the table's **SELECT** policies as an insert-time check on the new row, in addition to the
INSERT policy's `WITH CHECK`. `"Tenant"`'s SELECT policy is `tenant_self_read`,
`USING (id = current_tenant_id())` — NULL when the GUC is unset, which is precisely the state
`tenant_bootstrap_insert` requires. The check runs **before** the `AFTER INSERT` trigger fires, so it
is reached first. The two probes above differ in nothing but the `RETURNING` clause and fail on
different tables, which is what discriminates the mechanism.

**Prisma's `tx.tenant.create()` always emits `RETURNING`.** Sign-up therefore fails one statement
earlier than `trigger-grant-sweep.md` §4 states, and on a different table.

This is what rules out making `seed_tenant_notification_settings()` `SECURITY DEFINER`: that closes
the second row of the table above and leaves the first untouched.

---

## 2. Before — every statement, current tree

`GUC` is the state of `app.current_tenant_id` at that instant. Verdict is under `app_user` **with the
bypass line deleted** — i.e. the state A2 reaches by a routine edit, and the state step 7 of the
cutover reaches unconditionally.

### 2.1 Sign-up — `provisionTenant`

One `prisma.$transaction` on the bare client. `apps/web/src/lib/onboarding/provision-tenant.ts`.

| # | Line | Statement | Table | Op | GUC | Verdict under `app_user`, no bypass |
|---|---|---|---|---|---|---|
| 0 | `:36` | `set_config('app.bypass_rls','on',TRUE)` | — | — | unset | the site being removed |
| 1 | `:40` | `tx.user.findFirst({ where: { email } })` | `User` | SELECT | unset | **0 rows, silently.** `tenant_isolation_policy` `USING ("tenantId" = current_tenant_id())` is NULL. A global email probe that can never see another tenant's row. Not an error — a defence that stops defending |
| 2 | `:44` | `bcrypt.hash` | — | — | — | no database |
| 3 | `:54` | `while (await tx.tenant.findFirst({ where: { slug } }))` | `Tenant` | SELECT | unset | **0 rows at the first iteration** → the loop exits immediately → the first colliding slug reaches the insert and hits `Tenant_slug_key`. `ERROR 23505` for any company whose name normalises to an existing slug |
| 4 | `:59` | `tx.tenant.create({...})` | `Tenant` | INSERT … RETURNING | unset | **`42501` on `"Tenant"`** — §1 row 2. `tenant_bootstrap_insert`'s `WITH CHECK` passes; the `RETURNING`-derived SELECT check against `tenant_self_read` does not |
| 4a | *(trigger)* | `trg_seed_tenant_notification_settings` → `SELECT t."triggerKey" FROM "NotificationTemplate"` | `NotificationTemplate` | SELECT | unset | **admitted.** RLS is off on this table; `app_user` holds `SELECT` |
| 4b | *(trigger)* | `INSERT INTO "TenantNotificationSettings" … ON CONFLICT DO NOTHING` | `TenantNotificationSettings` | INSERT | unset | **`42501`** — §1 row 1. `WITH CHECK ("tenantId" = current_tenant_id())` with `NEW."id" = NULL` → NULL → not true. Unreachable in practice because #4 fails first |
| 5 | `:77` | `tx.user.create({ data: { tenantId: tenant.id, … } })` | `User` | INSERT … RETURNING | unset | **`42501`.** Would pass with the GUC set to `tenant.id` |
| 6 | `:91` | `tx.plan.findFirst({ where: { key: 'starter' } })` | `Plan` | SELECT | unset | **admitted.** RLS off; `app_user` holds `SELECT` on **both** databases (re-read from `information_schema.role_table_grants` on staging **and** production for this task). `bypass-replacement-design.md` §4.1's `42501` for this row is **stale** |
| 6b | `:97` | `tx.promo.findFirst(...)` | `Promo` | SELECT | unset | **admitted.** RLS off; `SELECT` held on both |
| 6c | `:102` | raw `UPDATE "Promo" SET "redemptionCount" = …` | `Promo` | UPDATE | unset | **admitted.** RLS off; `UPDATE` held on both. §4.1's "`42501` … staging grants `SELECT` only" is **stale** |
| 7 | `:119` | trial-end arithmetic | — | — | — | no database |
| 8 | `:122` | `tx.subscription.create(...)` | `Subscription` | INSERT … RETURNING | unset | **`42501`.** Would pass with the GUC set |
| 9 | `:135` | `tx.activationProgress.create(...)` | `ActivationProgress` | INSERT … RETURNING | unset | **`42501`.** Would pass with the GUC set |
| 10 | `:145` | `generateEmailToken(tenant.id)` | — | — | — | no database; AES-GCM in process |

### 2.2 Sign-up — the caller's own write

`apps/web/src/app/(auth)/sign-up/actions.tsx`.

| # | Line | Statement | Table | Op | GUC | Verdict |
|---|---|---|---|---|---|---|
| 11 | `:232` | `set_config('app.bypass_rls','on',TRUE)` | — | — | unset | the site being removed |
| 12 | `:233` | `tx.appEvent.create({ data: { tenantId: result.tenantId, … } })` | `AppEvent` | INSERT … RETURNING | unset | **`42501`.** The tenant id is in hand (`result.tenantId`) — DECORATIVE, needs only the GUC. Wrapped in `try/catch` and logged as non-fatal, so it would fail **silently** |

### 2.3 Email confirmation

`apps/web/src/app/api/email-confirm/[token]/route.ts`. `verifyEmailToken` returns `{ tenantId }`
from the AES-GCM token minted at `provision-tenant.ts:145`, so the tenant is in hand **before** any
query. No bootstrap here at all.

| # | Line | Statement | Table | Op | GUC | Verdict |
|---|---|---|---|---|---|---|
| 13 | `:54` | `set_config('app.bypass_rls','on',TRUE)` | — | — | unset | the site being removed |
| 14 | `:56` | `tx.tenant.findUnique({ where: { id: tenantId } })` | `Tenant` | SELECT | unset | **0 rows** → the route throws `TENANT_NOT_FOUND` → the confirmation link redirects to `/sign-in?error=link-invalid`. **A valid link reported as invalid**, with a `logger.warn` that names the right tenant id |
| 15 | `:67` | `tx.tenant.update({ data: { emailConfirmedAt } })` | `Tenant` | UPDATE … RETURNING | unset | **0 rows affected**, silently (an RLS-refused UPDATE is a silent zero, not a `42501` — quick-599 D3). Unreachable because #14 fails first |

### 2.4 Onboarding hydration

`apps/web/src/app/onboarding/welcome/page.tsx`, `apps/web/src/lib/onboarding/hydrate-tenant.ts`,
`apps/web/src/lib/carrier/fleet-trucks.ts`, `apps/web/src/lib/onboarding/seed-sample-data.ts`.
`session.tenantId` is in hand throughout — every one of these is DECORATIVE except #19.

| # | Line | Statement | Table | Op | GUC | Verdict |
|---|---|---|---|---|---|---|
| 16 | `page.tsx:50` | `set_config('app.bypass_rls','on',TRUE)` | — | — | unset | site removed |
| 17 | `page.tsx:51` | `tx.tenant.findUnique({ select: { provisioningPhase } })` | `Tenant` | SELECT | unset | **0 rows** → logs `phase: undefined`; advisory only |
| 18 | `hydrate-tenant.ts:13` | `set_config('app.bypass_rls','on',TRUE)` | — | — | unset | site removed |
| 18a | `hydrate-tenant.ts:14` | `tx.tenant.findUniqueOrThrow` | `Tenant` | SELECT | unset | **throws `P2025`** → `hydrateTenant` fails → the welcome page renders "Setup incomplete" |
| 18b | `hydrate-tenant.ts:15` | `tx.user.findFirstOrThrow({ where: { tenantId, role: OWNER } })` | `User` | SELECT | unset | **throws `P2025`**. Unreachable; #18a fires first |
| 19 | `fleet-trucks.ts:84` | `prisma.$queryRawUnsafe('SELECT vehicle_id FROM carrier_trucks WHERE vehicle_id LIKE $1 ORDER BY vehicle_id DESC LIMIT 1')` | `carrier_trucks` | SELECT | unset | **0 rows, silently — and this one is NOT decorative.** No tenant predicate, no bypass flag, on the bare client, called from `hydrate-tenant.ts:29` **outside** the transaction. `carrier_trucks_vehicle_id_key` is a **globally unique** index (read from `pg_indexes`, not inferred), so with the max invisible the helper returns `VH-<year>-00001` for every tenant and the second sign-up of the year dies on `23505`. Structurally the same defect as `generateTicketNumber` (B7) and, like it, carries no `@bypass_rls` marker, so it is outside the 211-site grep the migration is scoped to |
| 20 | `hydrate-tenant.ts:36` | `set_config('app.bypass_rls','on',TRUE)` | — | — | unset | site removed |
| 21 | `seed-sample-data.ts:44` | `tx.carrierTruck.create` ×N | `carrier_trucks` | INSERT … RETURNING | unset | **`42501`.** `tenant_isolation_policy` `org_id = current_tenant_id()` |
| 22 | `seed-sample-data.ts:60` | `tx.carrierClient.create` ×N | `clients` | INSERT … RETURNING | unset | **`42501`.** `org_id` |
| 23 | `seed-sample-data.ts:74` | `tx.user.create` ×N | `User` | INSERT … RETURNING | unset | **`42501`.** `tenantId` |
| 24 | `seed-sample-data.ts:94` | `tx.carrierDriver.create` ×N | `carrier_drivers` | INSERT … RETURNING | unset | **`42501`.** `org_id` |
| 25 | `seed-sample-data.ts:110` | `tx.carrierLoad.create` ×N | `loads` | INSERT … RETURNING | unset | **`42501`.** `org_id` |
| 26 | `seed-sample-data.ts:163` | `tx.truck.create` ×N | `Truck` | INSERT … RETURNING | unset | **`42501`.** `tenantId` |
| 27 | `seed-sample-data.ts:187` | `tx.user.create` | `User` | INSERT … RETURNING | unset | **`42501`.** `tenantId` |
| 28 | `seed-sample-data.ts:206` | `tx.customer.create` ×N | `Customer` | INSERT … RETURNING | unset | **`42501`.** `tenantId` |
| 29 | `seed-sample-data.ts:237` | `tx.load.create` ×N | `Load` | INSERT … RETURNING | unset | **`42501`.** `tenantId` |
| 30 | `hydrate-tenant.ts:41` | `tx.tenant.update({ provisioningPhase: HYDRATED })` | `Tenant` | UPDATE … RETURNING | unset | **0 rows**, silently |
| 31 | `page.tsx:27` | `set_config('app.bypass_rls','on',TRUE)` | — | — | unset | site removed |
| 32 | `page.tsx:29-32` | `carrierClient.count` / `carrierContract.count` / `carrierLoad.count` / `trip.count`, each `where: { orgId: tenantId }` | `clients`, `contracts`, `loads`, `dispatches` | SELECT | unset | **0 rows each** → the activation checklist renders every step incomplete on a tenant that has just seeded four of them |
| 33 | `page.tsx:70-71` | the catch-block `tenant.findUnique` | `Tenant` | SELECT | unset | **0 rows** → `shouldShowError` stays true → "Setup incomplete" |

### 2.5 The unreferenced twin

| # | Line | Statement | Table | Op | GUC | Verdict |
|---|---|---|---|---|---|---|
| 34 | `tenant.repository.ts:34` | `set_config('app.bypass_rls','on',TRUE)` | — | — | unset | site removed |
| 35 | `tenant.repository.ts:36` | `tx.tenant.create({ … users: { create: … } })` | `Tenant`, `User` | INSERT … RETURNING ×2 | unset | **`42501`**, same as #4. Zero callers today |

### 2.6 Every table the path touches, and whether `app_user` can reach it

Read from `pg_class` / `pg_policy` / `information_schema.role_table_grants` on staging; the same
read on production returns an identical set for every row.

| Table | RLS / FORCE | Tenant policy | `app_user` grants | Satisfiable with the GUC set? |
|---|---|---|---|---|
| `Tenant` | on / on | `tenant_bootstrap_insert` (a), `tenant_self_read` (r), `tenant_self_update` (w) | `SELECT,INSERT,UPDATE,DELETE` | **only after this task's policy change** |
| `TenantNotificationSettings` | on / on | `tenant_isolation_policy` `"tenantId"` | `SELECT,INSERT,UPDATE,DELETE` | yes |
| `User` | on / on | `tenant_isolation_policy` `"tenantId"` | `SELECT,INSERT,UPDATE,DELETE` | yes |
| `Subscription` | on / on | `tenant_isolation_policy` `"tenantId"` | `SELECT,INSERT,UPDATE,DELETE` | yes |
| `ActivationProgress` | on / on | `tenant_isolation_policy` `"tenantId"` | `SELECT,INSERT,UPDATE,DELETE` | yes |
| `AppEvent` | on / on | `tenant_isolation_policy` `"tenantId"` | `SELECT,INSERT,UPDATE,DELETE` | yes |
| `Truck` · `Customer` · `Load` | on / on | `tenant_isolation_policy` `"tenantId"` | `SELECT,INSERT,UPDATE,DELETE` | yes |
| `carrier_trucks` · `clients` · `contracts` · `carrier_drivers` · `loads` · `dispatches` | on / on | `tenant_isolation_policy` `org_id` | `SELECT,INSERT,UPDATE,DELETE` | yes |
| `NotificationTemplate` · `Plan` · `Promo` | **off** | none | `SELECT` / `SELECT` / `SELECT,UPDATE` | n/a — RLS is off |

**No table on this path is a zero-policy table.** `stops`, `carrier_documents` and
`route_template_stops` — the three `FORCE RLS` tables with no policy at all — are not reached by
sign-up, confirmation or hydration. The path is blocked by exactly the three things named above and
nothing else.

---

## 3. After — the same statements, post-change

`GUC` is `app.current_tenant_id`, set **transaction-locally** (`set_config(..., TRUE)`) by
`setTransactionTenantId` in `apps/web/src/lib/db/tenant-guc.ts` — one place, grep-verified, so the
GUC name and its scope are written down once. Transaction-local rather than session-scope matters
here: a brand-new tenant id must not outlive its transaction on a pooled connection.

### 3.1 Sign-up — `provisionTenant`

| # | Statement | GUC | Verdict |
|---|---|---|---|
| 1 | `SELECT provisioning_email_taken($1)` | unset | **admitted.** `SECURITY DEFINER`, owner `postgres`, `EXECUTE` revoked from `PUBLIC` and granted to `app_user` only. Returns one boolean |
| 3 | `SELECT provisioning_next_slug($1)` | unset | **admitted.** Same shape. Returns one string. The `while` loop is gone — it now lives inside the function, where it can see every tenant |
| 3a | `randomUUID()` in process | unset | no database. **This is the change that dissolves the contradiction** |
| 3b | `setTransactionTenantId(tx, tenantId)` | → set | `set_config('app.current_tenant_id', <minted id>, TRUE)` |
| 4 | `tx.tenant.create({ data: { id: tenantId, … } })` | set | **admitted.** `tenant_bootstrap_insert` `WITH CHECK (id = current_tenant_id())` passes; the `RETURNING` check against `tenant_self_read` passes for the same reason |
| 4a/4b | *(trigger)* `NotificationTemplate` SELECT → `TenantNotificationSettings` INSERT | set | **admitted.** `"tenantId" = NEW."id" = current_tenant_id()`. No `SECURITY DEFINER` on the trigger, no grant change |
| 5, 8, 9 | `User` / `Subscription` / `ActivationProgress` creates | set | **admitted** |
| 6, 6b, 6c | `Plan` / `Promo` reads and the `Promo` update | set | **admitted** — RLS off, grants held |

The `Tenant.id` **column default is untouched**: `gen_random_uuid()` is still there and still applies
to every other insert path. Prisma accepts an explicit `id` alongside a `dbgenerated` default, so
this is a one-call-site change, not a schema change. There is no migration on the column.

### 3.2 The rest

| Flow | File | Change | Verdict |
|---|---|---|---|
| Sign-up event | `(auth)/sign-up/actions.tsx` | bypass → `setTransactionTenantId(tx, result.tenantId)` | admitted |
| Email confirmation | `lib/onboarding/confirm-tenant-email.ts` (extracted from the route) | bypass → GUC from the token payload | `tenant_self_read` + `tenant_self_update` admit both statements |
| Hydration — reads | `lib/onboarding/hydrate-tenant.ts` | bypass → GUC | admitted |
| Hydration — vehicle ids | `lib/carrier/fleet-trucks.ts` | `$queryRawUnsafe` on `carrier_trucks` → `SELECT carrier_max_vehicle_id($1)` | admitted, and **globally correct for the first time under a non-bypassing role** |
| Hydration — seeding | `lib/onboarding/hydrate-tenant.ts` | bypass → GUC | all 9 `seedSampleData` writes admitted |
| Checklist flags | `lib/onboarding/onboarding-flags.ts` (extracted from the page) | bypass → GUC | four counts admitted |
| Welcome page reads | `app/onboarding/welcome/page.tsx` | bypass → GUC ×2 | admitted |
| Unreferenced twin | `lib/db/repositories/tenant.repository.ts` | mint uuid + GUC, bypass removed | admitted |

---

## 4. What the policy change permits, stated explicitly

```sql
-- before
CREATE POLICY tenant_bootstrap_insert ON "Tenant" FOR INSERT
  WITH CHECK (NULLIF(current_setting('app.current_tenant_id', TRUE), '') IS NULL);
-- after
CREATE POLICY tenant_bootstrap_insert ON "Tenant" FOR INSERT
  WITH CHECK (id = current_tenant_id());
```

| | admitted before | admitted after |
|---|---|---|
| a connection with **no** tenant GUC inserting **any** `"Tenant"` row | **yes** | **no** |
| a connection whose GUC is a uuid that is not yet a tenant, inserting a row **with that id** | no | **yes** |
| a connection whose GUC is a uuid that is not yet a tenant, inserting a row with **any other id** | no | no |
| a connection whose GUC is an **existing** tenant's id, inserting a row with that id | no | refused by `Tenant_pkey` (`23505`) before RLS matters |
| a connection whose GUC is an existing tenant's id, inserting a row with a different id | no | no |

**This is a narrowing, not a widening, and the row that matters is the first one.** Today any
connection that simply declines to set the GUC may insert an arbitrary tenant; after the change a
caller must name the id it is about to create, in the GUC, before it creates it. Nothing is admitted
after the change that was refused before, except the exact self-naming case the sign-up transaction
performs.

The row it costs: **a bare-client `"Tenant"` INSERT with no GUC is no longer possible under
`app_user`.** The only such site is `tenant.repository.ts:36`, which is unreferenced and is updated
in the same commit. The sysadmin create path (`(admin)/actions/tenants.ts:101`) runs on `app_admin`,
which has `BYPASSRLS`, and is unaffected either way.

`tenant_self_read` and `tenant_self_update` are **not** changed. The policy **keeps its name** so the
name-keyed enumerations that find it — `rls-policy-canonical.json`, the replay-based drift detector —
continue to find it (quick-599's rule).

---

## 5. The three `SECURITY DEFINER` functions

| Function | Returns | Reads | Why it cannot be tenant-scoped |
|---|---|---|---|
| `provisioning_email_taken(text)` | `boolean` | `"User"."email"` across all tenants | `User_email_tenantId_key` is `(email, "tenantId")` — **not** globally unique — so this is the only Prisma-side global email guard. `auth.users.email` upstream is the primary one |
| `provisioning_next_slug(text)` | `text` | `"Tenant"."slug"` across all tenants | `Tenant_slug_key` is global. Without the global read the first colliding slug reaches the insert and raises `23505` on sign-up |
| `carrier_max_vehicle_id(text)` | `text` | `carrier_trucks.vehicle_id` across all tenants | `carrier_trucks_vehicle_id_key` is a **global** unique index |

Each is `SECURITY DEFINER`, owned by `postgres` (which carries `rolbypassrls`, so `FORCE RLS` on
`"User"` and `"Tenant"` does not apply to the function body), `SET search_path = public, pg_catalog`,
and — **the part that is easy to omit and expensive to omit** — `REVOKE ALL … FROM PUBLIC` followed
by `GRANT EXECUTE … TO app_user`. PostgreSQL grants `EXECUTE` to `PUBLIC` by default, and Supabase's
PostgREST exposes `public`-schema functions to `anon` and `authenticated` over `/rpc/`. Left at the
default, `provisioning_email_taken` would be an **unauthenticated email-enumeration oracle** reachable
from the internet. The `REVOKE` is the control; the `GRANT` is the exception to it.

`carrier_max_vehicle_id` mirrors `generateVehicleIds`'s existing query byte for byte
(`ORDER BY vehicle_id DESC LIMIT 1`, parsed by the caller) rather than being rewritten as a
`MAX(...)`, so the change is a privilege change and not a behaviour change.

They are `SECURITY DEFINER` functions rather than `getAdminDb` calls deliberately. The admin
connection would also work — `bypass-replacement-design.md` §4.1 item 4 names both — but it puts a
`BYPASSRLS` Prisma client on the unauthenticated sign-up surface, where a function that returns one
boolean leaks strictly less. `admin-connection.md` §9 lists this path as unrouted; it stays unrouted,
by choice, and the reason is recorded here.

---

## 6. The sysadmin account — a different BOOTSTRAP case, not this one

One of 38 accounts carries no tenant claim: the single `isSystemAdmin` login. It does not traverse
this path at any point.

- It is **not created by sign-up.** `signUpAction` hard-codes `isSystemAdmin: false` and a tenant id
  into `app_metadata`, and quick-590 made that patch **fatal on failure** so no tenantless account can
  be minted by this flow any more.
- It **never reaches hydration or email confirmation.** Both are keyed by a tenant id — one from
  `session.tenantId`, one from the AES-GCM token — and it has neither.
- Its one database bootstrap is `getCurrentUser` (`lib/auth/supabase.ts:164`), which reads a single
  `"User"` row by primary key under `app.bypass_rls` because the tenant is not yet known. That is
  **B8**, not B3: `admin-connection.md` §9 owns it, `wrapper-migration-scope.md` §1b counts the 9
  call-chain units that reach a transaction through it, and this task does not touch it.
- **Its tenant-creation surface is already solved.** `(admin)/actions/tenants.ts:101` was routed onto
  `app_admin` by quick-600 and bypasses RLS, so neither policy applies to it in either direction.

**So the sysadmin needs no answer from this task, and would not be helped by one.** The policy change
is inert for it: `app_admin` never consults `tenant_bootstrap_insert`. The one thing worth carrying
forward is that the new policy makes the *shape* of a correct bootstrap explicit — name the id, then
create it — which is the same shape B8 will need when it gives the sysadmin a tenantless read path.

---

## 7. What this enumeration does not cover

1. **The 81-FK `"Tenant"` DELETE fan-out** (`trigger-grant-sweep.md` §6.2) — not on this path; a
   provisioning flow never deletes a tenant.
2. **`getCurrentUser`** — B8, §6 above.
3. **`generateTicketNumber`** — B7. Named here only because §2.4 #19 is the same defect class and was
   found by walking this path rather than by grepping for `@bypass_rls`.
4. **Every bypass site not on these four files** — untouched by design. The task's instruction is the
   provisioning path only.
