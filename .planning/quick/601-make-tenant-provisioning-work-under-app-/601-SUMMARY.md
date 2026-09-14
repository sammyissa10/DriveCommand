# quick-601 — Make tenant provisioning work under `app_user` (B3 / design §4.1)

**Date:** 2026-09-14
**Target:** `drivecommand-staging` (`wyixpgunnjmzguhggocz`) ONLY. Production was **read** and never
written — verified at close: its `tenant_bootstrap_insert` still carries the old body, its
`_prisma_migrations` still holds 153 rows (staging holds 155), 86/183 policies on both.
No cutover. `DATABASE_URL` unchanged on both databases. Nothing installed.

**Commits:** `d1d86707` · `941b3a0b` · `a30de408` · `a32e696c`

---

## 1. What the task asked, and what came back

| Step | Asked | Result |
|---|---|---|
| 1 | Enumerate the path statement by statement | `docs/audits/provisioning-path.md` — 35 statements across 3 flows + the unreferenced twin, file:line, table, op, GUC state, verdict |
| 2 | Choose a mechanism, state trade-offs | Chose **replace the policy body + mint the id in the app**. Rejected the admin connection and the `SECURITY DEFINER` trigger — §3 below |
| 3 | Build it | 9 bypass sites removed, 1 migration, 3 SQL functions, 2 extractions, 1 shared GUC helper |
| 4 | Remove `app.bypass_rls` on the provisioning path only | 190 → 181 repo-wide. Nine, all on the path. Nothing else touched |
| 5 | Prove it on staging as `app_user`, with `bypass_rls_policy` dropped | Done. 86 before / 71 while dropped / 86 after. Both directions |
| 6 | The sysadmin BOOTSTRAP case | `provisioning-path.md` §6 — it does not traverse this path and needs nothing from it. §5 below |
| 7 | Revoke `app_admin`'s SELECT if unneeded | **Measured: it IS needed. Grant kept.** The sweep's hypothesis was wrong — §4 below |

---

## 2. The finding that changed the answer

`trigger-grant-sweep.md` derived ONE failure. Executed as `app_user` on staging there are **two**,
and the derived one fires **second**:

```
INSERT INTO "Tenant" (name, slug, "updatedAt") VALUES (…)
  -> 42501  … for table "TenantNotificationSettings"      <- the sweep's finding
INSERT INTO "Tenant" (name, slug, "updatedAt") VALUES (…) RETURNING id
  -> 42501  … for table "Tenant"                          <- new
```

Two probes, one clause apart, failing on different tables. A `RETURNING` clause makes PostgreSQL
apply the table's SELECT policies as an insert-time check, and that check runs **before** the AFTER
trigger. `"Tenant"`'s SELECT policy is `tenant_self_read`, `USING (id = current_tenant_id())` — NULL
exactly when `tenant_bootstrap_insert` demanded the GUC be unset.

**Prisma's `tenant.create()` always emits `RETURNING`.** So sign-up dies one statement earlier than
recorded, on a different table — and **that eliminates one of the three options outright**.

This also settles `trigger-grant-sweep.md` §8 item 1, which asked for exactly this probe.

**It only reproduces with a fixture.** Staging carries **zero** `NotificationTemplate` rows, so the
trigger's `INSERT … SELECT` inserts nothing, its `WITH CHECK` is never evaluated, and the bug does
not appear. A run without the fixture is green and proves nothing.

---

## 3. The mechanism, and what was rejected

**Chosen — dissolve the contradiction.** `tenant_bootstrap_insert`'s `WITH CHECK` becomes
`id = current_tenant_id()`, and `provisionTenant` mints the tenant uuid with `randomUUID()` and
declares it in a transaction-local GUC *before* the insert. After that the outer INSERT, its
`RETURNING`, the trigger's INSERT and every later statement are each admitted by one ordinary
tenant-scoped policy. No new security context, no bypassing connection, no bypass flag.

