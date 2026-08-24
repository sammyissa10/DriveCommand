# quick-530 — Pre-Phase-8 DDL batch: enum alignment, facility soft-delete, country normalisation

**Date:** 2026-08-24
**Branch:** feature/document-import
**Commits:** `92cf1dea`, `0c96ae94`, `370b9302`, `14a26fbb`
**Project:** Supabase `oqdhberkghtnszrkdvfm` (production — there is no non-production database)

Three tracked schema debts sitting on or beside Phase 8's atomic commit path, batched so there
is one schema-diff verification rather than three.

---

## Step 1 — the pre-read (`pg_get_constraintdef`, before any change)

```
facilities_facility_type_check
  CHECK ((facility_type = ANY (ARRAY['terminal'::text, 'yard'::text, 'warehouse'::text, 'drop_yard'::text, 'customer_site'::text, 'driver_residence'::text])))

route_template_stops_stop_type_check
  CHECK ((stop_type = ANY (ARRAY[('pickup'::character varying)::text, ('delivery'::character varying)::text, ('fuel_stop'::character varying)::text, ('layover'::character varying)::text])))

stops_stop_type_check
  CHECK ((stop_type = ANY (ARRAY[('pickup'::character varying)::text, ('delivery'::character varying)::text, ('fuel_stop'::character varying)::text, ('layover'::character varying)::text, ('relay_handoff'::character varying)::text])))
```

Supporting pre-reads: `facilities` had 24 columns, **no `active`, no `deleted_at`**; `country`
`NOT NULL DEFAULT 'US'::text` holding `US` × 46 (11 orgs) and `United States` × 5 (2 orgs).

Note the shape difference the pre-read exposed and that the fix had to respect: the two
`stop_type` constraints are spelled with a `varchar → text` cast, `facilities_facility_type_check`
with bare `text`. Rebuilding item 1 in the bare-text shape would have left two constraints that
mean the same thing and *read* differently, making any future `pg_get_constraintdef` diff of the
pair noise rather than signal.

---

## Step 7 — the live re-read, after every change (verbatim)

```
facilities_facility_type_check
  CHECK ((facility_type = ANY (ARRAY['terminal'::text, 'yard'::text, 'warehouse'::text, 'drop_yard'::text, 'customer_site'::text, 'driver_residence'::text])))

route_template_stops_stop_type_check
  CHECK ((stop_type = ANY (ARRAY[('pickup'::character varying)::text, ('delivery'::character varying)::text, ('fuel_stop'::character varying)::text, ('layover'::character varying)::text, ('relay_handoff'::character varying)::text])))

stops_stop_type_check
  CHECK ((stop_type = ANY (ARRAY[('pickup'::character varying)::text, ('delivery'::character varying)::text, ('fuel_stop'::character varying)::text, ('layover'::character varying)::text, ('relay_handoff'::character varying)::text])))
```

- `route_template_stops_stop_type_check` and `stops_stop_type_check` are now **character-for-character
  identical apart from nothing at all** — the definitions are the same string, since the table name
  does not appear in the body.
- `facilities_facility_type_check` is **unchanged**: six values, no `inactive_` anything. It was not
  widened, per the constraint on this task.
- `stops_stop_type_check` is **unchanged**. It was already correct and was not touched.

### Functional proof, not just textual

A constraint that *reads* right can still reject. Insert-then-rollback inside a `DO` block:

```sql
INSERT INTO route_template_stops (route_template_id, sequence_order, stop_type, facility_id)
VALUES (v_tid, v_seq, 'relay_handoff', v_fid);
RAISE EXCEPTION 'PROBE_OK_RELAY_HANDOFF_ACCEPTED_THEN_ROLLED_BACK';
```

Result:

```
ERROR: P0001: PROBE_OK_RELAY_HANDOFF_ACCEPTED_THEN_ROLLED_BACK
CONTEXT: PL/pgSQL function inline_code_block line 14 at RAISE
```

`P0001` raised at **line 14** — meaning execution reached the `RAISE` *after* the insert. Had the
CHECK rejected the value, the error would have been `23514` at the `INSERT`. The raise aborts the
block, so the row rolled back. Residue check afterwards: `SELECT count(*) FROM route_template_stops
WHERE stop_type = 'relay_handoff'` → **0**.

---

## Step 3 — DEC-3 mirrors, verified

