# RLS Policy Gap — `stops`, `route_template_stops`, `carrier_documents`

**Date:** 2026-09-03 · **Task:** quick-583 · **Type:** read-only diagnostic
**Project:** Supabase `oqdhberkghtnszrkdvfm` (Postgres 17.6)

Follow-up to quick-582 §3 "Class (b)". Nothing was created, altered or dropped. No
migration was applied. No policy was tested against production.

> **Headline.** The policies existed, worked, and were verified in production on
> 2026-05-28. They are gone now, and **nothing in the repo or in either migration ledger
> accounts for their removal.** Meanwhile all three tables are also exempt from the
> app-layer tenant filter, so **there is currently no tenant isolation on these three
> tables at either layer** — only the fact that application code happens to query through
> an already-scoped parent id.

---

## 1. Confirmed, with controls

**Connected role: `postgres`** (owner of all seven tables below; `rolbypassrls = true`).
That is the only reason the application works today.

| table | `relrowsecurity` | `relforcerowsecurity` | `pg_policy` | `pg_policies` |
|---|---|---|---|---|
| **`stops`** | true | **true** | **0** | **0** |
| **`route_template_stops`** | true | **true** | **0** | **0** |
| **`carrier_documents`** | true | **true** | **0** | **0** |
| `facilities` *(control)* | true | true | 2 | 2 |
| `clients` *(control)* | true | true | 2 | 2 |
| `carrier_trucks` *(control)* | true | true | 2 | 2 |
| `route_templates` *(control)* | true | true | 2 | 2 |

Both catalogues agree, so the query is sound. The sharpest illustration:
**`route_templates` has 2 policies and its own child `route_template_stops` has 0.**

FORCE RLS with zero policies denies everything to every role except one holding
`BYPASSRLS`. FORCE applies to the table owner too — `postgres`'s role attribute, not its
ownership, is what is hiding this.

---

## 2. History — they existed, they worked, and their removal is unattributable

### What was specified

`apps/web/prisma/migrations/20260404100013_carrier_rls_policies/migration.sql` creates
**14 policies** across the three tables:

- `route_template_stops` — `_org_select`, `_org_insert`, `_org_update`, `_org_delete`
- `stops` — `_org_select`, `_org_insert`, `_org_update`, `_org_delete`, plus
  `stops_driver_select` and `stops_driver_update` (a driver-role dimension the brief does
  not anticipate)
- `carrier_documents` — `_select`, `_insert`, `_org_update`, `_org_delete`

`20260527000001_quick410_advisor_rls_fix` then rewrote most of them, replacing the broken
`(auth.jwt() ->> 'org_id')::uuid` claim with `current_tenant_id()`.

### What shipped

Both migrations are recorded as applied and never rolled back:

| migration | `applied_steps_count` | `finished_at` | `rolled_back_at` |
|---|---|---|---|
| `20260404100013_carrier_rls_policies` | 1 | 2026-04-05 01:42:49 | null |
| `20260515000001_db_security_standardization` | 1 | 2026-05-15 04:38:25 | null |
| `20260527000001_quick410_advisor_rls_fix` | 1 | 2026-05-27 18:23:01 | null |

### They were verified working

`.planning/quick/412-.../412-SUMMARY.md` is a production smoke check dated 2026-05-28:

```
PASS  carrier_documents — relforcerowsecurity = TRUE
PASS  route_template_stops — relforcerowsecurity = TRUE
PASS  stops — relforcerowsecurity = TRUE
PASS  carrier_documents — at least one policy references current_tenant_id()
PASS  route_template_stops — at least one policy references current_tenant_id()
PASS  stops — at least one policy references current_tenant_id()
- carrier_documents WITH context (app_user effective): count = 11 (> 0 — PASS)
```

**A correction to project memory:** the recorded verdict "HELD" means the fix *held* — 24h
with no drift — **not** that it was placed on hold or reverted. The policies were live and
functioning.

### What removed them — unknown, and that is itself the finding

- No migration in the repo drops them without recreating.
  `20260515000001_db_security_standardization` (46 `DROP`, 46 `CREATE`, balanced) **does
  not mention any of the three tables**.
