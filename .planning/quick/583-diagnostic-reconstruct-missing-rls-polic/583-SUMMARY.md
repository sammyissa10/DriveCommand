# quick-583 — Reconstruct the missing RLS policies on `stops`, `route_template_stops`, `carrier_documents`

**Date:** 2026-09-03
**Type:** read-only diagnostic. **No policy created/altered/dropped, no migration, no RLS toggle, no access path modified.**

Report: [`docs/diagnostics/rls-policy-gap-stops.md`](../../../docs/diagnostics/rls-policy-gap-stops.md)

---

## The four findings that matter

### 1. The policies existed, worked, and their removal is unattributable

Not "never written". `20260404100013_carrier_rls_policies` created **14 policies** across
the three tables; `20260527000001_quick410_advisor_rls_fix` rewrote them. Both are recorded
applied (`applied_steps_count = 1`, `rolled_back_at` null). And quick-412's production smoke
check on **2026-05-28** asserted, per table, *"at least one policy references
current_tenant_id()" — PASS*, with `carrier_documents` returning 11 rows as `app_user`.

They are gone now. No repo migration drops them without recreating
(`db_security_standardization` does not mention the three tables at all — 46 DROP / 46
CREATE, balanced); `quick410`'s own `rollback.sql` recreates 11, so running it would not
produce zero; and `supabase_migrations.schema_migrations` has one unrelated entry in the
window. **The removal happened after 2026-05-28 by a mechanism that writes to neither
ledger — the DEC-17 shape.** Attribution is not possible from the evidence; saying so beats
guessing.

**Memory correction:** the recorded verdict "HELD" means the fix *held* (24h, no drift), not
that it was put on hold or reverted.

### 2. The brief's step 3 premise is false, and that is the whole design constraint

The brief asks whether each table uses `org_id` or `tenantId`. **None has either, or any
tenant column.** Only the control `facilities` does. Tenancy is reached by FK:

- `stops` → `dispatch_id` (**NOT NULL**) → `dispatches.org_id` (**NOT NULL**) — total
- `route_template_stops` → `route_template_id` (**NOT NULL**) → `route_templates.org_id` — total
- `carrier_documents` → five parents, **all nullable, all `ON DELETE SET NULL`** — not total

### 3. Restoring the policies verbatim would take every write offline

Every INSERT/UPDATE/DELETE policy is gated on `(auth.jwt() ->> 'role') IN ('OWNER','MANAGER')`.
`auth.jwt()` reads the `request.jwt.claim(s)` GUC that **PostgREST** sets; Prisma never sets
it, so it is NULL, `NULL IN (…)` is NULL, and the policy denies. quick-410 fixed the broken
`org_id` claim and **left the `role` claim in place** — reads fixed, writes not.

Consequence: restoration as written leaves reads working and breaks **all 33 direct write
sites**. The replacement is deliberately *not* drafted — choosing between "add a role GUC"
and "drop the role check and rely on app-layer authz" is a security decision, and the brief
says to say so rather than invent.

### 4. Neither isolation layer is currently active on these tables

All three are in `EXEMPT_MODELS` in `lib/db/extensions/tenant-rls.ts` ("no tenantId; scoped
via dispatchId / routeTemplateId / parentId"), so the app-layer extension injects **no**
tenant filter — and the database has **zero** policies. What stands in for isolation is that
callers generally query through an already-scoped parent id: a convention, not a control.

## Answers to the remaining steps

- **§1 controls.** `facilities`, `clients`, `carrier_trucks`, `route_templates` all show 2
  policies under identical FORCE RLS. Sharpest illustration: `route_templates` has 2 and its
  own child `route_template_stops` has 0. Connected role `postgres` (`rolbypassrls`), which
  is the only reason the app works.
- **§4 control pattern**, verbatim and identical across all four: `bypass_rls_policy`
  (`current_setting('app.bypass_rls', true) = 'on'`, USING only) + `tenant_isolation_policy`
  (`org_id = current_tenant_id()`, USING **and** WITH CHECK), both PERMISSIVE / ALL / public.
- **§5 GUC.** `app.current_tenant_id`, **session scope (`false`)** at
  `tenant-context.ts:55` and `:81` — the recorded P2028 deviation is still what the code
  does. `:101` uses `TRUE` in a separate helper. `prisma.ts:69` inits to `''` on connect, so
  a fresh connection fails closed.
- **§6 access paths.** 63 reads / 33 writes across 31 files. **No cron** touches these
  models; **8 files use `after()`**. The 34 nested `stops: { … }` sites are overloaded —
  `Trip`/`CarrierLoad`/`CarrierClient`/`CarrierFacility` declare `CarrierStop[]` (→ `stops`),
  but legacy **`Route` declares `RouteStop[]`, a different table**. Counting them together
  overstates the blast radius (the two-route-systems trap).
- **§7 bare prisma.** 21 files use `getTenantPrisma()`, **10 use the bare singleton**. Two of
  those also use `after()`. Both failure modes are named: fresh connection → GUC `''` → NULL
  → fail closed; **reused connection → stale tenant id → policy evaluated against the wrong
  tenant**, turning the documented pool-leak hazard into a live cross-tenant read path.
- **§8 drafts.** Reconstructed from the repo's own `quick410` SQL, labelled NOT APPLIED.
  Confidence **HIGH** for the two stop tables, **QUALIFIED** for `carrier_documents`. Also
  noted: the `bypass_rls_policy` half *should* be added, since `supabase.ts:147`,
  `evaluator.ts:95,203` and `sender-config.ts` all set `app.bypass_rls='on'` expecting it to
  be honoured.

## `carrier_documents` — the additional consideration

41 documents, **0 fully orphaned today** (26 dispatch, 35 client, 25 stop, 5 contract,
2 load) — but five nullable `ON DELETE SET NULL` parents mean deleting a parent *actively
manufactures* a row no branch can reach, which RLS then hides with no error. **This table
needs a real `org_id` column, not a cleverer join.** That is why it should not ride the same
migration as the other two.

## Method notes

- `pg_class.oid` joins throughout, never `::regclass` on a literal (PascalCase/snake_case mix).
- Both `pg_policy` and `pg_policies` read; they agree.
- `@@map` consulted rather than guessed — `prisma.stop.` returns zero hits; the model is
  `CarrierStop`.
- One `SELECT` per `execute_sql` call.

## Verification

`git status` shows only the report and planning docs. No file under `apps/` or `packages/`.

## Assessment (short; full version ends the report)

**Not one migration, and `carrier_documents` should be separate.** Order: (1) fix the ten
bare-`prisma` sites, (2) decide the role-gate replacement, (3) policy `stops` +
`route_template_stops` with `bypass_rls_policy` included, (4) add `org_id` to
`carrier_documents` and policy it last. Everything that breaks the moment a policy exists is
enumerated by path in the report.
