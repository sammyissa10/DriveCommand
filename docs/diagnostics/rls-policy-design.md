# RLS Policy Design — `stops`, `route_template_stops`, `carrier_documents`

**Date:** 2026-09-03 · **Task:** quick-588 · **Type:** read-only diagnostic
**Project:** Supabase `oqdhberkghtnszrkdvfm` (Postgres 17.6) · **Connected role:** `postgres`

Nothing was created, altered or dropped. No migration run. No source file modified.
Follows quick-583 (the gap), quick-584 (the forensics + detector), quick-585 (the CI
detector), quick-586 (the client conversions) and quick-587 (the bypass-flag removals).

Two design decisions were settled before this task and are assumed throughout:
**none of the three tables gets a `bypass_rls_policy`**, and **no write policy gates on
`auth.jwt() ->> 'role'`** — Prisma never sets that GUC; authorization stays in the
application layer and RLS does tenant isolation only.

---

## 1. `carrier_documents` tenancy path — the four questions

### 1a. Is `uploaded_by` non-null at the schema level, or merely in current data?

**At the schema level.** `information_schema.columns` reports:

| column | type | nullable |
|---|---|---|
| **`uploaded_by`** | uuid | **NO** |
| `parent_id` | uuid | NO |
| `parent_type` | text | NO |
| `client_id`, `contract_id`, `dispatch_id`, `load_id`, `stop_id` | uuid | **YES** (all five) |

And its FK is `ON DELETE **RESTRICT**` — the only one of the eight FKs on this table that is
not `SET NULL`. So the uploader link is both **structurally non-null** and
**structurally non-orphanable**: Postgres will refuse to delete a `User` that any document
references.

The far end is equally solid: **`"User"."tenantId"` is `NOT NULL`**, and the `UserRole` enum
is exactly `OWNER|MANAGER|DRIVER` — **there is no `SYSADMIN` member**. Every user belongs to
exactly one tenant, by constraint.

`parent_id` is also NOT NULL, but it is a **polymorphic pointer with no FK constraint**, so
it cannot be joined reliably and is not a candidate.

### 1b. Can any code path insert without it?

**No.** The column is `NOT NULL` with no default, so an omitting insert is a database error,
not a null row. Both `carrierDocument.create` call sites set it explicitly
(`uploadedBy: session.userId` / `auth.userId`), and quick-587 established that neither can
be reached without a validated, tenant-owned parent stop. Production: **0 of 41 rows** have a
null uploader.

### 1c. Can a user belong to a different tenant than the document's parent stop?

**Checked against production data, not reasoned about.** For all 41 rows I computed the
tenant twice — once via `uploaded_by → "User"."tenantId"`, once via the parent chain
(`stop_id → stops → dispatches.org_id`, or `dispatch_id`, `load_id`, `client_id`,
`contract_id`) — and compared:

| measure | result |
|---|---|
| documents | 41 |
| parent tenant unresolvable | **0** |
| uploader tenant null | **0** |
| **paths that DISAGREE** | **0** |
| distinct parent paths in use | 4 (`stop`, `dispatch`, `load`, `client`) |

**Zero disagreements**, across four different parent shapes. Independently corroborated: the
two EXPLAIN ANALYZE runs in §1d used the two different predicates and **both returned the
same 26 rows**.

The mechanism that could cause disagreement is a cross-tenant upload — a user in tenant B
attaching a document to tenant A's stop. There is no role that would do this legitimately:
the enum has no `SYSADMIN`, so the sysadmin portal cannot be the uploader on this FK
(it points at `"User"`). It would take an application bug.

### 1d. Query-plan cost — join versus direct column

Measured with `EXPLAIN (ANALYZE, BUFFERS)` on production:

| design | plan | execution | buffers | est. cost |
|---|---|---|---|---|
| **A — `uploaded_by` join** | Hash Join, `User_pkey` reachable | **0.205 ms** | **7** | 6.48 |
| **C — five-parent disjunction** | Seq Scan + 5 SubPlans, incl. **seq scan of all 750 `stops`** | **12.230 ms** | **79** | 572.74 |