All DDL applied through Supabase MCP `apply_migration`. No local `prisma migrate deploy` was run and
no local Postgres was contacted.

```
migration_name                                     | applied_steps_count | finished_at                   | rolled_back_at
---------------------------------------------------+---------------------+-------------------------------+---------------
20260823120000_route_template_stops_relay_handoff  | 0                   | 2026-08-24 04:18:42.033847+00 | null
20260823120100_facilities_deleted_at               | 0                   | 2026-08-24 04:18:42.033847+00 | null
20260823120200_facilities_country_normalise        | 0                   | 2026-08-24 04:18:42.033847+00 | null
```

All three: `applied_steps_count = 0`, non-null `finished_at`, `rolled_back_at` null. Row shape
(checksum / logs / rolled_back_at) was copied from the existing
`20260811120000_end_stop_facility_and_matrix_cache` row rather than guessed.

Checksums are the SHA-256 of the LF bytes of each `migration.sql`, which is the convention the repo
already uses — verified by recomputing the previous migration's checksum from its on-disk bytes and
matching the value stored in `_prisma_migrations` exactly
(`ce450c15b89271ae1714f2c6dec3bcb158050238531eb009e696562548fb544a`).

> **Noted, not introduced, not fixed here:** `core.autocrlf=true` with no `.gitattributes` means a
> fresh clone would check these files out as CRLF, and every migration checksum in the repo would
> then mismatch — not just these three. That is a pre-existing repo-wide condition affecting all
> migrations equally. Matching the existing LF convention was the only consistent choice available.

---

## Item 1 — `relay_handoff` enum alignment · **IMPLEMENTED**

`stops` has admitted five stop types since it was seeded; `route_template_stops` admitted four. The
split is invisible until something writes both tables in one transaction — which is exactly Phase 8's
commit path, since it materialises stops and then creates or updates a route template. A relay-handoff
trip committed its stop and then took a 23514 on the template, rolling back a valid trip.

Same class as DEC-14 and the `facility_type` drift: a CHECK seeded early that never tracked the app's
vocabulary. Read off `pg_constraint`, never inferred.

---

## Item 2 — facility soft-delete (B4) · **IMPLEMENTED**

### What was actually broken

`softDeleteFacility` wrote `inactive_${type}` into `facility_type`. `facilities_facility_type_check`
admits six values and none carries an `inactive_` prefix, so **that write has always been a 23514 —
soft delete has never once worked in production**. The consequence worth recording is the second-order
one: the paired read predicate `NOT: { facilityType: { startsWith: 'inactive_' } }`, present at eight
call sites, was therefore **a no-op that merely looked like a filter**. Nothing was being excluded
because nothing was ever marked. That is why this survived so long — every symptom was absent by
construction.

Zero rows exist in the prefixed state, so no backfill was needed and none was performed.

### The DDL

`deleted_at timestamptz`, nullable, no default — matching the sibling carrier tables (`clients`,
`contracts`, `loads`, `carrier_drivers`, `carrier_trucks`, `dispatches`, `document_imports`), read off
`information_schema` rather than inferred from the convention around it.

```
column_name | data_type                   | is_nullable | column_default
deleted_at  | timestamp with time zone    | YES         | null
```

`deleted_by_id` was **deliberately not added**. Several siblings carry one, but nothing in the facility
paths reads it, and a column nothing reads is a column that comes back to life wrong. It belongs with
the code that needs it.

### Uniqueness — the reported finding

**There was nothing to convert.** The only unique index on `facilities` is `facilities_pkey` on `id`;
the other three indexes are plain btrees (`facility_type`, `org_id`, `org_id + is_driver_residence`).
No natural-key uniqueness exists, so no plain unique constraint needed converting to a partial unique
index, and **none was created**.

The standing rule still binds whoever adds the first natural key here, and there is a live candidate:
`loadFacilityCandidates` currently loads and scores in memory and its own comment says the fix at scale
is *"a stored normalised-address key with an index"*. **That index must be partial
(`WHERE deleted_at IS NULL`)**, or two facilities — one deleted, one live — at the same normalised
address will collide. Recorded in the migration header so it is found at the point of change.

### The read paths — the rule that governs them

**Filter a picker; hydrate a trip's own stops.** The same split the driver-residence work already
uses, and for the same reason: dropping a row from an itinerary blanks a facility name on a live trip.