`Tenant.id`'s `dbgenerated` default is **untouched** — Prisma accepts an explicit id alongside it, so
this is one call site, not a schema change.

**Rejected — route provisioning through `getAdminDb`.** It works, and it is the thing the admin
connection was built to avoid: a `BYPASSRLS` client on the product's highest-traffic unauthenticated
surface, reachable before any authentication.

**Rejected — `SECURITY DEFINER` on the trigger.** Genuinely the narrowest of the three, and
**insufficient**: §2's first failure is on `"Tenant"` itself and the trigger is not involved.

**Rejected — an INSERT policy on `"TenantNotificationSettings"` admitting the bootstrap case.** It
would have to admit a row whose `tenantId` names a tenant the caller has no context for — an
unbounded widening, to close the narrower of the two failures.

### What the policy change permits — stated, because it is a policy change

| caller state | before | after |
|---|---|---|
| no tenant GUC, inserting **any** `"Tenant"` row | **yes** | **no** |
| GUC = a uuid that is not yet a tenant, row id = that uuid | no | **yes** |
| GUC = a uuid that is not yet a tenant, row id = anything else | no | no |
| GUC = an existing tenant id, row id = that id | no | `Tenant_pkey` 23505 |
| GUC = an existing tenant id, row id = anything else | no | no |

**A narrowing.** Today a caller that declines to set the GUC may insert an arbitrary tenant; after,
it must name the id it is about to create. The one thing newly admitted is the self-naming case
sign-up performs. The cost: a bare-client `"Tenant"` INSERT with no GUC is no longer possible under
`app_user` — the only such site is `tenant.repository.ts`'s unreferenced `provisionTenant`, updated
in the same commit.

### The three `SECURITY DEFINER` functions

`provisioning_email_taken(text)→boolean`, `provisioning_next_slug(text)→text`,
`carrier_max_vehicle_id(text)→text`. Owner `postgres` (`rolbypassrls`, asserted by a `DO` block in
the migration rather than assumed), `search_path` pinned, one scalar each.

**`REVOKE ... FROM PUBLIC` alone did not close them, and that was measured.** After the first apply,
`has_function_privilege('anon', …, 'EXECUTE')` was still TRUE: both databases carry
`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated,
service_role` from two grantors, and those are explicit per-role ACL entries that revoking PUBLIC
does not touch. Supabase's PostgREST exposes `public` functions to `anon` over `/rpc/`, so
`provisioning_email_taken` would have been an **internet-reachable email-enumeration oracle**. Fixed
with role-level `REVOKE`s; final ACL is `{postgres, app_user}` on all three, verified per role.

---

## 4. Step 7 — `app_admin`'s SELECT on `"TenantNotificationSettings"`

**Required. The grant stays.** With two active templates present so the trigger genuinely writes:

```
grants = INSERT,SELECT  ->  INSERT INTO "Tenant" … RETURNING id  ->  OK, 2 rows seeded
grants = INSERT         ->  INSERT INTO "Tenant" … RETURNING id
                              ->  42501 permission denied for table TenantNotificationSettings
```

`ON CONFLICT (cols) DO NOTHING` carries an arbiter-index inference over the target's columns and
needs SELECT independently of INSERT. The sweep's reasoning was sound and its premise — that the
documented SELECT requirement attaches only to `DO UPDATE` — does not survive contact with the
statement. Grant restored immediately after the probe; `finally`-scoped.

---

## 5. Step 6 — the sysadmin account

It does not traverse this path at any point, and would not be helped by the change.

- Not created by sign-up: `signUpAction` hard-codes `isSystemAdmin: false` and a tenant id, and
  quick-590 made that patch fatal on failure.
- Never reaches confirmation or hydration: both are keyed by a tenant id it does not have.
- Its one bootstrap is `getCurrentUser` (`lib/auth/supabase.ts:164`) — **B8**, owned by
  `admin-connection.md` §9, untouched here.