- The only later file that drops them is `quick410`'s own `rollback.sql`, which also
  recreates 11 — running it would not produce zero.
- `supabase_migrations.schema_migrations` shows **one** entry between 2026-05-25 and
  2026-06-10 (`add_soft_delete_columns_drift_fix`), unrelated.
- `_prisma_migrations` shows nothing dropping them.

**The removal happened after 2026-05-28 by a mechanism that writes to neither ledger.**
That is precisely the DEC-17 shape: an ad-hoc `execute_sql` applies SQL and records nothing
anywhere. A policy can therefore be dropped from this database and leave no trace in any
artefact under version control. Attribution is not possible from the evidence available;
stating that is more useful than guessing which task did it.

---

## 3. Tenant column per table — the brief's premise, corrected

The brief asks whether each table uses `org_id` or `tenantId`. **None of the three has
either, or any tenant-ish column at all.** Only the control does:

| table | tenant column | type | nullable |
|---|---|---|---|
| `stops` | **none** | — | — |
| `route_template_stops` | **none** | — | — |
| `carrier_documents` | **none** | — | — |
| `facilities` *(control)* | `org_id` | `uuid` | **NOT NULL** |

This is the whole reason the control pattern cannot simply be copied, and it corroborates
the note in project memory about "join-based expressions". Tenancy is reached through a
foreign key:

| table | join path | FK nullable? |
|---|---|---|
| `stops` | `dispatch_id` → `dispatches.org_id` | **NOT NULL** (both) |
| | `load_id` → `loads.org_id` | nullable (secondary) |
| `route_template_stops` | `route_template_id` → `route_templates.org_id` | **NOT NULL** (both) |
| `carrier_documents` | `client_id`, `contract_id`, `dispatch_id`, `load_id`, `stop_id` | **all five nullable, all `ON DELETE SET NULL`** |

`stops` and `route_template_stops` have a mandatory single parent, so a join policy is
total. **`carrier_documents` does not**, and that is its additional consideration (§8.3).

---

## 4. The control pattern, verbatim from `pg_policies`

Identical across all four controls — two PERMISSIVE `FOR ALL TO public` policies:

| table | policy | cmd | `qual` | `with_check` |
|---|---|---|---|---|
| `facilities` | `bypass_rls_policy` | ALL | `(current_setting('app.bypass_rls'::text, true) = 'on'::text)` | *null* |
| `facilities` | `tenant_isolation_policy` | ALL | `(org_id = current_tenant_id())` | `(org_id = current_tenant_id())` |

`clients`, `carrier_trucks` and `route_templates` are byte-identical apart from the table
name. All are `PERMISSIVE`, `roles = {public}`, `cmd = ALL`.

```sql
CREATE OR REPLACE FUNCTION public.current_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE
AS $$ SELECT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID; $$
```

Note it returns **NULL** when the GUC is unset — and `org_id = NULL` is never true, so an
unset GUC fails closed.

---

## 5. How tenant context reaches the database

- **GUC:** `app.current_tenant_id`, read by `current_tenant_id()`.
- **Scope: SESSION (`false`), confirmed still current.** `lib/context/tenant-context.ts:55`
  (and `:81` for `getTenantPrismaForOrg`):

  ```ts
  await prisma.$executeRawUnsafe(
    "SELECT set_config('app.current_tenant_id', $1, false)", tenantId
  );
  ```

  The in-file rationale matches the recorded deviation: session scope because Session
  Pooler + `max:1` + single-threaded Vercel workers are argued to guarantee no concurrent
  tenant overlap, and because running it as a bare autocommit statement (not inside
  `$transaction`) avoids deadlocking against a caller's outer transaction (P2028).
- `lib/context/tenant-context.ts:101` uses `TRUE` (transaction scope) in a separate helper.
- `prisma.ts:69` initialises the GUC to `''` on every pool connect, so a fresh connection
  fails closed rather than inheriting a neighbour's tenant.

**The known hazard stands:** session scope on a pooled connection is only safe if
`getTenantPrisma()` runs before every query on that connection. §7 shows ten call sites
where it does not.

