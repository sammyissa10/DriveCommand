# quick-601 — Make tenant provisioning work under `app_user` (B3 / design §4.1)

**Target:** `drivecommand-staging` (`wyixpgunnjmzguhggocz`) ONLY. Production is never written.
No cutover. `DATABASE_URL` unchanged on both databases. Nothing installed.

**Predecessors:** `docs/audits/trigger-grant-sweep.md` · `docs/audits/bypass-replacement-design.md` §4 ·
`docs/audits/admin-connection.md` · quick-599 · quick-600.

---

## The problem, restated from measurement rather than derivation

The sweep derived ONE failure. Measured as `app_user` against staging (with active
`NotificationTemplate` rows present so the trigger actually writes), there are **TWO**, and the
one the sweep named fires **second**:

| # | Statement | Result |
|---|---|---|
| 1 | `INSERT INTO "Tenant" (...) ` — **no** `RETURNING` | `42501 new row violates row-level security policy for table "TenantNotificationSettings"` — the sweep's finding, now executed |
| 2 | `INSERT INTO "Tenant" (...) RETURNING id` | `42501 new row violates row-level security policy for table "Tenant"` — **new**. A `RETURNING` clause makes PostgreSQL apply the table's SELECT policies as an insert-time check; `tenant_self_read` is `USING (id = current_tenant_id())`, NULL with the GUC unset |

**Prisma's `tx.tenant.create()` always emits `RETURNING`,** so sign-up fails at #2, one statement
before the trigger ever runs.

This settles `trigger-grant-sweep.md` §8 item 1 (no write probe) and **eliminates option B**:
making `seed_tenant_notification_settings()` `SECURITY DEFINER` fixes #1 and leaves #2 untouched.

---

## Mechanism chosen

**Dissolve the contradiction: mint the tenant id in the application and set the GUC BEFORE the
insert**, replacing `tenant_bootstrap_insert`'s body with `id = current_tenant_id()`.

After that, every statement on the path — the outer `INSERT`, its `RETURNING`, the trigger's
`INSERT` into `TenantNotificationSettings`, and steps 5/8/9 — is admitted by an ordinary
tenant-scoped policy. No new security context, no `BYPASSRLS` connection, no bypass GUC.

The two genuinely global bootstrap probes (email uniqueness, slug uniqueness) and one global read
the sweep did not name (`generateVehicleIds`, on the hydration path) become narrow
`SECURITY DEFINER` functions returning one boolean, one string and one string — **deliberately not
`getAdminDb`**, which would put a `BYPASSRLS` connection on the unauthenticated sign-up surface.

### Rejected

- **Route provisioning through `getAdminDb`.** Fixes both failures, but the cost is the thing the
  admin connection exists to avoid: a `BYPASSRLS` client on the highest-traffic unauthenticated
  surface in the product, reachable before any authentication has happened.
- **`SECURITY DEFINER` on the trigger function.** Narrowest of the three, and **insufficient** —
  measured failure #2 is on `"Tenant"` itself and the trigger is not involved in it.
- **An INSERT policy on `"TenantNotificationSettings"` admitting the bootstrap case.** Would have
  to admit a row whose `tenantId` names a tenant the caller has no context for — a widening with
  no bound, to paper over the narrower of the two failures.

---

## Tasks

1. **Enumerate the path** — `docs/audits/provisioning-path.md`: every statement across sign-up,
   email confirmation and onboarding hydration, with file:line, table, operation, GUC state and
   the policy verdict under `app_user`, before and after.
2. **DDL** — one migration: replace `tenant_bootstrap_insert`'s body; create three
   `SECURITY DEFINER` functions (`REVOKE ALL ... FROM PUBLIC`, `GRANT EXECUTE ... TO app_user`);
   revoke `app_admin`'s `SELECT` on `"TenantNotificationSettings"` **only if** measurement says it
   is unneeded. Update `scripts/audit/rls-policy-canonical.json`. Apply to staging and write the
   `_prisma_migrations` resolved-not-run row by hand, then read it back (DEC-17).
3. **Application** — mint the uuid, set the transaction-local GUC, call the three functions,
   delete `app.bypass_rls` on the provisioning path ONLY.
4. **Proof** — `scripts/audit/601-provisioning-verify.ts`, both directions, as `app_user`, with
   `bypass_rls_policy` temporarily dropped on the affected tables. 86 before / 86 after.
5. **Gates + docs** — guard test, drift detector, `npm run build`, audit write-up, the sweep
   corrected in place.