**Group A — 18 sites, now filtering `deletedAt: null`.** Eight already carried the dead `inactive_`
predicate and had it **replaced** rather than ANDed (keeping both would imply a second soft-delete
mechanism exists); ten had no filter at all, which is the real content of this item — the broken write
left ten paths that were never taught the concept.

| # | Site | Kind |
|---|------|------|
| 1 | `lib/carrier/facilities.ts` `listFacilities` (one shared `where`, covers `findMany` + `count`) | replaced |
| 2 | `lib/carrier/facilities.ts` `getFacility` | replaced |
| 3 | `lib/carrier/facilities.ts` `updateFacility` guard | replaced |
| 4 | `lib/carrier/facility-visibility.ts` `residenceFacilityForDriver` | replaced |
| 5 | `lib/document-import/facility-lookup.ts` `loadFacilityCandidates` (T2/T3 candidate set) | replaced |
| 6 | `lib/document-import/end-stop-lookup.ts` parking candidates | replaced |
| 7 | `lib/document-import/end-stop-service.ts` designated-parking validation | replaced |
| 8 | `lib/carrier/route-template-save.ts` parking facility validation | replaced |
| 9 | `app/(owner)/carrier/loads/new/page.tsx` | **added** (picker) |
| 10 | `app/(owner)/carrier/loads/[id]/page.tsx` | **added** (picker) |
| 11 | `app/(owner)/carrier/templates/new/page.tsx` | **added** (picker) |
| 12 | `app/(owner)/carrier/templates/[id]/page.tsx` | **added** (picker) |
| 13 | `app/(owner)/carrier/trips/[id]/page.tsx` `allFacilities` | **added** (picker) |
| 14 | `lib/carrier/loads.ts` `persistStops` ownership check | **added** (write path) |
| 15 | `lib/carrier/route-template-save.ts` batch ownership check | **added** (write path) |
| 16 | `lib/carrier/stops.ts` `address_snapshot` fetch | **added** (write path) |
| 17 | `lib/carrier/fleet-drivers.ts` `homeTerminalId` (create) | **added** (write path) |
| 18 | `lib/carrier/fleet-drivers.ts` `homeTerminalId` (update) | **added** (write path) |

Sites 14–18 matter as much as the pickers: accepting a deleted facility onto a *new* stop or home
terminal is precisely what soft delete exists to stop.

**Group B — 8 sites, deliberately NOT filtered, each now carrying a comment saying so.** These fetch
facilities **by id** for stops already attached to a trip or load. Filtering them would blank the
facility name on a live itinerary — the identical failure the residence *mask* exists to avoid, which
is why residences are masked there rather than dropped.

`app/(owner)/carrier/trips/[id]/page.tsx:63` · `.../plan/page.tsx:27` · `.../stops/page.tsx:78` ·
`app/(driver)/carrier/driver/trips/page.tsx:67` · `app/(owner)/carrier/loads/[id]/page.tsx:130` ·
`lib/document-import/end-stop-lookup.ts:271` (`wanted`) ·
`app/(owner)/carrier/facilities/[id]/page.tsx:27` (audit metadata only; the sibling `getFacility`
call already gates the page) · `app/api/v1/carrier/live-map/vehicles/route.ts:408` (raw-SQL
`LEFT JOIN`, comment only, no query change).

`lib/document-import/optimisation-service.ts:133` was **not touched at all** — excluded by the task's
constraint, and Group B in any case. Confirmed absent from every commit in this task.

### Residue check

`grep -rn "inactive_" apps/web/src` (excluding generated code) returns exactly one hit: the historical
comment in `facilities.ts` explaining why `deletedAt` exists. `grep "startsWith: 'inactive_'"` returns
nothing.

---

## Item 3 — country normalisation · **IMPLEMENTED (data)** + **REPORTED (cause, no code)**

Pre-checked at 5 rows immediately before applying, so the stated stop condition (count ≠ 5) was tested
rather than assumed. Post-state:

```
country | n
US      | 51
```

46 + 5 = 51. A single value in production.

### The report — what is writing the long form

**Nothing in the codebase writes the literal `'United States'.'`** Grep across `apps/` and `packages/`
finds the string in exactly three places, none of them a write: a comment in
`scripts/backfill-facility-coordinates.ts` noting the two spellings exist, and two lines in
`lib/utils/format-address.ts` that *strip* it out of Nominatim display names.

