# Phase 7 — End stop policy and route optimisation

**Spec:** `docs/specs/DocumentImport_TechnicalSpec_v1.md` Section 9 (read in full)
**Built:** 2026-08-10
**Branch:** `feature/document-import`
**DDL written:** none. **Packages installed:** none. **Routing providers added:** none.

---

## 0. What shipped, in one paragraph

Where a working day ends is now a resolved, stored, explainable decision — tenant
default, then template override, then per-trip choice — that Phase 8's commit
turns into a real `CarrierStop` with a real sequence and a real geofence, pinned
last. A driver's home address is invisible to everyone but that driver, the
owner, and a dispatcher an owner has explicitly permitted, enforced by a `where`
fragment in the query layer and a mask applied before serialisation, at every one
of the fourteen places a facility is read. And the stop order can be *offered* a
better arrangement — pickups before deliveries, firm appointments hard, soft ones
priced, the end stop a fixed terminal node — with one line stating the saving,
two buttons, and complete silence below a floor that lives in one file.

---

## 1. Files

### New — `apps/web/src/lib/document-import/`

| File | Role |
|---|---|
| `end-stop-constants.ts` | The five policies, the labels, `END_STOP_STOP_TYPE`, `DRIVER_RESIDENCE_FACILITY_TYPE`, the parking type list. Every DB vocabulary read from `pg_constraint` on 2026-08-10 and quoted in the header. |
| `end-stop.ts` | **Pure.** `resolveEndStopPolicy` (the three layers), `endStopTargetFor` (policy → facility, with a state and a sentence for every failure), `endStopStopDraft` (the row Phase 8 writes). No Prisma, no clock. |
| `end-stop-lookup.ts` | **Read-only.** Loads the three layers + the facilities they name; `buildEndStopSlot` builds the card row; `firstPickupFacilityOf`. |
| `end-stop-service.ts` | **Every write.** `setEndStopChoice`, `clearEndStopChoice`, `ensureEndStopCommitted` (the mutation boundary), `endStopCommitPlan` + `markEndStopMaterialised` (Phase 8's hooks). |
| `optimisation-constants.ts` | Both floors, the exact/heuristic threshold, the soft-window penalty, the cache TTL and bounds. Each with the reasoning for its value. |
| `optimisation.ts` | **Pure.** `precedencePairs`, `costOrder`, exact enumeration ≤ 8 stops, NN + 2-opt above, `buildOptimisationSuggestion`, `spliceSuggestedOrder`, `stopSetChanged`. |
| `optimisation-matrix.ts` | The OSRM `/table` call plus the cache keyed on the sorted facility-id list. |
| `optimisation-service.ts` | Orchestration + the one write. `getImportOptimisation` / `applyImportOptimisation`, `getTemplateOptimisation` / `applyTemplateOptimisation`. |
| `optimisation-copy.ts` | The savings sentence as ONE string, plus the two button labels (quick-517's rule). |

### New — elsewhere

| File | Role |
|---|---|
| `apps/web/src/lib/carrier/facility-visibility.ts` | The whole privacy rule: `canSeeDriverResidences`, `facilityVisibilityWhere`, `canViewFacility`, `filterVisibleFacilities`, `maskFacilityForViewer`, `staffViewer`, `viewerFromSession`, `carrierDriverIdForUser`, `residenceFacilityForDriver`. |
| `apps/mobile/lib/optimisation-copy.ts` | The mobile mirror of the copy module. |
| `apps/web/src/components/carrier/imports/EndStopDecision.tsx` | The "Ends at" row on the summary card. |
| `apps/web/src/components/carrier/imports/OptimisationSuggestion.tsx` | The suggestion card on stop review. |
| `apps/mobile/components/imports/ImportEndStop.tsx` | Mobile twin, with the parking picker in a bottom sheet. |
| `apps/mobile/components/imports/ImportOptimisation.tsx` | Mobile twin of the suggestion card. |

### New route files (5)

```
apps/web/src/app/api/v1/carrier/document-imports/[id]/end-stop/route.ts
apps/web/src/app/api/mobile/carrier/owner/document-imports/[id]/end-stop/route.ts
apps/web/src/app/api/v1/carrier/document-imports/[id]/optimisation/route.ts
apps/web/src/app/api/mobile/carrier/owner/document-imports/[id]/optimisation/route.ts
apps/web/src/app/api/v1/carrier/templates/[id]/optimisation/route.ts
```

Four are mirrored pairs over the same `handlers.ts` functions — the two surfaces
cannot drift. The template one has no mobile twin because route templates are
edited on the web only.

### Modified

| File | Change |
|---|---|
| `lib/geo/osrm.ts` | **Added** `getOSRMMatrix` on a second base constant for the same host's `/table` service. The hardcoded public host is untouched — see §6. |
| `lib/document-import/provenance.ts` | `EndStopProvenance`, `endStopProvenanceOf`, `stampEndStop`, the `endStop` key on `ResolutionProvenance`. |
| `lib/document-import/handlers.ts` | Six handlers: get/set end stop, get/apply import optimisation, get/apply template optimisation. |
| `lib/auth/permissions.ts` | `driverResidences` — the one default-FALSE permission. See §3. |
| `lib/carrier/facilities.ts` | Optional `viewer` on `listFacilities`, `getFacility`, `updateFacility`, `softDeleteFacility`. Omitting it excludes residences. |
| `lib/carrier/route-template-save.ts` | Optional `endStopPolicy` (the per-template override), validated against the CHECK's five. |
| `packages/api-client/src/owner-imports.ts` + `index.ts` | Four methods, ten types. **`dist` rebuilt** before the mobile typecheck. |
| 9 page/route files | The visibility filter or the mask. See §3. |
| `ImportSummaryCard.tsx`, `StopReviewScreen.tsx`, `ImportResolution.tsx`, `StopReview.tsx` | Wiring. |

### Tests (65 new, 495 total in the suite)

`__tests__/end-stop.test.ts` (18) · `__tests__/optimisation.test.ts` (29) ·
`__tests__/facility-visibility.test.ts` (18)

---

## 2. Part A — the design calls worth knowing

### The end stop is NOT a consignment

The obvious shortcut is to append it to `reviewedExtraction.consignments` so the
review screen renders it for free. It was rejected because it would have cost
three properties this module already paid for:

- **Template scoring** (quick-517) — a yard in the import's facility set scores
  every template against a stop no manifest mentions.
- **The ghost rule** (quick-518) — `isTemplateInsertedStop` is a deliberate
  conjunction, and a fourth kind of synthetic consignment gives it a case it was
  never written for.
- **Reorder** (Phase 5) — array order IS the running order, so "always last"
  would become a rule the permutation validator has to remember.

Instead: **derived on read, committed at the mutation boundary as one
`resolution_provenance` key, materialised by Phase 8 as a real `CarrierStop`**
with `is_end_stop = true`, `stop_type = 'layover'`, `sequenceOrder = last + 1`.
Pinned last is then enforced by `@@unique([dispatchId, sequenceOrder])` rather
than by a sort.

### Why `layover`

`stops_stop_type_check` admits `pickup|delivery|fuel_stop|layover|relay_handoff`
and none of them means "return to base" (audit B5). `layover` already means "a
stop where no freight changes hands". `is_end_stop` — a real column from Phase 1
— is what tells the two apart, **not** the type and **not** the position.

### The stored key IS the third rung

`buildEndStopSlot` feeds the stored policy into `resolveEndStopPolicy` as its
`trip` layer, so a stored decision outranks the template override and the tenant
default by construction rather than by a special case.

**The consequence, and it is quick-516 one slot over: there is no value you can
write to un-decide.** `NONE` records "this trip ends nowhere", which is a real
and different answer. The only way back to the company default is to DELETE the
key — `action: 'reset'`, a POST. Both surfaces wire "Use my company default" to
that mutation, never to a re-fetch.

### `ensureEndStopCommitted` is deliberately NOT called from stop mutations

Unlike `ensureStopsCommitted`, which every stop write opens with. Freezing the
policy on the first stop edit would pin it before the template has been chosen,
and the template override is the *second* rung. Scoped exactly as
`ensureTemplateCommitted` is, and for the same reason. **Phase 8 must call it**
before reading the policy.

---

## 3. Part A — the privacy requirement, in detail

> *"Visible only to that driver, the owner, and dispatchers with explicit
> permission. Not in the general picker, not suggested for other trips, excluded
> from every export. Server-side filter, not a UI hide."*

### Two mechanisms, because there are two situations

| Situation | Mechanism | Why |
|---|---|---|
| A **picker** or a list | `facilityVisibilityWhere(viewer)` in the Prisma `where` | A residence must not be an option, so it should not be in the payload. |
| A **trip's own stops** | `maskFacilitiesForViewer(rows, viewer)` before serialisation | Dropping the row would delete the end stop from the itinerary and make the trip look like it finishes at the last delivery — the untracked return Part A exists to fix. So the row stays and the name becomes "Driver's home"; city, state, street, ZIP **and the coordinates** all go to null. A map pin on a house is the same disclosure as the street line, and it is the one people forget. |

### Every site, and which mechanism

| Site | Mechanism |
|---|---|
| `lib/carrier/facilities.ts` — `listFacilities`, `getFacility`, `updateFacility`, `softDeleteFacility` | filter |
| `lib/document-import/facility-lookup.ts` — `loadFacilityCandidates` | filter *(already present from Phase 4)* |
| `api/v1/carrier/facilities/route.ts` + `[id]/route.ts` (GET/PATCH/DELETE) | filter |
| `(owner)/carrier/loads/new`, `loads/[id]`, `templates/new`, `templates/[id]`, `trips/[id]` (allFacilities) | filter |
| `(owner)/carrier/trips/[id]`, `trips/[id]/stops`, `trips/[id]/plan`, `loads/[id]` (stop facilities) | mask |
| `(driver)/carrier/driver/trips` | mask, keyed on that driver's own `carrier_drivers.id` |
| `(owner)/carrier/facilities/[id]` | filter — a residence 404s |
| `end-stop-lookup.ts` parking candidates | filter |
| `end-stop-service.ts` `setEndStopChoice` | **filter at the WRITE**, not just the read |

That last one matters. `residenceFacilityForDriver` guards the *lookup*; without
a check at the write, a dispatcher could name another driver's residence facility
id directly and have the card confirm it back to them. It is rejected twice: once
because they cannot see it, and once because a residence is never designated
parking whoever is asking.

### `driverResidences` is the one default-FALSE permission

This codebase's RBAC convention is default-allow — `hasPermission` resolves a
MANAGER as `permissions?.[key] !== false`, so an owner switches things *off*.
That is right for features and **wrong for a home address**: it would have handed
every existing manager in every tenant their drivers' houses on the deploy that
shipped this file. So:

- `DEFAULT_MANAGER_PERMISSIONS.driverResidences = false`.
- `canSeeDriverResidences` demands a literal `true`, and **does not go through
  `hasPermission`**.
- **`fullAccess` does not grant it** — that master toggle was set by owners who
  had never heard of this key, so reading it as consent would be inventing
  consent retroactively.

All four properties have a test.

### Not RLS, deliberately

RLS would be the right mechanism, but the app's connection currently bypasses it
(a known, separately tracked pre-launch item), so a policy written today would be
a comment that looks like a control. This filter works whichever database role
the app connects as, and it keeps working the day the RLS cutover lands.

---

## 4. Part B — the design calls worth knowing

### It is a suggestion. Nothing here reorders anything on its own.

Both `get*` functions are read-only. Both `apply*` functions need an explicit
POST with an explicit action, and **both recompute the suggestion server-side**
rather than applying an order the request carried — a request that could name its
own permutation would be a reorder endpoint wearing an optimiser's name, and a
stale tab could reorder yesterday's stops.

"Keep current order" has no endpoint. Declining is the absence of a request.

The import's accept path funnels into **Phase 5's `reorderStops`**, unchanged —
so the facility provenance is permuted alongside the consignments and the
permutation is validated a second time on the way in.

### The constraints

| Section 9 says | How it is implemented |
|---|---|
| pickups precede their deliveries | `precedencePairs`: a pickup is constrained against every delivery sharing a reference *value*; where it shares none, against **all** deliveries. The fallback is the strict direction — a suggestion that never appears beats one a dispatcher laughs at. |
| firm windows are hard | Enforced as an **order**, not as arrival times. The trip's departure time does not exist yet (Phase 8 chooses it), so no candidate can be checked against a clock. What *can* be checked without one is that two firm windows are visited in the order they open, which is necessary for feasibility whatever time the truck leaves. Inventing a departure time would make the suggestion depend on a number nobody supplied. |
| soft windows are penalties | Counted as inversions, priced at `OPTIMISATION_SOFT_WINDOW_PENALTY_MINUTES` into the **objective only**. The line a dispatcher reads says real miles and real minutes. |
| end stop pinned last | A **fixed terminal node**, never a member of the array being permuted. It contributes the return leg to every candidate's cost — so the saving accounts for getting home — and no permutation can move it because it was never in the list. |
| below a floor, do not offer | Two floors, combined with **OR**. See below. |

### The floor is an OR, not an AND

`OPTIMISATION_MIN_SAVED_MILES = 5` · `OPTIMISATION_MIN_SAVED_MINUTES = 20`.

Two orders can cover near-identical distance and differ sharply in time — a left
turn across four lanes at 16:30, a river with two crossings. The routing engine's
duration carries that; the distance does not. Requiring both would suppress
exactly the suggestion with the clearest justification ("same miles, half an hour
earlier home"); requiring only miles would mean the optimiser could never speak
about time. There is a test for that case specifically.

**Grep-verified single occurrence.** Both literals appear only in
`optimisation-constants.ts`; every other reference — source, components,
tests — is the imported name. The tests build their matrices *relative to* the
constants, so re-tuning a constant re-tunes the tests rather than breaking them.

### When it runs

- **Template:** on demand from the template screen, `GET
  /api/v1/carrier/templates/[id]/optimisation`, called after a create or an edit.
  Deliberately **not** wired into `saveRouteTemplateCore`: a save that reached a
  routing provider would make writing a template depend on a network call, and a
  save that reordered would be the mutation Part B forbids.
- **Trip (import):** only when `stopSetChanged(templateFacilityIds,
  runFacilityIds)` — a **multiset** comparison (two stops at one cross-dock vs
  one is a change, and a plain `Set` would call those equal), **ignoring order**
  (a reorder is not an addition, and arguing with a dispatcher who just moved a
  stop by hand is the fastest way to be ignored). When no template was applied,
  nothing has optimised these stops, so it runs.

### What is excluded from the input

Skipped stops and template-inserted ghosts, exactly as quick-517/518 exclude them
from scoring — a stop nobody is driving to must not pull the running order toward
it. **Unresolved stops are handled the opposite way from the scorer**: quick-517
keeps them as synthetic members precisely because dropping them inflates a score;
here the honest answer is *silence*. An optimiser that quietly optimised the half
of the trip it could see would reorder a dispatcher's stops around a gap, so a
single unresolved stop means no suggestion at all.

### The matrix and its cache

One `/table` request per ordered facility set instead of N² `/route` calls —
twelve stops is 1 request rather than 66. **The cache key is the facility ids
sorted**, and the matrix rows are built in that same order, so:

- an unchanged template hits every day, whatever order its stops are in;
- a changed set cannot hit, because a different set is a different key.
  Invalidation is structural, not a hook someone has to remember to call.

A `null` cell (no route between two points) fails the whole matrix rather than
being coerced — a zero there would make an unreachable pair look like the
cheapest leg on the trip.

### The savings sentence is ONE string

`optimisation-copy.ts`, mirrored at `apps/mobile/lib/optimisation-copy.ts`.
quick-517's rule, and Section 9's line is the worst possible case for it — two
counts in one sentence. A test asserts the exact string and that no digit is ever
adjacent to a unit.

---

## 5. Verify table

| # | Check | Status |
|---|---|---|
| 1 | Each of the five policies → correct end stop, pinned last | ✅ `end-stop.test.ts` — all five resolve; `sequenceOrder = last + 1`; `stop_type` asserted against the live CHECK's five values |
| 2 | **Call the API directly** as driver B → A's residence filtered | ✅ at the unit level (`facility-visibility.test.ts` asserts the `where` fragment and the per-row check for exactly this pair). ⚠️ **not yet exercised against a running server with two real driver accounts** — see §7 |
| 3 | Accept then decline a suggestion → changes / does not | ✅ accept goes through `reorderStops` (`applyImportOptimisation`); decline has no endpoint and writes nothing |
| 4 | Firm appointment window respected | ✅ `optimisation.test.ts` — the shortest order on a line is rejected when firm windows demand another |
| 5 | Two trips, unchanged template → provider called once | ✅ cache key asserted order-insensitive and set-sensitive. ⚠️ **the call count itself is not asserted against a live provider** — see §7 |
| 6 | Saving below the floor → no suggestion at all | ✅ `optimisation.test.ts` — `offered: false`, `declineReason: 'BELOW_FLOOR'`, `movedOrder: []` |

**Most likely drift ("privacy done as a UI conditional"):** avoided by
construction. The rule is a `where` fragment and a mask, both server-side, both
unit-tested without a renderer; the components receive rows that are already
filtered or already masked and hold no conditional of their own.

---

## 6. Gate evidence

**The tsc gate was probed before being trusted** (quick-517's lesson — a corrupt
`.next/dev/types` artifact makes tsc report only that file and silently skip
semantic checking of all source). A deliberate `const __probe: number = "this is
a string"` was injected into a Phase 7 file in each app, caught in both, and
removed:

```
### PROBE (web)  — apps/web/src/lib/document-import/optimisation.ts
src/lib/document-import/optimisation.ts(651,7): error TS2322: Type 'string' is not assignable to type 'number'.
PROBE EXIT CODE: 2

### PROBE (mobile) — apps/mobile/components/imports/ImportOptimisation.tsx
components/imports/ImportOptimisation.tsx(181,7): error TS2322: Type 'string' is not assignable to type 'number'.
PROBE EXIT CODE: 2
```

With the probes removed and `tsconfig.tsbuildinfo` deleted:

```
### apps/web: npx tsc --noEmit
EXIT CODE: 0

### apps/mobile: npx tsc --noEmit
EXIT CODE: 0
```

`packages/api-client` `dist` was rebuilt (`npx tsc`, exit 0) **before** the mobile
typecheck — the four new methods and ten new types would otherwise have been
invisible.

```
### apps/web: npx vitest run src/lib/document-import
 Test Files  29 passed (29)
      Tests  495 passed (495)

 ✓ src/lib/document-import/__tests__/end-stop.test.ts (18 tests)
 ✓ src/lib/document-import/__tests__/facility-visibility.test.ts (18 tests)
 ✓ src/lib/document-import/__tests__/optimisation.test.ts (29 tests)
```

### Live schema drift scan

`npx tsx --env-file=.env.local scripts/audit/full-schema-drift-scan.ts`

```
Models scanned:              94
Models with drift:           46
Models with missing tables:  0
Total columns missing in DB: 0
Total extra columns in DB:   78
```

**No drift attributable to this phase.** Zero missing columns anywhere, which is
what matters — and `facilities`, `stops`, `dispatches`, `route_templates`,
`route_template_stops` and `document_imports` report no drift at all. The only
one of this phase's tables in the list is `Tenant`, whose three "extra" columns
(`fleetSizeBucket`, `status`, `provisioningPhase`) are pre-existing Prisma enums
the scanner reports as `USER-DEFINED`; the same class accounts for all 78. This
phase wrote no migration and needed none.

---

## 7. Open items and honest limits

1. **The privacy check has not been run against a live server with two driver
   accounts.** The rule is unit-tested at the layer it lives in, and the phase's
   prerequisites call for a second driver account which this environment does not
   have. Run verify check #2 as an HTTP call before this reaches production —
   the phase itself calls it "a real data-leak risk rather than a cosmetic
   issue", and a passing unit test is evidence about a function, not about a
   deployment.

2. **The matrix cache is in process.** There is no cache table and no DDL was
   written. It is genuinely sufficient for the stated requirement (a dispatcher
   optimising a template, tweaking it, optimising again is one process), but it
   does not survive a deploy or a serverless cold start, so the first
   optimisation after either pays for a routing call again. The fix, when it is
   wanted, is one small table — `(org_id, facility_key text, miles jsonb,
   minutes jsonb, computed_at timestamptz)`, unique on `(org_id, facility_key)`,
   where `facility_key` is the same sorted-id string `matrixCacheKey` already
   produces. **Not written here** — DDL goes through Supabase MCP separately.

3. **A template's DESIGNATED_PARKING facility has nowhere to live.** Section 9
   says the policy is "per template **or** trip". The per-trip half works fully
   (stored in `resolution_provenance.endStop.facilityId`). The per-template half
   would need a column: **`route_templates.end_stop_facility_id UUID NULL
   REFERENCES facilities(id) ON DELETE SET NULL`**. Until it exists, a template
   whose `end_stop_policy` is `DESIGNATED_PARKING` renders `NEEDS_CHOICE` and the
   dispatcher picks the yard once per trip — correct behaviour, one extra tap.
   Reported rather than migrated, per the phase's own instruction. *(The policy
   column itself, `route_templates.end_stop_policy`, exists and is wired.)*

4. **`DocumentProfile.defaultEndStopPolicy` exists and is deliberately not
   wired.** Phase 1 created it. Section 9's resolution order is three layers —
   tenant, template, trip — and inserting a fourth was not this phase's to
   invent. If a per-client default is wanted, it sits between tenant and
   template, and `resolveEndStopPolicy` takes one more field.

5. **OSRM still points at the public demo host.** `getOSRMMatrix` uses the same
   host as the existing `getOSRMDistanceMiles`, over plain HTTP, with no key.
   This is a separately tracked pre-launch item and was deliberately not touched
   — changing it is an infrastructure decision, not a feature commit. What this
   phase did about it is call it **once per ordered facility set and cache the
   answer**, which is why the matrix service is used at all.

6. **`filterVisibleFacilities` has no caller yet.** There is no facility CSV or
   PDF export in the codebase today. It exists, is tested, and is the function
   any future export writer must use — because an export is exactly the code that
   gets written by copying a query from somewhere else.

7. **`endStopCommitPlan` and `markEndStopMaterialised` are built and unreachable
   until Phase 8 calls them**, the same way Phase 6's `runPostCommitTemplateStep`
   was. Phase 8 must: call `ensureEndStopCommitted` before reading the policy,
   spread `plan.draft` into its `carrierStop.create`, set
   `dispatches.end_stop_policy` from `plan.policy`, and call
   `markEndStopMaterialised` inside the same transaction.

---

## 8. Rules this phase adds to the module's standing set

- **The end stop is derived, committed at a mutation, and materialised at
  commit — never a consignment.** Three separate correctness properties depend on
  it not being in `reviewedExtraction.consignments`.
- **A stored end-stop decision short-circuits the ladder on the KEY'S PRESENCE,
  so undoing it means DELETING the key.** `NONE` is an answer, not an absence.
  Third slot to hit this (client, template, now end stop) — assume the fourth
  will too.
- **`driverResidences` is default-FALSE and does not go through
  `hasPermission`.** Every other permission in this codebase is default-allow.
  `fullAccess` does not grant it either.
- **Filter a picker, mask a trip's own stops.** Dropping a residence row from an
  itinerary deletes the end stop; keeping its address in one leaks a home. The
  mask nulls the **coordinates** as well as the address.
- **Optimisation never mutates, and the accept path is Phase 5's reorder.** The
  server recomputes rather than trusting an order from the client.
- **Firm windows are an ordering constraint, not an arrival-time constraint** —
  the trip has no departure time until Phase 8.
- **The matrix cache key is the SORTED facility-id list.** Order-insensitive so a
  template hits daily; set-sensitive so invalidation is structural.
- **Both optimisation floors live in `optimisation-constants.ts`, combined with
  OR**, grep-verified single occurrence, imported by the tests.