---

## 6. Access-path inventory

Model → table (from `@@map`; a grep for `prisma.stop.` returns zero):
`CarrierStop` → `stops` · `RouteTemplateStop` → `route_template_stops` ·
`CarrierDocument` → `carrier_documents`.

### Direct model access

| model | reads | writes |
|---|---|---|
| `CarrierStop` | **42** | **22** |
| `CarrierDocument` | 16 | 8 |
| `RouteTemplateStop` | 5 | 3 |
| **total** | **63** | **33** |

31 distinct files touch the three models.

### Nested relation access — invisible to a table-name grep

`stops: { … }` appears at **34 sites**. Critically, the relation name is overloaded:

| declaring model | relation type | real table |
|---|---|---|
| `Trip` | `CarrierStop[]` | **`stops`** |
| `CarrierLoad` | `CarrierStop[]` | **`stops`** |
| `CarrierClient` | `CarrierStop[]` | **`stops`** |
| `CarrierFacility` | `CarrierStop[]` | **`stops`** |
| **`Route` (legacy)** | **`RouteStop[]`** | **`RouteStop` — a different table** |

**A policy on `stops` governs the first four and not the fifth.** Any audit that counts
`stops: {` without separating the legacy `Route` include overstates the blast radius —
the two-route-systems trap. A further 9 nested includes cover documents/template stops.

Highest-density parents: `lib/carrier/notifications.ts` (3), `lib/carrier/trips.ts` (2),
`lib/document-import/template-lookup.ts` (2), `lib/document-import/optimisation-service.ts`
(2), `app/(owner)/actions/routes.ts` (2, legacy), `app/(driver)/actions/driver-routes.ts`
(2), `app/api/mobile/owner/routes/[id]/route.ts` (2, legacy).

### Cron and `after()`

- **Cron: none.** No route under `app/api/cron/` touches any of the three models.
- **`after()`: 8 files** — `lib/carrier/{dispatch-generator,loads,stop-completion,stops,trips}.ts`,
  `lib/document-import/commit-service.ts`, and the two message routes below.

---

## 7. The ten bare-`prisma` sites — what breaks the moment a policy exists

Of 31 files, **21 use `getTenantPrisma()`** and **10 use the bare `prisma` singleton**, which
never sets `app.current_tenant_id`:

| # | file | note |
|---|---|---|
| 1 | `app/(driver)/actions/driver-routes.ts` | |
| 2 | `app/(owner)/carrier/loads/[id]/page.tsx` | |
| 3 | `app/(owner)/carrier/stops/[id]/page.tsx` | |
| 4 | `app/(owner)/carrier/trips/[id]/page.tsx` | |
| 5 | `app/(owner)/carrier/trips/[id]/stops/page.tsx` | |
| 6 | `app/api/driver/stops/[stopId]/documents/route.ts` | |
| 7 | **`app/api/driver/stops/[stopId]/messages/route.ts`** | **also uses `after()`** |
| 8 | `app/api/mobile/carrier/driver/dispatches/[id]/expenses/route.ts` | |
| 9 | `app/api/mobile/carrier/driver/stops/[stopId]/documents/route.ts` | |
| 10 | **`app/api/v1/carrier/stops/[id]/messages/route.ts`** | **also uses `after()`** |

Two failure modes, and the second is worse:

- **On a fresh pooled connection** the GUC is `''` → `current_tenant_id()` is NULL → the
  policy denies. Reads return zero rows; writes are rejected. Fails closed — noisy, safe.
- **On a reused connection** where `getTenantPrisma()` ran earlier for a *different* tenant,
  the session-scoped GUC still holds that tenant's id. A bare-prisma query then evaluates
  the policy against **the wrong tenant**. This is the documented pool-leak hazard, and a
  policy converts it from theoretical into a live cross-tenant read path.

Sites 7 and 10 are the sharpest: bare prisma **and** `after()`, so they run after the
response with no request context at all.

---

## 8. Drafted policies — NOT APPLIED

