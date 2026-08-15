# Phase 7 — null-coordinate handling in the route optimisation path

**Type:** read-only diagnostic. No code was modified, no DDL ran, no database write was issued, no dev server was started.
**Date:** 2026-08-14
**Trigger:** Phase 7 verification blocked. All four facilities on route template `MKE-NORTH-2` (`878ba6b5-ce7c-4c00-af46-2e094ba1f672`) have `latitude`/`longitude` NULL with fully populated street addresses. `route_matrix_cache` has 0 rows.

---

## Headline

The optimiser behaves **exactly as designed** on null coordinates: it declines, silently, and offers nothing. Nothing is broken in Phase 7's optimisation code — the code is doing the correct thing with data it was never given.

The actual defect is upstream and is a **product gap, not a bug**: the document-import pipeline creates facilities with addresses and no coordinates, and **no geocoding step exists anywhere on that path**. Phase 7 is therefore unverifiable against any import-created facility set, and will remain so until coordinates exist.

Three findings beyond the six questions are worth acting on, recorded at the end: a **wrong comment** that would mislead the next reader, a **decline reason that conflates five distinct causes**, and the fact that **null coordinates produce zero log output** — which is why this cost a debugging session rather than a glance.

---

## 1. Where the optimisation path gathers stop coordinates