- Its tenant-creation surface is already on `app_admin`, which bypasses RLS and never consults
  `tenant_bootstrap_insert` in either direction.

The one thing to carry forward: the new policy makes the shape of a correct bootstrap explicit —
name the id, then create it — which is the shape B8 will need.

---

## 6. The proof

`scripts/audit/601-provisioning-verify.ts`, against staging, Prisma pool on `app_user`
(`rolbypassrls=false`, asserted before anything runs), with `bypass_rls_policy` **dropped on all 15
path tables**. Each policy recreated from `pg_get_expr` read back at drop time, never from a literal.

**86 before · 71 while dropped · 86 after.** A failed restore is a hard exit 1.

| direction | probe | result |
|---|---|---|
| legitimate | `provisionTenant()` | OK |
| legitimate | trigger wrote its `TenantNotificationSettings` rows | OK — 2 of 2 |
| legitimate | `confirmTenantEmail()` | `confirmed` |
| legitimate | `confirmTenantEmail()` again | `already-confirmed` |
| legitimate | `hydrateTenant()` | `phase=HYDRATED seeded=true` |
| legitimate | `getOnboardingFlags()` | all false — **correct**, see below |
| legitimate | counter-assertion: seeded rows readable as this tenant | clients=1 carrier_trucks=1 loads=2 |
| legitimate | `AppEvent` `tenant.created` | OK |
| cross-tenant | `"Tenant"` INSERT whose id ≠ the declared GUC | `42501` |
| cross-tenant | `"Tenant"` INSERT with no GUC (what the old policy allowed) | `42501` |
| cross-tenant | SELECT another tenant's row | 0 rows |
| cross-tenant | UPDATE another tenant's row | 0 rows |
| cross-tenant | counter-read: the row IS there | 1 row |
| cross-tenant | `"TenantNotificationSettings"` INSERT for another tenant | `42501` |

It runs the **real application functions**, not replayed SQL — the whole finding is that Prisma emits
a clause nobody had written down, so a hand-typed sequence would prove the wrong thing.

**The two ways this could have proved nothing, both closed.** (a) No active templates → the trigger
writes nothing and the failure cannot reproduce; the harness exits 1 if it finds none. (b)
`getOnboardingFlags` returning all-false is the *correct* answer (it filters `isSample:false`;
hydration seeds `isSample:true`) — and it is also exactly what an RLS-blocked read returns. The
counter-assertion reads the same tables through the same connection without that filter and requires
non-zero.

`--before` temporarily reverts the policy to its pre-migration body and restores it, so the before
half is re-runnable rather than a quoted transcript.

Staging at close: 86/183 policies, zero probe tenants, zero probe templates, `app_admin` grants
`INSERT,SELECT`, all three functions `anon=false app_user=true`.

---

## 7. Gates

| Gate | Result |
|---|---|
| `tsc --noEmit` | 0 errors, and **probed** — an injected type error was reported against the file actually edited, then removed |
| `npm run build` | exit 0 |
| Body-level drift detector, **staging** | **CLEAN, definition drift 0**, 183/183 |
| Body-level drift detector, **production** | **drift 1 — expected.** Exactly `Tenant.tenant_bootstrap_insert [withCheck]`, because production is deliberately not migrated. This is the pending-deploy signal, not a fault |
| Full suite | 1949 → 1979 tests, **64 failed both sides, identical failing file set**. The +30 are this task's guard |
| Guard test | 30 tests, **driven RED** (bypass reinstated → 2 failures) then reverted |
| `bypass_rls_policy` | 86 before, 86 after |
| Production writes | none — ledger 153 rows unchanged, old policy body intact |

The suite baseline was measured in a `git worktree` **inside the repo** with `.env.local` and
`.env.staging` copied in — quick-567: a worktree does not carry untracked env files and DB-dependent
tests then skew, which reads as a regression. Removed with `--force`; `packages/` verified intact.

---