What is actually happening is that `country` is an **unvalidated free-text passthrough at every layer**:

- the three facility forms render a plain text input with placeholder `"US"` and default `'US'` —
  `components/carrier/facilities/FacilityForm.tsx:145`,
  `app/(owner)/carrier/facilities/new/FacilityCreateMobile.tsx:49`,
  `app/(owner)/carrier/facilities/[id]/FacilityEditMobile.tsx:73`. Nothing constrains what a person
  types over the default;
- the API schema is `country: z.string().optional()` in both `api/v1/carrier/facilities/route.ts:17`
  and `api/v1/carrier/facilities/[id]/route.ts:17` — no enum, no normalisation;
- `createFacility` spreads `data` straight into `.create()`.

The address autocomplete is **not** the source: `FacilityForm.tsx:306` sets street/city/state/zip/lat/lng
on place-select and deliberately never touches `country`.

The five rows are consistent with hand-typing — all Indiana, two orgs, 2026-04-17 → 2026-07-18, three
with a null `created_by_id` (pre-dating the Wave 2 audit columns). They pre-date document-import
Phase 4 entirely, so the resolution ladder did not create them.

**The conduit that will recreate it is the import ladder.** `extractor.ts:104–115` asks the extraction
model for a `country` on every address, `resolution.ts:501` carries it through as
`address?.country?.trim() || null`, the T4 create form is pre-filled from it, and
`facility-resolution.ts:513` hands it verbatim to `createFacility`. An LLM reading a US rate
confirmation emits "United States" or "USA" far more often than "US".

**Recommended future fix: normalise once at the write boundary**, not in three separate forms — the
forms are three of the conduits, not the cause. Per the task instruction, **no code was written for
item 3.**

---

## Step 4 — EXEMPT_MODELS check (quick-528)

`CarrierFacility` is **already present** in `EXEMPT_MODELS` at
`apps/web/src/lib/db/extensions/tenant-rls.ts:76`. This task adds a **column to an existing model**,
not a new model, so **no edit was required**. Verified by grep rather than assumed — the omission this
guards against has now happened twice (quick-520 introducing it, quick-528 diagnosing it), and the
failure mode is silent: a `PrismaClientValidationError` client-side, before any SQL is emitted.

```
apps/web/src/lib/db/extensions/tenant-rls.ts:76:  'CarrierFacility', // uses orgId instead of tenantId
```

Prisma client regenerated (v7.6.0); `readonly deletedAt: FieldRef<"CarrierFacility", 'DateTime'>`
confirmed present in the generated types.

---

## Step 8 — the tsc gate, probed

The gate is a hard gate **and is known to lie**, so it was probed rather than trusted.

Probe injected at `src/lib/carrier/facilities.ts:1` — `const __quick530Probe: number = 'y';`:

```
src/lib/carrier/facilities.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'.
```

The gate reported **that specific error, and only that error** — which proves two things at once:
semantic checking of the program is running (not suppressed by a parse error elsewhere), and
everything else in the program was already clean.

Probe removed, re-run:

```
(no output — 0 errors)
```