**Confidence: HIGH for the two stop tables, QUALIFIED for `carrier_documents`.** These are
*reconstructed from the repo's own `quick410` migration*, not invented — the intended text
survives in version control even though the policies do not.

**They must not be restored verbatim. See §8.4 — the write policies are broken as written.**

### 8.1 `route_template_stops`

```sql
CREATE POLICY route_template_stops_org_select ON route_template_stops
  FOR SELECT USING (
    route_template_id IN (SELECT id FROM route_templates WHERE org_id = current_tenant_id())
  );
-- _org_insert (WITH CHECK), _org_update (USING), _org_delete (USING): same join,
-- each additionally gated on (auth.jwt() ->> 'role') IN ('OWNER','MANAGER')  -- SEE 8.4
```

### 8.2 `stops`

```sql
CREATE POLICY stops_org_select ON stops
  FOR SELECT USING (
    (dispatch_id IS NOT NULL AND dispatch_id IN
       (SELECT id FROM dispatches WHERE org_id = current_tenant_id()))
    OR
    (load_id IS NOT NULL AND load_id IN
       (SELECT id FROM loads WHERE org_id = current_tenant_id()))
  );
-- _org_insert / _org_update / _org_delete: same predicate, each gated on
-- (auth.jwt() ->> 'role') IN ('OWNER','MANAGER')  -- SEE 8.4
-- plus stops_driver_select / stops_driver_update, which use auth.uid() (see 8.4).
```

Since `dispatch_id` is NOT NULL, the first branch alone is total; the `load_id` branch is
redundant for coverage but harmless.

### 8.3 `carrier_documents` — the additional consideration

Its select policy is genuinely polymorphic, reaching tenancy through five optional parents
plus the uploader:

```sql
CREATE POLICY carrier_documents_select ON carrier_documents
  FOR SELECT USING (
    uploaded_by = auth.uid()
    OR (client_id   IS NOT NULL AND client_id   IN (SELECT id FROM clients   WHERE org_id = current_tenant_id()))
    OR (stop_id     IS NOT NULL AND stop_id     IN (
          SELECT s.id FROM stops s JOIN dispatches d ON s.dispatch_id = d.id WHERE d.org_id = current_tenant_id()
          UNION
          SELECT s.id FROM stops s JOIN loads l      ON s.load_id     = l.id WHERE l.org_id = current_tenant_id()))
    OR (dispatch_id IS NOT NULL AND dispatch_id IN (SELECT id FROM dispatches WHERE org_id = current_tenant_id()))
    OR (load_id     IS NOT NULL AND load_id     IN (SELECT id FROM loads      WHERE org_id = current_tenant_id()))
    OR (contract_id IS NOT NULL AND contract_id IN (SELECT id FROM contracts  WHERE org_id = current_tenant_id()))
  );
```

**The orphan problem is real and structural.** All five FKs are nullable *and*
`ON DELETE SET NULL`, so deleting a parent actively manufactures a document that no branch
can reach. Today: **41 documents, 0 fully orphaned** (26 dispatch, 35 client, 25 stop,
5 contract, 2 load). So the policy is safe *now*, and one parent deletion away from making
a document permanently invisible and un-updatable — with no error, because RLS filters
rather than raises. **This table needs a real `org_id` column, not a cleverer join.** That
is a schema change, out of scope here, and it is the reason `carrier_documents` should not
ride the same migration as the other two.

Note also `uploaded_by = auth.uid()` is a *broadening* term: it lets a user read their own
uploads regardless of tenant. Under Prisma `auth.uid()` is NULL, so the branch is inert —
harmless, but it means the policy behaves differently under PostgREST than under the app.

### 8.4 Why verbatim restoration would break every write

Every `INSERT`/`UPDATE`/`DELETE` policy above is gated on:

```sql
(auth.jwt() ->> 'role') IN ('OWNER', 'MANAGER')
```

`auth.jwt()` is defined as:

```sql
SELECT coalesce(nullif(current_setting('request.jwt.claim',  true), ''),
                nullif(current_setting('request.jwt.claims', true), ''))::jsonb
```