**~60× the execution time and ~11× the buffers**, on a 41-row table. The gap widens with
scale: option C's stop path already seq-scans the whole `stops` table.

Option **B (a real `org_id` column)** would be cheaper still — a direct
`org_id = current_tenant_id()` comparison, exactly the `facilities` control pattern, index-
supported and essentially free. Not measured because the column does not exist and this task
applies no DDL.

One index note: **there is no index on `carrier_documents.uploaded_by`** (all five parent FKs
are indexed; the uploader is not). This does *not* hurt the policy — per-row evaluation
probes `User_pkey` — but it would matter for any "all documents by user X" query.

---

## 2. Recommendation for `carrier_documents`

### Recommended: **Option A — join through `uploaded_by`. No schema migration.**

Stated plainly, as asked: **`uploaded_by` is sufficient, and this avoids a schema migration
entirely.**

The case:

1. **It is structurally total**, which the five parents are not. `uploaded_by` NOT NULL +
   `ON DELETE RESTRICT` + `"User"."tenantId"` NOT NULL is an unbroken, non-nullable chain
   that no deletion can sever. The parent chain has five nullable, `ON DELETE SET NULL` legs
   — so a document whose parent is deleted becomes **unreachable by any parent-based policy**
   (invisible to its owner, undeletable through the app). That is a permanent data-loss
   shape, and option A does not have it.
2. **Nothing disqualifies it.** The disqualifying condition you named — the two paths
   disagreeing for any row — is **0 of 41 in production**, across four parent shapes.
3. **It is ~60× cheaper** than the parent disjunction and needs no backfill, no new column to
   keep in sync, and no migration.

### The honest caveat, stated rather than buried