Stray-probe sweep: `find apps/web/src -name "__probe*.ts"` → none (quick-519 found a previous
session's leftover; there is none now). Working tree clean apart from the planning directory.

### Tests

```
Test Files  14 failed | 104 passed | 8 skipped (126)
     Tests  61 failed | 1218 passed | 55 skipped | 3 todo (1337)
```

**The 61 failures are pre-existing and none belong to this task.** Established by checking out the
pre-task commit `6c5b2119` and running the identical 14 files:

```
Test Files  14 failed (14)
     Tests  61 failed | 30 passed (91)
```

Identical file set, identical failure count, at a commit that predates every change here. The failing
areas are workflows (tRPC `headers` called outside a request scope), driver-pay settlements,
notifications dispatcher, auth unit tests and validation schemas — none of which this task touches.

Scoped run over everything this task **did** touch:

```
npx vitest run src/lib/document-import src/lib/carrier tests/carrier
Test Files  35 passed | 3 skipped (38)
     Tests  533 passed | 9 skipped (542)
```

Green, including the 31-pair facility-address fixture guardrail.

---

## Per-item audit — steps 1 through 8

| Step | Item 1 (relay_handoff) | Item 2 (soft-delete) | Item 3 (country) |
|------|------------------------|----------------------|------------------|
| **1** Read constraint with `pg_get_constraintdef` before writing | **IMPLEMENTED** — pasted above; matched the stated state exactly | **IMPLEMENTED** — `facilities_facility_type_check` read, plus columns, indexes and the absence of `deleted_at` | **IMPLEMENTED** — column default and the two-spelling distribution read live |
| **2** Apply DDL via Supabase MCP only | **IMPLEMENTED** — `apply_migration`, no local Postgres | **IMPLEMENTED** — `apply_migration`, no local Postgres | **IMPLEMENTED** — `apply_migration`; data-only, no DDL |
| **3** Mirror as resolved-not-run, `applied_steps_count = 0`, non-null `finished_at` | **IMPLEMENTED** — verified by SELECT | **IMPLEMENTED** — verified by SELECT | **IMPLEMENTED** — verified by SELECT |
| **4** Update schema.prisma; EXEMPT_MODELS in this commit | **NOT APPLICABLE** — a CHECK is not expressed in schema.prisma; the model comment already documents that enforcement lives in SQL | **IMPLEMENTED** — `deletedAt` added with the read rule documented; EXEMPT_MODELS verified (no new model → no edit needed), quick-528 cited | **NOT APPLICABLE** — data only, no schema change |
| **5** Regenerate Prisma client | **NOT APPLICABLE** | **IMPLEMENTED** — v7.6.0, field confirmed in generated types | **NOT APPLICABLE** |
| **6** Fix `softDeleteFacility` and every identified read path | **NOT APPLICABLE** | **IMPLEMENTED** — write rewritten, 18 Group A sites filtered, 8 Group B sites deliberately unfiltered and commented, optimisation path untouched | **NOT DONE — BY INSTRUCTION.** Item 3 was explicitly report-only; the cause and recommended fix are written up above and no code was changed |
| **7** Re-read all three constraints live and paste output | **IMPLEMENTED** — pasted, plus an insert/rollback functional proof | **IMPLEMENTED** — `facilities_facility_type_check` confirmed **unchanged**, and `deleted_at` confirmed present | **IMPLEMENTED** — post-state `US \| 51` pasted |
| **8** Probe tsc, remove probe, run typecheck and tests | **IMPLEMENTED** — one probe covers the batch: error seen with probe, clean without; tests green in touched areas, 61 pre-existing failures proven pre-existing against `6c5b2119` | **IMPLEMENTED** — same run | **IMPLEMENTED** — same run |

**Every step is IMPLEMENTED or NOT APPLICABLE, with one deliberate NOT DONE: item 3's code fix, which
the task instructed be reported rather than built.** No step was partially done.

---

## Constraints honoured

- DDL through Supabase MCP only — no local Postgres, no local `prisma migrate deploy`.
- `stops.stop_type` not touched (re-read after the fact and confirmed unchanged).
- `facilities_facility_type_check` not widened — the fix was a new column, as instructed.
- Optimisation and `route_matrix_cache` paths not modified — confirmed absent from every commit.
- PowerShell: no `&&` / `||` used as statement separators.
- Nothing failed, so the stop-and-report condition was never reached.

## Commits

| Hash | Task |
|------|------|
| `92cf1dea` | item 1 — relay_handoff CHECK rebuild + DEC-3 mirror |
| `0c96ae94` | item 2 DDL — `facilities.deleted_at`, `CarrierFacility.deletedAt`, client regenerated |
| `370b9302` | item 3 — country normalisation, data only |
| `14a26fbb` | item 2 code — `softDeleteFacility` + 18 Group A sites + 8 Group B comments |

Not pushed — per standing rule, the user pushes and deploys.

## Follow-ups this task deliberately did not take

1. **Normalise `country` at the write boundary** (item 3's code fix) — reported above, not built.
2. **A partial unique index if a facility natural key is ever added** — nothing to convert today, but
   the normalised-address index that `loadFacilityCandidates` anticipates must be
   `WHERE deleted_at IS NULL`.
3. **`deleted_by_id` on `facilities`** — omitted until something reads it.
4. **`.gitattributes` for migration line endings** — a pre-existing repo-wide checksum hazard under
   `core.autocrlf=true`, affecting all migrations equally, not introduced here.