That GUC is set by **PostgREST**, not by Prisma. Under the application connection
`auth.jwt()` is NULL, `NULL ->> 'role'` is NULL, and `NULL IN (…)` is NULL — **not true**, so
the policy denies. quick-410 replaced the broken `org_id` claim with `current_tenant_id()`
but **left the `role` claim in place**, so the reads were fixed and the writes were not.

The consequence is precise: restoring these policies as written would leave reads working
and make **every write to all three tables fail**, for all 33 direct write sites. Whoever
restores them must replace the role gate with a mechanism the app actually sets — the
existing `app.current_user_id` / `app.bypass_rls` GUCs are the candidates — or drop the
role dimension and rely on application-layer authorisation, which is what enforces it today
anyway. **I am not drafting that replacement here**: choosing between "add a role GUC" and
"drop the role check" is a security decision, not a reconstruction, and the brief says to
say so rather than invent.

### 8.5 The control pattern is *not* what these tables should get

`bypass_rls_policy` + `tenant_isolation_policy` on `org_id` cannot be applied — there is no
`org_id`. But the **`bypass_rls_policy` half should be added**, since it is uniform across
all four controls and `lib/auth/supabase.ts:147`, `lib/automations/evaluator.ts:95,203` and
`sender-config.ts` all set `app.bypass_rls = 'on'` expecting it to be honoured. Without it,
those deliberate bypass paths silently stop working on these three tables.

---

## Assessment

**These cannot go in one migration, and `carrier_documents` should not be in the same
migration as the other two.** `stops` and `route_template_stops` are tractable together:
each has a single NOT NULL parent carrying a NOT NULL `org_id`, so the join predicate is
total, and their reconstruction is high-confidence because the intended SQL is still in the
repo. `carrier_documents` is a different problem — five nullable `ON DELETE SET NULL`
parents mean the schema actively produces rows no policy can reach, and the honest fix is an
`org_id` column, which is a schema change with a backfill. Staging that separately also
keeps the risky half away from the tractable half. Before any of it, two things must be
settled: the `auth.jwt() ->> 'role'` gate has to be replaced or removed, or the migration
that "restores tenant isolation" will instead take every write offline; and the ten
bare-`prisma` call sites must be moved to `getTenantPrisma()`, because a session-scoped GUC
plus a pooled connection turns those from fail-closed into a cross-tenant read path the
moment a policy starts consulting the GUC. A staging order that respects all of this:
(1) fix the ten bare-prisma sites, (2) decide the role-gate replacement, (3) policy
`stops` + `route_template_stops` with `bypass_rls_policy` included, (4) add `org_id` to
`carrier_documents` and policy it last.

**Access paths that break the moment a policy exists** — all ten bare-`prisma` sites:
`app/(driver)/actions/driver-routes.ts`; `app/(owner)/carrier/loads/[id]/page.tsx`;
`app/(owner)/carrier/stops/[id]/page.tsx`; `app/(owner)/carrier/trips/[id]/page.tsx`;
`app/(owner)/carrier/trips/[id]/stops/page.tsx`;
`app/api/driver/stops/[stopId]/documents/route.ts`;
`app/api/driver/stops/[stopId]/messages/route.ts` *(also `after()`)*;
`app/api/mobile/carrier/driver/dispatches/[id]/expenses/route.ts`;
`app/api/mobile/carrier/driver/stops/[stopId]/documents/route.ts`;
`app/api/v1/carrier/stops/[id]/messages/route.ts` *(also `after()`)*.
Plus, if the policies are restored verbatim, **all 33 direct write sites** across the three
models (22 `CarrierStop`, 8 `CarrierDocument`, 3 `RouteTemplateStop`) — via the
`auth.jwt() ->> 'role'` gate, not via the tenant join.

**Also true today, and worth stating on its own:** all three models are listed in
`EXEMPT_MODELS` in `lib/db/extensions/tenant-rls.ts`, so the app-layer extension injects no
tenant filter for them. With zero database policies as well, **neither layer is enforcing
tenant isolation on these three tables right now.** What stands in for it is that callers
generally query through a parent id they already scoped — a convention, not a control, and
one the ten bare-`prisma` sites are not obliged to follow.