## 8. Found along the way — reported, not swept up

1. **`generateVehicleIds` was a silent global read with no marker.** `fleet-trucks.ts`, a bare
   `$queryRawUnsafe` on `carrier_trucks` with no tenant predicate, no bypass flag and therefore no
   `@bypass_rls` marker — **outside the 211-site grep entirely**.
   `carrier_trucks_vehicle_id_key` is a **globally unique** index, so under `app_user` the max is
   invisible, every tenant gets `VH-<year>-00001`, and the second truck of the year dies on `23505`.
   Same class as `generateTicketNumber` (B7). **Fixed here** because it sits on the hydration path
   and step 3 could not pass without it.

2. **`ActivationProgress.congratsShownAt` is in `schema.prisma` and in production and in NO
   migration.** Found because `provisionTenant` failed `P2022` at Step 9 — not an RLS failure.
   Staging is built by replaying the chain; production is not. **Fixed** with the missing migration
   (additive, nullable, `IF NOT EXISTS`, a no-op on production).

3. **Staging carries 20 further missing columns and 1 missing table** against `schema.prisma`, plus
   310 extra columns. Exactly one of the 21 was on this path. **Not fixed** — staging parity is not
   B3's, and a blanket repair from a generated draft is the wrong shape for a task scoped to one
   flow. Reproduce with `DATABASE_URL=<staging> npx tsx scripts/audit/full-schema-drift-scan.ts`
   (note: that script **overwrites the tracked** `scripts/audit/417-DRIFT-FIX-DRAFT.sql` — restore it
   afterwards).

4. **`tests/security/rls-policy-replay.test.ts` is pre-existing red**, and was red at the baseline
   commit: `expected 428 to be 403`. This task's migration moves it to 430. The assertion is a
   hardcoded corpus count whose own comment says the numbers are a historical record and "not
   arithmetic to be re-fitted", so it is **not touched** — but it has now been stale across at least
   four tasks and someone should own the decision.

5. **`apps/web/src/lib/docs/search-index.json` and `.docs-data/admin-docs-search-index.json` are
   stale in the repo.** `npm run build` regenerates them with real content changes (a route rename,
   a missing `document-import` entry). Reverted here — not this task's work — but a build that
   dirties the tree means someone committed without regenerating.

6. **`apps/web` still has no working lint entry point** (quick-562's finding, unchanged).

---

## 9. The question the task ends on

> **Can the `app.bypass_rls` line in `provision-tenant.ts` now be deleted safely?**

**It is already deleted, and the line was never the thing holding the path up.** Under `app_user`
the path fails with or without it once `bypass_rls_policy` is dropped; the bypass flag was only ever
masking two policy failures. Both are closed by the policy body and the minted id, and the path was
then proven with the policy gone from every table it touches.

> **Does anything else on the path still depend on the bypass?**

**No.** Nine sites removed, none remaining in any of the eight path files, and the end-to-end run
completed with `bypass_rls_policy` dropped on all 15 tables — so nothing on the path can be
depending on it, including by a route this enumeration missed.

Two dependencies *were* replaced rather than removed, and they are dependencies on **`postgres`
having `rolbypassrls`**, not on the flag: the two global uniqueness probes, and
`generateVehicleIds`. All three now reach their global rows through a `SECURITY DEFINER` function
granted to `app_user` alone. That is a narrower dependency, not an eliminated one, and it is
deliberate — the uniqueness they guard is genuinely global.

**What is still required before production sign-up works under `app_user`**, none of it this task's
to do:

1. Apply `20260914160000_provisioning_under_app_user` and
   `20260914170000_activation_progress_congrats_shown_at` to production (DEC-17: write the
   `_prisma_migrations` row and **read it back**).
2. The production drift detector will go from `drift 1` to clean at that moment. Until then its
   single finding is the expected pending-deploy signal.
3. Everything else in the `app_user` cutover (A1/A2/A7, B7, B8) is unchanged by this task.
