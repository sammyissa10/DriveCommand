# quick-522 — READ-ONLY DIAGNOSTIC: null-coordinate handling in Phase 7 route optimisation

**Date:** 2026-08-14
**Type:** Read-only diagnostic. No code modified, no DDL, no database writes, no dev server.
**Deliverable:** [`.planning/document-import/diagnostics/phase7-null-coordinates.md`](../../document-import/diagnostics/phase7-null-coordinates.md)

## Workflow deviation, stated

No `gsd-planner` / `gsd-executor` pair was spawned. The task is read-only and produces exactly one artifact — a report — so a plan-then-execute split would have been ceremony over a single investigation. Two read-only `Explore` agents were used for the two broad sweeps (geocoding presence, facility UI surfaces); the optimisation path itself was read directly. Everything the report asserts is backed by a quoted line at a cited path.

## Conclusion

**Phase 7's optimisation code is not broken.** It declines correctly and by design when facilities have no coordinates. The blocker is upstream: the document-import pipeline creates facilities with addresses and **no geocoding step exists anywhere on that path**, so Phase 7 cannot be verified against any import-created facility set.

`route_matrix_cache` = 0 rows is a **symptom, not a second problem** — `persist: true` comes only from the two `apply*` mutations, and both throw on `!view.offered` before any provider call can happen.

## Answers

| Q | Answer |
|---|---|
| 1 | `pointsFor()` — `optimisation-service.ts:125-146`, reading `latitude`/`longitude` straight off `facilities`. Second guard at `optimisation-matrix.ts:248` |
| 2 | **(d) short-circuits, no suggestion.** All-or-nothing: one null coordinate kills the whole set. Not a throw, not a filter, no fallback, no on-demand geocode |
| 3 | Distinguishable **in the API** (`NO_MATRIX` vs `BELOW_FLOOR`); **not in the UI** (zero `.tsx` renders either value on either surface); **not in logs** (the path emits nothing at all) |
| 4 | **Definitively no geocoding** in the import facility path. The repo's geocoder has 3 importers, none in `document-import` |
| 5 | Desktop `FacilityForm.tsx:502-530` **yes**; mobile-web create **no**; mobile-web edit preserve-only; **both import forms no** |
| 6 | Key is facility-**ids only**, so no degenerate/colliding key is possible from coordinates — and it is unreachable under nulls regardless |

## Three findings beyond the six questions

1. **A comment that will mislead the next reader.** `optimisation-matrix.ts:236-239` claims *"The caller reports `UNRESOLVED_STOPS`"*. It does not — it reports `NO_MATRIX`. `UNRESOLVED_STOPS` is a different condition (a stop with no facility link at all, `optimisation-service.ts:277-279`). Reported, not corrected.
2. **`NO_MATRIX` conflates five causally distinct situations**, only one of which is transient — and its user-facing copy, *"Try again shortly"*, is wrong for null coordinates, which are permanent until someone geocodes. A dispatcher following that instruction follows it into a loop.
3. **Null coordinates emit zero log output.** `pointsFor` has no logger call, and because `points` is null the ternary skips `getDistanceMatrix` entirely, so neither of its log lines can fire. Invisible in UI, generic in API, absent from logs — which is why this cost a session rather than a glance.

## Sequencing note for whoever fixes this

The cache key encodes facility ids and **not** coordinates, so a facility geocoded later produces the **identical key** — a pre-backfill matrix would be served after the backfill, retired only by the 30-day L2 TTL. `clearMatrixCache()` clears L1 only; there is no L2 equivalent and no invalidation hook (documented as a known gap at `optimisation-constants.ts:144-157`). **The table is empty today, so backfilling now is free.** Backfilling after rows accumulate is not.

## Ambiguities left open (read-only constraint)

- Whether the unrendered `declineNote` is oversight or deferral — nothing in-repo says.
- Whether `NO_MATRIX`-for-null-coordinates was deliberate or drift — comment and code disagree; intent is not determinable from source.
- Why hand-seeded facilities have coordinates — consistent with desktop-form creation, but no seed script was located that proves it.