One place, for both callers: `pointsFor()` in [optimisation-service.ts:125-146](apps/web/src/lib/document-import/optimisation-service.ts#L125-L146).

```ts
/** Facility rows with coordinates, for the matrix. Facilities without them
 *  cannot be costed, and `getDistanceMatrix` answers null. */
async function pointsFor(
  db: PrismaClient,
  orgId: string,
  facilityIds: readonly string[],
): Promise<MatrixPoint[] | null> {
  const ids = [...new Set(facilityIds)].filter(Boolean);
  if (ids.length < 2) return null;

  const rows = await db.carrierFacility.findMany({
    where: { id: { in: ids }, orgId },
    select: { id: true, latitude: true, longitude: true },
  });

  const points: MatrixPoint[] = [];
  for (const row of rows) {
    if (row.latitude == null || row.longitude == null) return null;
    points.push({ id: row.id, latitude: row.latitude, longitude: row.longitude });
  }
  return points.length === ids.length ? points : null;
}
```

Coordinates come **straight from the `facilities` table** (`CarrierFacility`, `@@map("facilities")`, coords nullable at [schema.prisma:2058-2059](apps/web/prisma/schema.prisma#L2058-L2059)). They are read, never derived, never fetched.

Two call sites, one per surface:

| Path | Line | Facility set assembled |
|---|---|---|
| Import | [optimisation-service.ts:285](apps/web/src/lib/document-import/optimisation-service.ts#L285) | movable stops + `endFacilityId` + `startFacilityId` (lines 281-283) |
| Template | [optimisation-service.ts:482](apps/web/src/lib/document-import/optimisation-service.ts#L482) | template stops + `endFacilityId` (lines 479-480) |

Both then hand the points to `getDistanceMatrix`, which applies a **second, independent** coordinate guard at [optimisation-matrix.ts:248](apps/web/src/lib/document-import/optimisation-matrix.ts#L248):

```ts
if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) return null;
```

Only after that guard does the provider request get built — coordinates are formatted `lng,lat` into the OSRM table URL at [osrm.ts:220-221](apps/web/src/lib/geo/osrm.ts#L220-L221).

---

## 2. What happens when a stop has NULL latitude or longitude

**Classification: (d) — short-circuits and returns no suggestion.**

Definitively **not** the other four:

| | Ruled out because |
|---|---|
| (a) throws | Both guards `return null`. `getDistanceMatrix`'s contract is explicit ([optimisation-matrix.ts:232-239](apps/web/src/lib/document-import/optimisation-matrix.ts#L232-L239)): *"Returns null rather than throwing… A facility with no coordinates is not an error either."* |
| (b) filters and optimises the remainder | The guard is **all-or-nothing**. `pointsFor` returns `null` for the entire set on the first coordinate-less row — it does not `continue`. Reinforced by the trailing `points.length === ids.length` check (line 145), which rejects the set if even one facility is missing entirely. |
| (c) substitutes a fallback | No default, no `?? 0`, no centroid anywhere on the path. |
| (e) on-demand geocoding | See Q4 — no geocoder is reachable from this module. `optimisation-matrix.ts` imports `getOSRMMatrix` only, which is routing, not geocoding. |

**The concrete `MKE-NORTH-2` trace:** 4 facilities, all NULL → `pointsFor` returns `null` on the first row → `points` is `null` → the ternary at [optimisation-service.ts:483-489](apps/web/src/lib/document-import/optimisation-service.ts#L483-L489) short-circuits so **`getDistanceMatrix` is never called** → `matrix` is `null` → [line 490](apps/web/src/lib/document-import/optimisation-service.ts#L490):

```ts
if (!matrix) return notOffered({ ...empty, declineReason: 'NO_MATRIX' }, true);
```

The decline reason is **`NO_MATRIX`**, and the OSRM provider is never contacted.

> **This also fully explains `route_matrix_cache` = 0 rows, and that row count is a symptom rather than a second problem.** `persist: true` is passed from exactly two places, both `apply*` mutations ([optimisation-service.ts:335](apps/web/src/lib/document-import/optimisation-service.ts#L335) and [:521](apps/web/src/lib/document-import/optimisation-service.ts#L521)). Both call the `get*` function first and then throw on `!view.offered` ([:336-341](apps/web/src/lib/document-import/optimisation-service.ts#L336-L341), [:523-527](apps/web/src/lib/document-import/optimisation-service.ts#L523-L527)) — which is always, under null coordinates. A cache row can only be written after a provider call that only happens after the coordinate guard passes. **An empty cache table is the expected state here and is not evidence of a caching defect.**

---

## 3. Is the null-coordinate decline distinguishable from the below-floor decline?

Answer differs by surface. **Yes in the API response; no in the UI; no in the logs.**

The two branches, quoted:

**Null coordinates** — [optimisation-service.ts:490](apps/web/src/lib/document-import/optimisation-service.ts#L490) (template) and [:293-295](apps/web/src/lib/document-import/optimisation-service.ts#L293-L295) (import):
```ts
if (!matrix) return notOffered({ ...empty, declineReason: 'NO_MATRIX' }, true);
```

**Below floor** — [optimisation.ts:560-564](apps/web/src/lib/document-import/optimisation.ts#L560-L564):
```ts
const clearsFloor =
  base.savedMiles >= OPTIMISATION_MIN_SAVED_MILES ||
  base.savedMinutes >= OPTIMISATION_MIN_SAVED_MINUTES;

if (!clearsFloor) return { ...base, offered: false, declineReason: 'BELOW_FLOOR', movedOrder: [] };
```

### In the API response — DISTINGUISHABLE

`handleGetTemplateOptimisation` returns the whole view via `ok(view)` ([handlers.ts:903-911](apps/web/src/lib/document-import/handlers.ts#L903-L911)), so both `suggestion.declineReason` and `declineNote` reach the client. The sentences differ ([optimisation-copy.ts:81-87](apps/web/src/lib/document-import/optimisation-copy.ts#L81-L87)):

```ts
NO_MATRIX:   'Driving distances are not available right now. Try again shortly.',
BELOW_FLOOR: 'No other order saves enough to be worth changing.',
```

**But the `NO_MATRIX` sentence is actively misleading in this situation.** "Try again shortly" describes a transient provider outage. Null coordinates are permanent until someone geocodes the facilities — retrying will never help. A dispatcher following that instruction is following it into a loop.

### In the UI — NOT DISTINGUISHABLE (neither reason is rendered at all)

`declineNote` and `declineReason` appear in **zero** `.tsx` files across `apps/web/src`, and **zero** files anywhere in `apps/mobile`. Nothing renders either value on either surface. Both branches present identically to a user: the optimisation card is simply absent.

This is intentional for the import card — [optimisation-copy.ts:74-79](apps/web/src/lib/document-import/optimisation-copy.ts#L74-L79) says the sentences *"exist for the template screen, where a person pressed a button and is owed an answer, and for the logs."* **Neither consumer materialised.** The template screen does not display the answer it was written for.

### In server logs — NOT DISTINGUISHABLE (null coordinates log nothing at all)

`pointsFor` contains no logger call ([optimisation-service.ts:125-146](apps/web/src/lib/document-import/optimisation-service.ts#L125-L146)). Because `points` is `null`, the ternary skips `getDistanceMatrix` entirely, so neither of that function's two log lines can fire:

- [optimisation-matrix.ts:255](apps/web/src/lib/document-import/optimisation-matrix.ts#L255) — `matrix skipped — too many facilities`
- [optimisation-matrix.ts:301](apps/web/src/lib/document-import/optimisation-matrix.ts#L301) — `matrix unavailable` (fires only on OSRM failure)

**A null-coordinate decline emits no log line anywhere on the path.** This is the single highest-value observability gap in the report: the failure is invisible in the API (only as a generic reason), invisible in the UI, and invisible in the logs.

### The conflation, stated plainly

`NO_MATRIX` is returned for **five causally distinct** situations, all indistinguishable to every consumer:

1. One or more facilities have NULL coordinates — `pointsFor` → null *(this case)*
2. A facility row vanished between the ladder and the read — `points.length !== ids.length`
3. Fewer than 2 unique facilities ([optimisation-matrix.ts:253](apps/web/src/lib/document-import/optimisation-matrix.ts#L253))
4. More than `MATRIX_MAX_POINTS` (25) facilities ([:254-257](apps/web/src/lib/document-import/optimisation-matrix.ts#L254-L257))
5. OSRM unreachable, timed out, or returned a malformed/undersized grid ([:300-303](apps/web/src/lib/document-import/optimisation-matrix.ts#L300-L303), [osrm.ts:230-251](apps/web/src/lib/geo/osrm.ts#L230-L251))

Only #5 is transient. Only #5 matches the copy.

> **Code/comment divergence — flagging because it will mislead the next reader.** [optimisation-matrix.ts:236-239](apps/web/src/lib/document-import/optimisation-matrix.ts#L236-L239) states: *"A facility with no coordinates … means this run cannot be costed. The caller reports `UNRESOLVED_STOPS` and says nothing more."* **The caller does not.** It reports `NO_MATRIX`. `UNRESOLVED_STOPS` is returned only at [optimisation-service.ts:277-279](apps/web/src/lib/document-import/optimisation-service.ts#L277-L279), gated on `unresolved > 0` — a stop with **no facility link at all**, which is a different condition from a linked facility with no coordinates. The comment describes behaviour the code does not have. Reported, not corrected, per the read-only constraint.

---

## 4. Does any geocoding step exist in the document-import facility creation path?

**Definitively no.** Not in the T1–T4 ladder, not in `ensureStopsCommitted`, not in any facility-create writer.

There is exactly **one** non-generated, non-test facility-create site in the repo — [facilities.ts:143](apps/web/src/lib/carrier/facilities.ts#L143), `tenantPrisma.carrierFacility.create({ data: { ...data, orgId } })` — and it is a pure spread of the caller's payload. The import path's payload is enumerated explicitly at [facility-resolution.ts:505-518](apps/web/src/lib/document-import/facility-resolution.ts#L505-L518) and **`latitude`/`longitude` are absent**:

```ts
const data: FacilityCreateInput = {
  name, facilityType,
  addressLine1: input.addressLine1 ?? undefined,
  addressLine2: input.addressLine2 ?? undefined,
  city: input.city ?? undefined,
  state: input.state ?? undefined,
  zip: input.zip ?? undefined,
  country: input.country ?? undefined,
  contactName: input.contactName ?? undefined,
  contactPhone: input.contactPhone ?? undefined,
  createdById: userId,
  updatedById: userId,
};
```

**This is not a type limitation** — `FacilityCreateInput` supports coordinates at [facilities.ts:33-34](apps/web/src/lib/carrier/facilities.ts#L33-L34) (`latitude?: number; longitude?: number;`). The import path simply never populates them.

Nor can the client supply them. The transport handler whitelists body keys at [handlers.ts:409-419](apps/web/src/lib/document-import/handlers.ts#L409-L419) and **drops lat/lng even if sent**. `CreateStopFacilityInput` has no coordinate members.

The ladder itself is structurally incapable of geocoding:

| File | Evidence |
|---|---|
| `address.ts` | No imports at all. Header line 17: *"PURE AND DETERMINISTIC. No Prisma, no fetch, no geocoder, no clock."* |
| `facility-ladder.ts` | Imports only `./address`, `./facility-matching`, `./matching`, `./facility-constants` |
| `facility-matching.ts` | Imports only `./address`, `./facility-constants` — string scoring only |
| `facility-lookup.ts` | Read-only (`findMany` at line 184), no geo import |
| `facility-resolution.ts` | Import block lines 57-82 — no geo import |
| `ensureStopsCommitted` | [facility-resolution.ts:272-331](apps/web/src/lib/document-import/facility-resolution.ts#L272-L331) — writes provenance + external refs only. Doc comment line 270: *"**This function cannot create a facility.**"* Enforced by `facility-commit.test.ts:219` |

**A geocoder does exist in the repo and is not wired to this path.** [geo/geocode.ts:16](apps/web/src/lib/geo/geocode.ts#L16) (`geocodeAddress()`, Nominatim) has exactly three importers — `api/mobile/owner/loads/[id]/route.ts:7`, `api/mobile/owner/loads/route.ts:7`, `lib/geofencing/geofence-check.ts:26`. **None is in `document-import`.** The only `@/lib/geo/*` import in the whole module is `getOSRMMatrix` at [optimisation-matrix.ts:57](apps/web/src/lib/document-import/optimisation-matrix.ts#L57), which is routing over facilities that already have coordinates.

A grep for `fetch(|nominatim|geocod|https?://` across all of `apps/web/src/lib/document-import/` returns **zero outbound HTTP calls** — only comments mentioning geocoding.

**No deferred or background geocoding job exists either.** There is no queue, no cron entry, and no backfill script targeting `facilities`.

---

## 5. Does the facility create/edit UI expose latitude/longitude?

**Partially — one surface of four has it, and it is not the surface that created these rows.**

| Surface | Coordinate input? | Evidence |
|---|---|---|
| Desktop web `FacilityForm` | **YES** | [FacilityForm.tsx:502-530](apps/web/src/components/carrier/facilities/FacilityForm.tsx#L502-L530) — two `<Input>`s (`id="latitude"` / `id="longitude"`, placeholders `41.8781` / `-87.6298`), validated at lines 111-116, submitted at lines 203-204. Also auto-filled from `AddressAutocomplete` at lines 304-315 (`latitude: String(place.lat)`) |
| Mobile-web create twin | **NO** | [FacilityCreateMobile.tsx](apps/web/src/app/(owner)/carrier/facilities/new/FacilityCreateMobile.tsx) — no coordinate state, no field; POST body (lines 87-100) omits both. Address fields are plain `SheetInput`s, line 36: *"Address is manual entry"* |
| Mobile-web edit twin | **NO (preserve-only)** | [FacilityEditMobile.tsx:74-76](apps/web/src/app/(owner)/carrier/facilities/[id]/FacilityEditMobile.tsx#L74-L76) — `const`, not `useState`; no setter exists. Re-sent on PATCH purely to avoid clobbering |
| **Document-import create form** | **NO** | [StopResolutionList.tsx:343-350](apps/web/src/components/carrier/imports/StopResolutionList.tsx#L343-L350) — fields are `name, addressLine1, addressLine2, city, state, zip`. RN twin `apps/mobile/components/imports/StopReview.tsx:978-986` likewise |

Because `ResponsiveSwitch` mounts exactly one variant ([ResponsiveSwitch.tsx:28-36](apps/web/src/components/ui/ResponsiveSwitch.tsx#L28-L36)), the desktop form is **not in the DOM on a phone** — a facility created on mobile web gets NULL coordinates with no way to supply them from that screen.

The server accepts coordinates on both POST and PATCH ([api/v1/carrier/facilities/route.ts:18-19](apps/web/src/app/api/v1/carrier/facilities/route.ts#L18-L19)), and **performs no server-side geocoding** — coordinates are only ever what the client sent.

There is **no bulk-import screen, no admin/sysadmin coordinate tool, and no map drag-pin**. The seven files with drag handlers are all list-reorder UIs.

**Practical consequence for `MKE-NORTH-2`:** the four facilities can be fixed today only by opening each one individually on a **desktop viewport** and either typing coordinates or re-picking the address through autocomplete. That path exists but does not scale to a tenant's whole facility table.

---

## 6. Does `facility_key` generation tolerate null coordinates?

**The question is sound but the code never reaches the risk.** The key is built from facility **ids only** — [optimisation-matrix.ts:83-85](apps/web/src/lib/document-import/optimisation-matrix.ts#L83-L85):

```ts
export function matrixCacheKey(facilityIds: readonly string[]): string {
  return [...new Set(facilityIds)].sort().join('>');
}
```

Coordinates are not an input, so no coordinate value — null or otherwise — can degenerate or collide the key. And it is unreachable under null coordinates anyway: the guard at [line 248](apps/web/src/lib/document-import/optimisation-matrix.ts#L248) returns before `matrixCacheKey` is called at [line 259](apps/web/src/lib/document-import/optimisation-matrix.ts#L259). **No degenerate key can be written.** Combined with the `persist`-gate analysis in Q2, no row can be written at all in this state.

**However — there is a real latent collision, and it becomes live the moment this bug is fixed.** Because the key encodes ids and not coordinates, **a facility that is later geocoded produces the identical key**. A cached matrix computed before a backfill would be served after it, silently, with the old geometry. This is explicitly known and documented as an unbuilt hook at [optimisation-constants.ts:144-157](apps/web/src/lib/document-import/optimisation-constants.ts#L144-L157):

> *"a facility that gets **re-geocoded**. The key is the sorted id list, and an id whose coordinates were corrected is the same id, so nothing about the key changes and the stale matrix would otherwise be served forever. Time is the only thing that retires it."*
> *"**Known gap, recorded rather than built:** re-geocoding a facility should ideally delete that org's cache rows naming it. No such hook exists."*

Only `MATRIX_L2_CACHE_TTL_MS` (30 days) retires such a row. `clearMatrixCache()` ([optimisation-matrix.ts:88-90](apps/web/src/lib/document-import/optimisation-matrix.ts#L88-L90)) clears **L1 only** and has no L2 equivalent.

**Whoever backfills coordinates should know this ordering matters.** Today the table is empty, so backfilling now is free. Backfilling *after* rows accumulate needs those rows purged, and no code path does that.

---

## Ambiguities — stated rather than resolved

Per the read-only constraint, these were not chased to a conclusion:

1. **Whether the empty `declineNote` consumer is an oversight or a deferral.** The copy module says the sentences exist "for the template screen"; no template screen renders them. Nothing in-repo says whether Phase 7 intended to ship that rendering. Not inferred.
2. **Whether `NO_MATRIX`-for-null-coordinates was a deliberate merge or drift.** The comment at `optimisation-matrix.ts:236-239` says `UNRESOLVED_STOPS`; the code says `NO_MATRIX`. Which one represents intent is not determinable from the source.
3. **Why hand-seeded facilities have coordinates.** Consistent with desktop-form creation or direct seeding, but no seed script was located that proves it. Not asserted.

---

## Per-item audit

| # | Question | Status | Notes |
|---|---|---|---|
| 1 | Where coordinates are gathered, with quoted code | **ANSWERED** | `pointsFor()`, optimisation-service.ts:125-146, quoted in full; both call sites (285, 482) and the second guard at optimisation-matrix.ts:248 identified |
| 2 | Classify null-coordinate behaviour (a)–(e) | **ANSWERED** | **(d)** short-circuits, no suggestion. Other four ruled out with evidence. `MKE-NORTH-2` traced end-to-end to `NO_MATRIX`; provider never called |
| 3 | Is the null branch distinguishable from below-floor? | **ANSWERED** | Both branches quoted. **API: yes** (`NO_MATRIX` vs `BELOW_FLOOR`, distinct sentences). **UI: no** — zero `.tsx` renders either value on either surface. **Logs: no** — the path emits nothing at all. Plus: `NO_MATRIX` conflates five causes, and its copy ("Try again shortly") is wrong for this one |
| 4 | Any geocoding in the import facility path? | **ANSWERED** | **Definitively none.** One create site, coords absent from its payload; handler whitelist drops them; ladder files carry no geo imports; zero outbound HTTP in the module; the repo's geocoder has three importers, none in document-import |
| 5 | Does the facility UI expose lat/lng? | **ANSWERED** | Desktop `FacilityForm.tsx:502-530` yes (+ autocomplete autofill); mobile-web create no; mobile-web edit preserve-only; **both import forms no**. No bulk tool, no map pin |
| 6 | Does `facility_key` tolerate null coordinates? | **ANSWERED** | Key is ids-only, so no degenerate/colliding key is possible from coordinates, and it is unreachable under nulls regardless. Latent same-key-after-re-geocode staleness documented with no invalidation hook — relevant to the eventual backfill |

**Constraint compliance:** zero files modified, zero DDL, zero database writes, no dev server started, no fix proposed or applied. The only file written is this report.