Option A makes tenancy follow **who uploaded the document**, not **whose operation the
document belongs to**. Those coincide today by constraint and by data. They would diverge if
a genuine cross-tenant uploader were ever introduced (a support/sysadmin "upload on behalf
of" feature). If that is ever built, option A must be revisited — a real `org_id` column
becomes correct at that point. **This is a forward-looking risk, not a current defect.**

Also worth stating: option A's failure direction is *safe*. If a cross-tenant row ever did
appear, the document would be visible to the uploader's tenant and hidden from the parent's —
a visibility bug, not a leak of the parent tenant's data to a third party.

**Not recommended: option C (parent disjunction)** — 60× the cost, and it structurally
strands orphaned rows.
**Not recommended now: option B (`org_id` column)** — semantically the cleanest and the
cheapest to evaluate, but it costs a migration, a backfill, and a new permanent obligation to
populate the column on every insert (a fresh failure mode). Revisit only if cross-tenant
uploads are introduced.

---

## 3. The 17 retained bypass flags — **one of them DOES touch a target table**

**This is not the reassuring answer, and it needs handling before rollout.**

Of the 17 `app.bypass_rls` flags quick-587 deliberately retained, 16 sit in transactions
touching only `FleetMessage`, `User`, `Trip` or `CarrierLoad` — none of the three tables.
**One does not:**

> **`apps/web/src/app/(owner)/carrier/stops/[id]/page.tsx` line 120**, transaction 119–153:
> `prisma.$transaction(...)` → `tx.carrierDocument.findMany({ where: { stopId: id } })`.

It is on the **bare `prisma` client**, so `app.current_tenant_id` is never set on that
connection. The moment a policy exists on `carrier_documents`:

- the bypass flag finds **no `bypass_rls_policy`** (by decision) → it does nothing;
- the GUC is unset → `current_tenant_id()` returns **NULL** → the tenant predicate is never
  true → **the query returns zero rows**.

Effect: **the owner's stop-detail page silently shows no documents.** Fails closed — safe,
but visibly broken.

This is the transaction quick-586 classified NEEDS-DECISION and quick-587 excluded, for a
good reason: it shares a transaction with `User`, which is **not** in `EXEMPT_MODELS`, so
simply swapping the client would newly apply a `tenantId` filter to the `User` read. It needs
its own handling — the cleanest being to **split the transaction**, putting the
`carrierDocument` read on a tenant client and leaving the `User` read as it is.

**It must be fixed before `carrier_documents` policies go live.** It is not urgent before the
`app_user` cutover (see §7).

---

## 4. Drafted policy set — `stops` and `route_template_stops`

Text only. **Not applied.** Modelled on the surviving `facilities` control pair, with the
`org_id = current_tenant_id()` predicate replaced by a join through the single **NOT NULL**
parent carrying a **NOT NULL** `org_id` — both verified against `information_schema`:

| table | parent FK | nullable | parent's org column | nullable |
|---|---|---|---|---|
| `stops` | `dispatch_id` → `dispatches.id` | **NO** | `dispatches.org_id` | **NO** |
| `route_template_stops` | `route_template_id` → `route_templates.id` | **NO** | `route_templates.org_id` | **NO** |

(`stops.load_id` is nullable and is deliberately **not** used — a single mandatory parent
makes the policy total.)

```sql
-- ============================================================
-- stops — tenancy via dispatch_id -> dispatches.org_id
-- No bypass policy. No role gate.
-- ============================================================
CREATE POLICY stops_tenant_select ON public.stops
  FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM public.dispatches d
                 WHERE d.id = stops.dispatch_id
                   AND d.org_id = public.current_tenant_id()));

CREATE POLICY stops_tenant_insert ON public.stops
  FOR INSERT TO public
  WITH CHECK (EXISTS (SELECT 1 FROM public.dispatches d
                      WHERE d.id = stops.dispatch_id
                        AND d.org_id = public.current_tenant_id()));

CREATE POLICY stops_tenant_update ON public.stops
  FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM public.dispatches d
                 WHERE d.id = stops.dispatch_id
                   AND d.org_id = public.current_tenant_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.dispatches d
                      WHERE d.id = stops.dispatch_id
                        AND d.org_id = public.current_tenant_id()));

CREATE POLICY stops_tenant_delete ON public.stops
  FOR DELETE TO public
  USING (EXISTS (SELECT 1 FROM public.dispatches d
                 WHERE d.id = stops.dispatch_id
                   AND d.org_id = public.current_tenant_id()));

-- ============================================================
-- route_template_stops — tenancy via route_template_id -> route_templates.org_id
-- ============================================================
CREATE POLICY route_template_stops_tenant_select ON public.route_template_stops
  FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM public.route_templates rt
                 WHERE rt.id = route_template_stops.route_template_id
                   AND rt.org_id = public.current_tenant_id()));

CREATE POLICY route_template_stops_tenant_insert ON public.route_template_stops
  FOR INSERT TO public
  WITH CHECK (EXISTS (SELECT 1 FROM public.route_templates rt
                      WHERE rt.id = route_template_stops.route_template_id
                        AND rt.org_id = public.current_tenant_id()));

CREATE POLICY route_template_stops_tenant_update ON public.route_template_stops
  FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM public.route_templates rt
                 WHERE rt.id = route_template_stops.route_template_id
                   AND rt.org_id = public.current_tenant_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.route_templates rt
                      WHERE rt.id = route_template_stops.route_template_id
                        AND rt.org_id = public.current_tenant_id()));

CREATE POLICY route_template_stops_tenant_delete ON public.route_template_stops
  FOR DELETE TO public
  USING (EXISTS (SELECT 1 FROM public.route_templates rt
                 WHERE rt.id = route_template_stops.route_template_id
                   AND rt.org_id = public.current_tenant_id()));
```

Both tables already have `RLS ENABLED` **and** `FORCE RLS`, so no `ALTER TABLE` is needed —
only the policies. `app_user` already holds `SELECT, INSERT, UPDATE, DELETE` on both
(verified).

Indexes exist for both joins (`stops_dispatch_id_idx`,
`route_template_stops_route_template_id_idx`), so the per-row probe is an index scan.

---

## 5. Drafted policy set — `carrier_documents` (per §2, uploaded_by design)

```sql
-- ============================================================
-- carrier_documents — tenancy via uploaded_by -> "User"."tenantId"
-- uploaded_by is NOT NULL and ON DELETE RESTRICT; "User"."tenantId" is NOT NULL.
-- No bypass policy. No role gate.
-- ============================================================
CREATE POLICY carrier_documents_tenant_select ON public.carrier_documents
  FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM public."User" u
                 WHERE u.id = carrier_documents.uploaded_by
                   AND u."tenantId" = public.current_tenant_id()));

CREATE POLICY carrier_documents_tenant_insert ON public.carrier_documents
  FOR INSERT TO public
  WITH CHECK (EXISTS (SELECT 1 FROM public."User" u
                      WHERE u.id = carrier_documents.uploaded_by
                        AND u."tenantId" = public.current_tenant_id()));

CREATE POLICY carrier_documents_tenant_update ON public.carrier_documents
  FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM public."User" u
                 WHERE u.id = carrier_documents.uploaded_by
                   AND u."tenantId" = public.current_tenant_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public."User" u
                      WHERE u.id = carrier_documents.uploaded_by
                        AND u."tenantId" = public.current_tenant_id()));

CREATE POLICY carrier_documents_tenant_delete ON public.carrier_documents
  FOR DELETE TO public
  USING (EXISTS (SELECT 1 FROM public."User" u
                 WHERE u.id = carrier_documents.uploaded_by
                   AND u."tenantId" = public.current_tenant_id()));
```

**Note the quoting.** `"User"` is PascalCase and `"tenantId"` is camelCase — unquoted
identifiers here are a silent wrong answer, the DEC-14 / DEC-1 family.

**A caveat that applies to all three drafts:** a policy's subquery is itself subject to the
referenced table's RLS. `dispatches`, `route_templates` and `"User"` all carry
`tenant_isolation_policy`, so each subquery additionally sees only same-tenant rows. Here
that is **reinforcing, not breaking** — it can only narrow an already-correct predicate, and
the failure direction is closed. There is no policy cycle: none of `dispatches`,
`route_templates` or `"User"` references the three tables in its own policy.

---

## 6. Rollout risk — every access path that breaks the moment policies exist

### 6a. Scope of the nested-include audit (quick-586 left this open)

Audited in full: **46 nested-include sites** across 31 files, resolved by walking each
`stops:` / `documents:` / `carrierDocuments:` / `routeTemplateStops:` key back to its root
model and its client. Not materially larger than this task — it is reported complete.

Relation ownership was read off `schema.prisma` rather than inferred, which is what separates
the real hits from the look-alikes:

| relation | owning models | target table |
|---|---|---|
| `stops` | Trip, CarrierLoad, CarrierClient, CarrierFacility | **`stops`** ✅ |
| `stops` | **RouteTemplate** | **`route_template_stops`** ✅ |
| `stops` | **`Route` (legacy)** | `RouteStop` — **different table** ❌ |
| `documents` / `carrierDocuments` | Trip, CarrierLoad, CarrierStop, CarrierContract, CarrierClient, CarrierDocumentType | **`carrier_documents`** ✅ |
| `documents` | **`Truck`, `Load`, `Route`, `Tenant` (legacy)** | legacy `Document` — **different table** ❌ |

**Corrected count: 46 raw sites → 30 genuinely reach the three tables.** Excluded:

- **6 legacy `Route.stops` → `RouteStop`** — `(owner)/actions/routes.ts:170,622`,
  `api/mobile/owner/routes/route.ts:242`, `api/mobile/owner/routes/[id]/route.ts:51,187`,
  `lib/geofencing/geofence-check.ts:192`.
- **2 more legacy `Route.stops`, nested under a `route:` include** —
  `api/mobile/driver/loads/[id]/route.ts:62` and `api/mobile/owner/loads/[id]/route.ts:69`.
  Both are `route: { include: { stops } }`; one carries the comment *"Stops come through the
  Route relation"*. A useful discriminator emerged: **`orderBy: { position }` is `RouteStop`;
  `orderBy: { sequenceOrder }` is `CarrierStop`.**
- **4 legacy `Truck.documents` → `Document`** — `(owner)/actions/trucks.ts:286,366`,
  `api/mobile/owner/trucks/route.ts:192`, `api/mobile/owner/trucks/[id]/route.ts:71`.
- **4 non-Prisma false positives** — `lib/geo/osrm.ts:135` (an OSRM payload),
  `lib/document-import/facility-resolution.ts:127`, `resolution.ts:1206` (consignment
  objects), `lib/trucks/compute-truck-status.ts:59` (a **TypeScript interface field**).
- **3 test fixtures** — `lib/document-import/__tests__/facility-ladder.test.ts:376,418,468`.

### 6b. Sites that WOULD FAIL CLOSED — 10, in 5 files

These reach one of the three tables on the **bare `prisma` singleton**, so no
`app.current_tenant_id` is set. With a policy live and no bypass policy, each returns **zero
rows**.

| # | site | relation → table | client |
|---|---|---|---|
| 1 | `app/(driver)/actions/driver-routes.ts:59` | Trip.stops → `stops` | `prisma.$transaction` @46 |
| 2 | `app/(driver)/actions/driver-routes.ts:65` | CarrierStop.documents → `carrier_documents` | same tx |
| 3 | `app/(driver)/actions/driver-routes.ts:143` | Trip.stops → `stops` | `prisma.$transaction` @122 |
| 4 | `app/(driver)/actions/driver-routes.ts:149` | CarrierStop.documents → `carrier_documents` | same tx |
| 5 | `app/(driver)/actions/driver-load.ts:68` | CarrierLoad.stops → `stops` | `prisma.$transaction` |
| 6 | `app/api/mobile/carrier/driver/dispatches/route.ts:61` | Trip.stops → `stops` | `prisma.$transaction` |
| 7 | `app/api/mobile/carrier/driver/dispatches/route.ts:70` | Trip.documents → `carrier_documents` | same tx |
| 8 | `app/api/mobile/carrier/driver/dispatches/[id]/route.ts:74` | Trip.stops → `stops` | `prisma.$transaction` |
| 9 | `app/api/mobile/carrier/driver/dispatches/[id]/route.ts:78` | Trip.documents → `carrier_documents` | same tx |
| 10 | `app/(owner)/carrier/stops/[id]/page.tsx:121` | **direct** `carrierDocument.findMany` | `prisma.$transaction` @119 (§3) |

Sites 1–4 are exactly the four quick-586 reported and did not convert. Sites 5–9 are new
findings from this audit. Site 10 is the §3 bypass-flag site.

**User-visible effect:** the driver's route/dispatch screens lose their stop lists and stop
documents; the owner's stop-detail page loses its document list. All fail closed — no leak.

### 6c. Sites that are already SAFE — 20

- **10 on `tenantPrisma`**: `api/v1/carrier/route-templates/active/route.ts:35`,
  `lib/carrier/dispatch-generator.ts:221`, `loads.ts:150`, `notifications.ts:99,258,824`,
  `pay-calculator.ts:75`, `route-templates.ts:212`, `trips.ts:171,798`.
- **7 on `db`**, confirmed tenant-scoped (`getTenantPrismaForOrg(...)` or a passed-in
  `PrismaClient`): `api/cron/trip-reminders/route.ts:98`,
  `api/mobile/carrier/owner/dispatches/[id]/route.ts:59`, `lib/carrier/board-lookup.ts:277`,
  `lib/document-import/optimisation-service.ts:407,555`, `template-lookup.ts:244,254`.
- **3 that look bare but are not**: `app/(owner)/actions/load-driver-assignments.ts:250`
  reads `prisma.carrierLoad.findUnique({ ... stops ... })`, but that file has **no bare
  import** — `prisma` is **shadowed** four times by `const prisma = await getTenantPrisma()`.
  **A grep for `prisma.` would have misclassified this as fail-closed.** Always check for
  shadowing before calling a site bare.

---

## 7. Staging, rollback, and whether early application is safe

### One migration or staged?

**All three tables can go in one migration.** They are independent — no policy references
another of the three, so there is no ordering constraint and no cycle. All three already have
`RLS ENABLED` + `FORCE RLS`, so the migration is 12 `CREATE POLICY` statements and nothing
else: no `ALTER TABLE`, no backfill, no data movement, no lock beyond a brief
`ACCESS EXCLUSIVE` per table for the catalog write. `app_user` already holds full DML on all
three (verified), so no `GRANT` is needed either.

The one reason to stage would be if `carrier_documents` were still undecided — it is not, but
it is the design carrying the §2 caveat, so splitting it into its own migration is a
reasonable *optional* choice if you want to be able to roll it back independently.

### Rollback

Trivially clean: `DROP POLICY IF EXISTS <name> ON <table>;` × 12. Because none of the three
tables has any policy today, dropping returns them to exactly their current state — RLS
enabled and forced with zero policies. There is no data change to undo. **Pair every
`CREATE POLICY` with its `DROP POLICY IF EXISTS` in a committed `rollback.sql`, per the
repo's existing convention** — and note quick-584's finding that quick-410's `rollback.sql`
recreates only 11 of the 14 it drops, so write the rollback to be symmetric and check it.

**Per DEC-17, the `_prisma_migrations` row must be written by hand** — neither MCP tool
writes it. Query the table and read the newest row back afterwards; do not infer.

### Is applying before the `app_user` cutover safe, or does it defer a defect?

The premise is confirmed, not assumed: `pg_roles` shows **`postgres` has `rolbypassrls = true`**
and **`app_user` has `rolbypassrls = false`**. The application connects as `postgres` today,
so **every policy written now is inert** — `BYPASSRLS` short-circuits policy evaluation
entirely.

**It defers a defect to cutover day. Both halves of that are true and neither should be
softened:**

- **Applying early is safe** in the narrow, literal sense: it cannot break production today,
  because nothing evaluates it. It also gets the policies into `_prisma_migrations` and under
  the quick-585 drift detector, which is where they belong and is a real benefit — the
  detector currently carries all 59 of these as baseline entries, and applying the policies is
  what starts shrinking that file.
- **But it hides the ten fail-closed sites in §6b plus the one in §3 until the cutover.**
  Applying the policies does not test them. The first moment anyone learns whether this design
  works is the moment `DATABASE_URL` flips — and on that day eleven access paths across driver
  route screens, mobile dispatch endpoints and the owner stop-detail page will start returning
  zero rows simultaneously. That is a fail-closed, no-leak failure, but it is a broad,
  same-instant, hard-to-triage one.

**Recommendation, stated plainly: apply the policies early *only if* the eleven sites are
fixed first, or accept that the cutover is the real test and schedule it as such.** The
policies themselves are not the risk; the eleven unconverted access paths are, and they are
equally broken whether the policies are applied today or on cutover day. Applying early
without fixing them converts a *known* list into a *silent* one, because nothing between now
and cutover will exercise it.

The way to get real signal before cutover — not built here, named as the next step — is to
run the existing isolation tests, or any smoke test of those eleven paths, **against a
connection using `app_user` rather than `postgres`**. That is the only thing that turns this
list from a prediction into a measurement.

---

## Appendix — what was verified live for this report

| fact | source |
|---|---|
| `uploaded_by` NOT NULL; five parents nullable | `information_schema.columns` |
| `uploaded_by` FK is `ON DELETE RESTRICT`; five parents `SET NULL` | `pg_constraint` |
| `"User"."tenantId"` NOT NULL; `UserRole` = OWNER\|MANAGER\|DRIVER | `information_schema` + `pg_enum` |
| 41 documents, 0 tenancy-path disagreements, 4 parent shapes | live query |
| plan costs 0.205 ms / 7 buffers vs 12.230 ms / 79 buffers | `EXPLAIN (ANALYZE, BUFFERS)` |
| no index on `carrier_documents.uploaded_by` | `pg_index` |
| `stops.dispatch_id`, `dispatches.org_id`, `route_template_stops.route_template_id`, `route_templates.org_id` all NOT NULL | `information_schema.columns` |
| three tables: RLS on, FORCE on, **0 policies**; siblings carry `bypass_rls_policy` | `pg_class` + `pg_policy` |
| `postgres` BYPASSRLS true, `app_user` false | `pg_roles` |
| `app_user` holds SELECT/INSERT/UPDATE/DELETE on all three | `information_schema.role_table_grants` |
| 46 nested-include sites → 30 real, 10 fail-closed | source scan over `apps/web/src` |
