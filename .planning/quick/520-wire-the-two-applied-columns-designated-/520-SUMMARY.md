---
phase: quick-520
plan: 01
subsystem: document-import
tags: [end-stop, route-optimisation, route-templates, caching, prisma]
requires:
  - Phase 7 (end stop policy + route optimisation)
  - route_templates.end_stop_facility_id (live before this task)
  - route_matrix_cache (live before this task)
provides:
  - Template-rung DESIGNATED_PARKING storage, validated on the one save path
  - Two-layer distance-matrix cache (L1 process, L2 route_matrix_cache)
  - Per-template end-stop override UI on the desktop template form
affects:
  - lib/document-import/optimisation-*
  - lib/document-import/end-stop-*
  - lib/carrier/route-template-save.ts
tech-stack:
  added: []
  patterns:
    - "Injectable MatrixStore seam so cache layering is testable without a DB"
    - "persist-gated write: reads on every path, writes only from accept POSTs"
key-files:
  created:
    - apps/web/prisma/migrations/20260811120000_end_stop_facility_and_matrix_cache/migration.sql
    - apps/web/src/lib/document-import/__tests__/matrix-cache.test.ts
    - apps/web/src/lib/document-import/__tests__/end-stop-designated-parking.test.ts
  modified:
    - apps/web/prisma/schema.prisma
    - apps/web/src/lib/document-import/optimisation-constants.ts
    - apps/web/src/lib/document-import/optimisation-matrix.ts
    - apps/web/src/lib/document-import/optimisation-service.ts
    - apps/web/src/lib/document-import/end-stop-lookup.ts
    - apps/web/src/lib/document-import/end-stop-service.ts
    - apps/web/src/lib/carrier/route-template-save.ts
    - apps/web/src/actions/carrier/save-route-template.ts
    - apps/web/src/components/carrier/templates/RouteTemplateForm.tsx
    - "apps/web/src/app/(owner)/carrier/templates/[id]/page.tsx"
    - apps/web/src/generated/prisma/** (regenerated)
decisions:
  - "L2 TTL is 30 days, deliberately different from L1's 24h — L1 is a backstop inside one process, L2 exists to survive deploys"
  - "A GET never writes a cache row; persist:true is passed from exactly two apply* functions"
  - "A cache hit never refreshes computed_at"
  - "Per-trip end-stop choice still outranks the new template column"
metrics:
  tasks: 5
  tests-added: 14
  tests-passing: 509
  commit: 17be3b02
completed: 2026-08-11
---

# quick-520: Designated Parking Storage and Persistent Matrix Cache — Summary

Wired the two objects Phase 7 reported as gaps and that were already applied to
production: `route_templates.end_stop_facility_id` (so a route template can carry
a `DESIGNATED_PARKING` facility instead of degrading to a per-trip choice) and
`route_matrix_cache` (so an accepted optimisation's distance matrix survives a
deploy and a cold start). No DDL was executed and no dependency was installed.

## Files changed

**Created**

- `apps/web/prisma/migrations/20260811120000_end_stop_facility_and_matrix_cache/migration.sql`
- `apps/web/src/lib/document-import/__tests__/matrix-cache.test.ts`
- `apps/web/src/lib/document-import/__tests__/end-stop-designated-parking.test.ts`
- `.planning/quick/520-wire-the-two-applied-columns-designated-/520-SUMMARY.md` (this file, uncommitted with the code)

**Modified**

- `apps/web/prisma/schema.prisma` — `RouteTemplate.endStopFacilityId` (scalar, no relation) + new `RouteMatrixCache` model (no `@updatedAt`, no tenant relation)
- `apps/web/src/lib/document-import/optimisation-constants.ts` — `MATRIX_L2_CACHE_TTL_MS`; corrected the now-false `MATRIX_CACHE_MAX_ENTRIES` comment
- `apps/web/src/lib/document-import/optimisation-matrix.ts` — `MatrixStore` / `MatrixStoreRow` / `prismaMatrixStore`, `asMatrixGrid`, L1→L2→provider read order, persist-gated L2 write, rewritten header
- `apps/web/src/lib/document-import/optimisation-service.ts` — `persist` threaded through both read functions; `endStopFacilityId` in `getTemplateOptimisation` (select + policy ternary) and `applyTemplateOptimisation` (select + payload); `closedLoop` gate on `startFacilityId`
- `apps/web/src/lib/document-import/end-stop-lookup.ts` — `EndStopContext.templateEndStopFacilityId`, loaded and added to `wanted`; `buildEndStopSlot` fallback with the per-trip rung still winning; replaced the false "no column" comment
- `apps/web/src/lib/document-import/end-stop-service.ts` — `ensureEndStopCommitted` now passes the template's facility instead of a hardcoded `null`
- `apps/web/src/lib/carrier/route-template-save.ts` — `endStopFacilityId` on `SaveRouteTemplateCore`, ownership/inactive/residence validation, policy-coupling rule, spread into `templateData`
- `apps/web/src/actions/carrier/save-route-template.ts` — two fields on `SaveRouteTemplateInput`
- `apps/web/src/components/carrier/templates/RouteTemplateForm.tsx` — End Stop select + conditional Designated Parking picker, loader, validation, submit mapping
- `apps/web/src/app/(owner)/carrier/templates/[id]/page.tsx` — both scalars into `formData`
- `apps/web/src/generated/prisma/**` — regenerated (tracked in git)

**Commit:** `17be3b02 feat: designated parking storage and persistent matrix cache (quick-520)` — one commit, not pushed.

---

## Verification gate 1 — `tsc --noEmit` in both apps, probed

CLAUDE.md's standing rule: a clean run must be *proved*, because a parse error
anywhere in the program silently suppresses semantic checking of everything.

Before running I confirmed the tree carried no stray untracked files from another
session and no leftover `__probe.ts` (`find apps -name "__probe*"` → nothing).

### `apps/web` — first run

```
$ cd apps/web && npx tsc --noEmit
npm warn config ignoring workspace config at C:\Users\sammy\Projects\DriveCommand\apps\web/.npmrc
EXIT=0
```

### `apps/web` — probe injected into a file I actually edited

`const __probe: number = 'y';` appended to `src/lib/document-import/optimisation-matrix.ts`:

```
$ npx tsc --noEmit
npm warn config ignoring workspace config at C:\Users\sammy\Projects\DriveCommand\apps\web/.npmrc
src/lib/document-import/optimisation-matrix.ts(318,7): error TS2322: Type 'string' is not assignable to type 'number'.
EXIT=2
```

The gate reported **that** error, at that file and line — it is green, not blind.

### `apps/web` — probe deleted, re-run

```
$ grep -c __probe src/lib/document-import/optimisation-matrix.ts
0
$ npx tsc --noEmit
npm warn config ignoring workspace config at C:\Users\sammy\Projects\DriveCommand\apps\web/.npmrc
EXIT=0
```

### `apps/mobile` — first run, probe, delete, re-run

No mobile source needed changing in this task, so the probe went into the one
mobile file that touches this feature area (`components/imports/ImportEndStop.tsx`)
and was removed again; `git status` afterwards shows no mobile file modified.

```
$ cd apps/mobile && npx tsc --noEmit
EXIT=0

$ # with: const __probe: number = 'y';  appended to components/imports/ImportEndStop.tsx
$ npx tsc --noEmit
components/imports/ImportEndStop.tsx(303,7): error TS2322: Type 'string' is not assignable to type 'number'.
EXIT=2

$ grep -c __probe components/imports/ImportEndStop.tsx
0
$ npx tsc --noEmit
EXIT=0
```

Both probes deleted; `find apps -name "__probe*" -not -path "*/node_modules/*"`
returns nothing.

---

## Verification gate 2 — `npx vitest run src/lib/document-import`

```
 ✓ src/lib/document-import/__tests__/stop-review.test.ts (32 tests) 58ms
 ✓ src/lib/document-import/__tests__/address.test.ts (40 tests) 44ms
 ✓ src/lib/document-import/__tests__/facility-ladder.test.ts (18 tests) 95ms
 ✓ src/lib/document-import/__tests__/template-matching.test.ts (64 tests) 92ms
 ✓ src/lib/document-import/__tests__/extractor.test.ts (26 tests) 51ms
 ✓ src/lib/document-import/__tests__/service.test.ts (22 tests) 148ms
 ✓ src/lib/document-import/__tests__/spreadsheet.test.ts (17 tests) 43ms
 ✓ src/lib/document-import/__tests__/merge.test.ts (20 tests) 22ms
 ✓ src/lib/document-import/__tests__/lifecycle.test.ts (29 tests) 20ms
 ✓ src/lib/document-import/__tests__/template-chooser.test.ts (9 tests) 2292ms
 ✓ src/lib/document-import/__tests__/facility-commit.test.ts (12 tests) 60ms
 ✓ src/lib/document-import/__tests__/facility-effective-client.test.ts (9 tests) 38ms
 ✓ src/lib/document-import/__tests__/matrix-cache.test.ts (10 tests) 38ms
 ✓ src/lib/document-import/__tests__/end-stop.test.ts (18 tests) 30ms
 ✓ src/lib/document-import/__tests__/contract-create.test.ts (9 tests) 39ms
 ✓ src/lib/document-import/__tests__/matching.test.ts (16 tests) 22ms
 ✓ src/lib/document-import/__tests__/template-reapply.test.ts (13 tests) 25ms
 ✓ src/lib/document-import/__tests__/template-skipped-scoring.test.ts (6 tests) 18ms
 ✓ src/lib/document-import/__tests__/hashing.test.ts (21 tests) 17ms
 ✓ src/lib/document-import/__tests__/facility-visibility.test.ts (18 tests) 15ms
 ✓ src/lib/document-import/__tests__/template-copy.test.ts (5 tests) 14ms
 ✓ src/lib/document-import/__tests__/money.test.ts (7 tests) 10ms
 ✓ src/lib/document-import/__tests__/end-stop-designated-parking.test.ts (4 tests) 14ms
 ✓ src/lib/document-import/__tests__/profiles.test.ts (6 tests) 7ms
 ✓ src/lib/document-import/__tests__/optimisation.test.ts (29 tests) 32ms
 ✓ src/lib/document-import/__tests__/upload.test.ts (6 tests) 9ms
 ✓ src/lib/document-import/__tests__/rate-con-party.test.ts (15 tests) 46ms
 ✓ src/lib/document-import/__tests__/pdf-render.test.ts (7 tests) 3850ms
 ✓ src/lib/document-import/__tests__/resumable.test.ts (5 tests) 29ms
 ✓ src/lib/document-import/__tests__/materialise.test.ts (8 tests) 4103ms
 ✓ src/lib/document-import/__tests__/document-date.test.ts (8 tests) 3ms

 Test Files  31 passed (31)
      Tests  509 passed (509)
   Start at  13:33:37
   Duration  7.45s (transform 8.90s, setup 0ms, import 33.59s, tests 11.29s, environment 11ms)
```

14 new tests (10 + 4). No existing test or fixture was weakened, skipped or
deleted; `end-stop.test.ts` still passes untouched, including its assertion that
an unanswered `DESIGNATED_PARKING` is `NEEDS_CHOICE`.

Two `stderr` lines appear during `matrix-cache.test.ts` and are the point of the
test rather than a failure — they are the `logger.warn` calls from the two cases
that deliberately make the store throw:

```
stderr | matrix-cache.test.ts > a broken cache is a miss, never an error > falls through to the provider when the store read rejects
[...] WARN: [document-import] matrix cache read failed {"error":{}}

stderr | matrix-cache.test.ts > a broken cache is a miss, never an error > still returns the matrix when the store write rejects
[...] WARN: [document-import] matrix cache write failed {"error":{}}
```

---

## Verification gate 3 — `_prisma_migrations`

**Deviation, stated plainly:** the plan required this query to run through the
Supabase MCP (`mcp__claude_ai_Supabase__execute_sql`). **That tool is not
available in this execution context** — calling it returned
`Error: No such tool available`. Rather than claim a result I could not obtain, I
ran the identical read-only `SELECT` over a direct `pg` connection using
`DIRECT_URL` from `apps/web/.env.local` (the `postgres` role, same database,
project `oqdhberkghtnszrkdvfm`). It is the same statement against the same rows;
only the transport differs.

```
$ SELECT migration_name, applied_steps_count, finished_at
    FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 3;

[
  {
    "migration_name": "20260811120000_end_stop_facility_and_matrix_cache",
    "applied_steps_count": 0,
    "finished_at": "2026-08-11T18:17:08.824Z"
  },
  {
    "migration_name": "20260806040500_add_resolution_provenance",
    "applied_steps_count": 0,
    "finished_at": "2026-08-06T04:31:28.872Z"
  },
  {
    "migration_name": "20260803115314_add_raw_response",
    "applied_steps_count": 0,
    "finished_at": "2026-08-03T16:54:15.171Z"
  }
]
```

Non-null `finished_at`, and `applied_steps_count: 0` — the signature of
`migrate resolve --applied` rather than a replay, exactly matching the Phase 3
provenance migration two rows below it.

The `resolve` command itself:

```
$ npx prisma migrate resolve --applied 20260811120000_end_stop_facility_and_matrix_cache
Prisma schema loaded from prisma\schema.prisma.
Datasource "db": PostgreSQL database "postgres", schema "public" at "db.oqdhberkghtnszrkdvfm.supabase.co:5432"

Migration 20260811120000_end_stop_facility_and_matrix_cache marked as applied.
```

(It first failed with *"The datasource.url property is required in your Prisma
config file"* — `prisma.config.ts` reads `DIRECT_URL` via `dotenv/config`, which
loads `.env`, not `.env.local`. Supplying `DIRECT_URL` in the command's
environment fixed it. Not a code change.)

**Both objects were re-verified as live before any of this**, read off
`information_schema`:

```
route_matrix_cache.id           uuid                        NOT NULL
route_matrix_cache.org_id       uuid                        NOT NULL
route_matrix_cache.facility_key text                        NOT NULL
route_matrix_cache.miles        jsonb                       NOT NULL
route_matrix_cache.minutes      jsonb                       NOT NULL
route_matrix_cache.computed_at  timestamp with time zone    NOT NULL
route_templates.end_stop_facility_id  uuid                  NULL
```

No `updated_at` column, confirming the model correctly carries no `@updatedAt`.

---

## Grep verification (plan's checklist)

```
=== persist: true (non-test, code lines only) ===
optimisation-service.ts:335  const view = await importOptimisationFor(orgId, userId, record, viewer, { persist: true });
optimisation-service.ts:521  const view = await getTemplateOptimisation(orgId, userId, templateId, { persist: true });

=== persist in handlers.ts ===
(zero — no GET handler acquired the argument; the only "persist" hits are the
 word "persistence"/"persist a new running order" in unrelated comments)

=== MATRIX_L2_CACHE_TTL_MS ===
optimisation-constants.ts:158  (the single definition)
optimisation-matrix.ts:63,283  (import + the one comparison)
matrix-cache.test.ts:35,174,184  (imported, never restated)

=== designatedParkingFacilityId: null in end-stop-service.ts ===
(zero — the literal is gone)

=== closedLoop in optimisation-service.ts ===
252/253  importOptimisationFor  (pre-existing)
475/477  getTemplateOptimisation (new — startFacilityId is now gated, not equal)
```

`endStopFacilityId` appears in: the schema, the save core (type + destructure +
validation + spread), `applyTemplateOptimisation` (select **and** payload),
`getTemplateOptimisation` (select **and** the policy ternary), `loadEndStopContext`,
the server action, the form, and the edit page.

`endStopCommitPlan` inherits the new resolution rather than needing its own:
`end-stop-service.ts:391` is `const slot = buildEndStopSlot(context);` and
`:403` is `draft: endStopStopDraft(slot.facility.id, lastSequenceOrder)` — the
draft is built from the slot, so whatever `buildEndStopSlot` resolves is what
Phase 8 will materialise. Verified by reading, not assumed.

---

## Self-audit

### What was built

- **Prisma + migration.** `RouteTemplate.endStopFacilityId` as a scalar with no
  relation (the FK exists in the DB; a relation would force a back-relation on
  `CarrierFacility` for nothing) and a `RouteMatrixCache` model matching the live
  columns. One idempotent `IF NOT EXISTS` migration, marked applied, never run.
- **Two-layer matrix cache.** `MatrixStore` seam + `prismaMatrixStore`. Read
  order L1 → L2 → provider on every path. L1 always written on a compute; L2 only
  under `persist: true`, which exists in exactly two places, both `apply*`. A hit
  never writes, and seeds L1 with the row's own `computedAt` rather than `now`.
  A stored grid that is not `size × size` of finite numbers is a miss, not a cast.
  Store failures degrade to a miss/no-op at the call site *and* inside the Prisma
  implementation.
- **DESIGNATED_PARKING storage.** Validated on the one save path (tenant
  ownership, not `inactive_`, not a driver residence — same sentence as
  `setEndStopChoice`, typographic apostrophe included), coupled to the policy in
  the same payload, and force-cleared whenever the policy is written to anything
  else. Read as the ladder's template rung with the per-trip choice still
  winning. Committed by `ensureEndStopCommitted`. Carried through
  `applyTemplateOptimisation`'s select **and** payload so a reorder cannot wipe it.
- **The `startFacilityId` trap.** `getTemplateOptimisation` previously did
  `startFacilityId = endFacilityId`, which was only correct because
  `endFacilityId` was null for every non-loop policy. Adding DESIGNATED_PARKING
  would have turned an open route into a loop starting at the yard. Now gated on
  `closedLoop`, mirroring `importOptimisationFor`.
- **UI.** End Stop select (sentinel → `null`) plus a Designated Parking picker
  that is **absent from the tree**, not merely hidden, unless the policy is
  `DESIGNATED_PARKING`. Its options come from three fetches, one per
  `DESIGNATED_PARKING_FACILITY_TYPES` entry — and that three-type filter *is* the
  Phase 7 rule: a residence carries `facilityType === 'driver_residence'`, which
  is not one of the three, so residences are excluded structurally rather than by
  a client-side hide (the endpoint also applies `facilityVisibilityWhere` and
  drops `inactive_` server-side).
- **14 tests**, importing `MATRIX_L2_CACHE_TTL_MS` rather than restating it.

### What was NOT built, and why

- **No DDL, no `GRANT`, no RLS change, no dependency.** Both objects were already
  live; this task only recorded and resolved them.
- **The mobile-web template twins** (`TemplateEditMobile.tsx`,
  `NewTemplateMobile.tsx`) did not gain the control — out of scope per the plan.
- **No cache warming from `saveRouteTemplateCore`.** Deliberate (D1): a save that
  reached a routing provider would make writing a template depend on a network call.
- **`template-service.ts:658` and `:1038` left alone** — read and confirmed: both
  omit `endStopPolicy` and `endStopFacilityId` entirely, so `undefined` leaves
  both columns untouched.

### Deviations from the plan

1. **The `_prisma_migrations` query ran over `pg`, not the Supabase MCP** — the
   MCP tool is not available in this context (see gate 3). Same statement, same
   database, different transport. Flagging it because the plan named the tool
   explicitly and a silent substitution would be exactly the sort of thing this
   summary is supposed to catch.
2. **The "degrade, never throw" guard is at the call site as well as inside
   `prismaMatrixStore`.** The plan put try/catch only in the Prisma
   implementation, but its own test 6 requires a *throwing store* to be a miss —
   and since the store is an interface, the failing implementation may be any
   store at all. Wrapping both is strictly a superset of what was specified.
3. **`asMatrixGrid` also gets a test** (wrong-shape row is a miss). Not in the
   plan's list of six cases; it costs nothing and pins the "must be a miss rather
   than a cast" rule the plan stated in prose.
4. **The mobile `tsc` probe went into `components/imports/ImportEndStop.tsx`**,
   since this task edited no mobile file. The plan said "a file you actually
   edited"; there was none, so I used the nearest file in that program and
   restored it.

### Known gaps — reported, not fixed

1. **`route_matrix_cache` has RLS disabled, zero policies, and no `app_user`
   grant.** Verified again just now: `relrowsecurity = false`, `0` policies,
   grantees `anon, authenticated, postgres, service_role`. Consistent with the
   incomplete RLS Phase 2 cutover — **the day `DATABASE_URL` flips to `app_user`
   this table will return zero rows and silently stop caching.** It degrades to
   "no cache", not to an error (that is what the try/catch buys), so the failure
   will be invisible in the UI and visible only as provider call volume.
2. **Nothing invalidates a cache row when a facility is re-geocoded.** The key is
   the facility-id list and a corrected facility keeps its id, so the structural
   invalidation cannot see it; only `MATRIX_L2_CACHE_TTL_MS` (30 days) retires the
   stale matrix. Grep confirms `clearMatrixCache` has no production caller — it is
   a test seam. A hook would be the real fix and was out of scope.
3. **A facility set that is only ever VIEWED and never accepted still pays one
   provider call per cold start** — unchanged from before this table existed. By
   design (D1): making it free needs either a write from a GET (forbidden) or a
   background warm job (no cron/queue in scope). What L2 actually buys is that an
   **accepted** set is free forever after, across deploys and instances.
4. **The mobile-web template twins have no end-stop control, and I verified they
   cannot damage one.** `grep -c endStop` on both
   `app/(owner)/carrier/templates/[id]/TemplateEditMobile.tsx` and
   `app/(owner)/carrier/templates/new/NewTemplateMobile.tsx` returns **0**, and I
   read `TemplateEditMobile`'s `saveRouteTemplate({...})` payload (lines 212–231):
   it sends neither field, so both arrive `undefined` and both columns are
   preserved. Editing a template on a phone browser cannot wipe an override — it
   just cannot set one. Separately, the **RN app has no route-template form at
   all**: `grep -rn "saveRouteTemplate\|routeTemplate\|route_template"` across
   `apps/mobile` returns zero hits, and `endStop` appears in exactly one mobile
   file (`components/imports/ImportEndStop.tsx`, the import card). There is no
   native mirror to keep in step.
5. **`DocumentProfile.defaultEndStopPolicy` remains deliberately unwired.** The
   column exists; nothing reads it. Section 9 names three layers and a fourth was
   not this task's to invent — confirmed by grep: every `defaultEndStopPolicy`
   read in `lib/document-import` is `Tenant."defaultEndStopPolicy"`.

### One edge case I chose not to code around

`applyTemplateOptimisation` passes `endStopPolicy: template.endStopPolicy ?? undefined`
and `endStopFacilityId: template.endStopFacilityId ?? undefined`, exactly as the
plan specified. If a row ever held a facility while its policy was *not*
`DESIGNATED_PARKING`, the new coupling check would reject the reorder with
"Only designated parking takes a facility." That row cannot be produced by the
app — `saveRouteTemplateCore` clears the facility whenever the policy is written
to anything else, and the two `template-service.ts` callers touch neither column —
so it would take a direct DB write. The failure mode is a visible error, not data
loss. Noting it rather than adding a branch the plan did not ask for.

### Line worth adding to CLAUDE.md's Document Import history

> **quick-520 — the matrix cache reads on every path and writes on almost none.**
> L1 (process) → L2 (`route_matrix_cache`) → provider on every call, including
> GETs, because reading is not writing. A compute always writes L1 and writes L2
> **only under `persist: true`**, which exists in exactly two places, both
> `apply*`. So a viewed-but-never-accepted facility set still pays one provider
> call per cold start — that is the honest cost of "no writes in view paths", and
> the alternative was a write from a GET. **A hit never refreshes `computed_at`**,
> which is why the L2 TTL is 30 days rather than L1's 24 hours: L1 is a backstop
> inside one process's lifetime, L2 exists to survive deploys, and the ceiling is
> there for the one thing the structural key cannot see — a **re-geocoded**
> facility keeps its id. Also: `route_templates.end_stop_facility_id` finally
> gives Section 9's template rung somewhere to put a `DESIGNATED_PARKING`
> facility, and `applyTemplateOptimisation` must carry it in **both** its `select`
> and its payload or reordering a template deletes it.

## Self-Check: PASSED

- All created files exist on disk and are in commit `17be3b02`.
- `git log -1` → `17be3b02 feat: designated parking storage and persistent matrix cache (quick-520)`.
- `git status` clean apart from this untracked planning directory.
- Both `tsc` gates clean **and probed**; both probes deleted and verified absent.
- 509/509 tests pass, 31 files, nothing weakened.
- Not pushed, as instructed.
