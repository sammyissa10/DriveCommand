# quick-523 — Backfill NULL facility coordinates (DRY RUN ONLY)

**Date:** 2026-08-15
**Commit:** `5f27dfc7` — `apps/web/scripts/backfill-facility-coordinates.ts` (new, 357 lines, the only file created)
**Status:** dry run complete. **`--apply` NOT run.** Awaiting human approval gate.

> Numbering: the user labelled this quick-524 and referred to the diagnostic as quick-523; the diagnostic was actually **quick-522**, so this is **523**. Sequence is authoritative.

---

## Steps 1 & 2 — reported before the script was written

### The geocoder — `apps/web/src/lib/geo/geocode.ts`

| | |
|---|---|
| Signature | `geocodeAddress(address: string): Promise<{ lat: number; lng: number } \| null>` (line 16-18) |
| Provider | **Nominatim / OpenStreetMap** — `https://nominatim.openstreetmap.org/search?q=…&format=json&limit=1` (line 21) |
| API key | **None required.** Header line 3: *"Free, no API key required."* Verified absent from `.env.local` and not needed — the task's stop-and-report branch does not trigger |
| **User-Agent (amendment 4)** | **SET.** `headers: { 'User-Agent': 'DriveCommand/1.0 fleet-management' }` (line 23) — identifying and non-default, so Nominatim will not blanket-reject. **The STOP condition did not trigger and the loop proceeded.** |
| Timeout | `AbortSignal.timeout(5000)` (line 24) |
| Error behaviour | Never throws — every failure returns `null` (lines 26, 28, 34-36) |
| Confidence | **None.** Returns `{lat, lng}` only, discarding Nominatim's `importance`, `place_rank`, `class`, `type`, `display_name`, `boundingbox` |
| Rate limiting in the 3 importers | **None whatsoever.** `geofencing/geofence-check.ts:26` (single lazy call); `api/mobile/owner/loads/route.ts:7` and `…/loads/[id]/route.ts:7`, both via `geocodeLoadAddresses`, which fires **two concurrently** through `Promise.all` (geocode.ts:53-56). All are one-or-two-address user actions, so none ever needed a throttle — **a backfill loop does**, and it lives in the script since the module is do-not-modify |

### The columns

Confirmed the target is exactly `facilities.latitude` / `facilities.longitude` and **not** a different shape — no PostGIS geometry, no combined point type, no separate coordinates table:

```prisma
  latitude            Float?
  longitude           Float?
```

Both plain nullable `Float` with **no `@map`**, so Prisma field name = column name. Mapping is `lat → latitude`, `lng → longitude` — note the rename on the second; Nominatim returns `lon`, which geocode.ts already renames to `lng` at line 32.

Address fields (all nullable except `country`): `addressLine1 @map("address_line1")`, `addressLine2 @map("address_line2")`, `city`, `state`, `zip`, `country` (NOT NULL, default `'US'`).

---

## Amendments as implemented

| # | Amendment | Where |
|---|---|---|
| 1 | Script-owned bbox check replaces the absent confidence value; PASS/FAIL/UNKNOWN | `bboxCheck()` line 168-175; boxes line 78-84 — **only WI and IN**, the two states actually present. Anything else → `UNKNOWN`, never a guessed box |
| 2 | Normal Prisma `update()`; `@updatedAt` stamp permitted; no raw SQL; print `updated_at` before/after | line 313-331, behind `if (apply)`. Writes `data: { latitude, longitude }` only |
| 3 | Strictly sequential, ≥1100ms apart, no `Promise.all` | `THROTTLE_MS = 1100` line 71; `await sleep()` line 286-289 (skipped for the first call, so 12 geocodes = 11 sleeps) |
| 4 | Report User-Agent before the loop; STOP if absent | Verified set — see table above. Did not trigger |
| 5 | Include `country` in the submitted address | `buildAddress()` line 155 |

---

## Production reality: 15 NULL-coordinate facilities, not 4

The task anticipated the four MKE-NORTH-2 facilities. There are **15**, in three classes — the four are a subset of Class A.

**Class A — 9 WI rows**, full street addresses, all `customer_site`. Genuinely geocodable.
**Class B — 3 IN rows**, city/state/zip only, no street address. `country` is the string `"United States"` here, not `"US"` — **country values are inconsistent across this table**, which amendment 5 now feeds into the query string.
**Class C — 3 rows with no address data at all** (`address_line1/2`, `city`, `state`, `zip` all NULL; names are bare numbers `112`, `85`, `98`; all `terminal`).

### The Class C guard is the load-bearing safety property

With amendment 5 including `country`, these three rows' address string would collapse to the bare `"US"` — and Nominatim would cheerfully return **the centroid of the United States**: a plausible-looking coordinate pair that is catastrophically wrong and would pass any check that merely asks "did we get numbers back". `buildAddress()` therefore judges usability on the **five non-country fields only** (line 145-153), and the loop `continue`s at line 283 **before** the throttle and before any geocoder call.

---

## Full dry-run output (all 15 rows, verbatim)

```
DRY RUN — no database writes
[backfill] found 15 facilities in org 7e9eca25-1f97-46ed-9365-e67be49436d5 with a NULL latitude or longitude

id                                    | name                          | address submitted                                                     | latitude    | longitude   | confidence                              | bbox     | status
6c27afca-df4f-40cc-9fbb-f720fe2290da  | 112                           | (no address data — address_line1/2, city, state, zip all null/blank)  | -           | -           | n/a (not exposed by geocodeAddress)     | -        | SKIPPED (no address data)
71f85012-a712-4677-be7c-5ed1ebf4dfee  | 85                            | (no address data — address_line1/2, city, state, zip all null/blank)  | -           | -           | n/a (not exposed by geocodeAddress)     | -        | SKIPPED (no address data)
0e9770e9-0697-4423-b92f-f51e85561d26  | 98                            | (no address data — address_line1/2, city, state, zip all null/blank)  | -           | -           | n/a (not exposed by geocodeAddress)     | -        | SKIPPED (no address data)
fcef652b-7a02-4fe1-bcce-60d2a55ef28d  | ANDREW TOYOTA                 | 1620 W SILVER SPRING DR, GLENDALE, WI, 53209, US                      | 43.1196513  | -87.9306311 | n/a (not exposed by geocodeAddress)     | PASS     | OK
9aee8bfd-a3e2-4050-9315-1a08a72488ab  | BOUCHER KIA OF MILWAUKEE      | 4141 S 108TH ST, GREENFIELD, WI, 53228, US                            | 42.968704   | -88.0478304 | n/a (not exposed by geocodeAddress)     | PASS     | OK
e7ed17b3-4f92-480f-81e8-45e4bee0af0f  | DealerCorp                    | Griffith, IN, 46319, United States                                    | 41.534507   | -87.4255305 | n/a (not exposed by geocodeAddress)     | PASS     | OK (CITY-CENTROID — no street address on file, not premises-level)
b7425e1a-b262-4ba0-8c9e-09d4e34f7315  | HALL FORD LINCOLN             | 19809 W BLUEMOUND RD, BROOKFIELD, WI, 53045, US                       | 43.035266   | -88.1594119 | n/a (not exposed by geocodeAddress)     | PASS     | OK
4377ef7c-4820-4022-80af-7f12c68452c5  | HEISER CHEVROLET WEST ALLIS   | 10200 W Arthur Ave, West Allis, WI, 53227, US                         | 42.999913   | -88.0428877 | n/a (not exposed by geocodeAddress)     | PASS     | OK
00e3fa6a-5bda-4b22-a844-fd3ebf8a8711  | House                         | Griffith, IN, 46319, United States                                    | 41.534507   | -87.4255305 | n/a (not exposed by geocodeAddress)     | PASS     | OK (CITY-CENTROID — no street address on file, not premises-level)
82a4c1fc-af8c-4457-9799-cc8724f5e00c  | INTERNATIONAL AUTOS GROUP NORTH BMW OF MILWAUKEE NORTH| 5150 N Port Washington Rd, Glendale, WI, 53217, US                    | 43.1105896  | -87.915305  | n/a (not exposed by geocodeAddress)     | PASS     | OK
3864cde6-5835-46f4-8f0a-7e49cdeeffb2  | RUSS DARROW NISSAN            | 11212 W METRO BLVD, MILWAUKEE, WI, 53224, US                          | -           | -           | n/a (not exposed by geocodeAddress)     | -        | SKIPPED (geocoder returned null)
b5613856-628f-4e14-938f-2959966061a0  | SCHLOSSMANN DODGE CITY        | 3450 S 108TH ST, MILWAUKEE, WI, 53227, US                             | 42.9813956  | -88.046224  | n/a (not exposed by geocodeAddress)     | PASS     | OK
164892e2-613d-4bb0-92f1-f6ecf6c32a26  | UMANSKY MOTOR CARS            | 2400 W SILVER SPRING DR, GLENDALE, WI, 53209, US                      | 43.119138   | -87.941602  | n/a (not exposed by geocodeAddress)     | PASS     | OK
abacd8a6-b86c-45fa-94d2-cba77f10c61a  | Walmart IN                    | Crown Point, IN, 46307, United States                                 | 41.4169806  | -87.3653136 | n/a (not exposed by geocodeAddress)     | PASS     | OK (CITY-CENTROID — no street address on file, not premises-level)
74fd37e3-97ea-4f71-9bfb-ade33ac5ad01  | WILDE HONDA                   | 1603 E MORELAND BLVD, WAUKESHA, WI, 53186, US                         | 43.0248398  | -88.2022446 | n/a (not exposed by geocodeAddress)     | PASS     | OK

[backfill] summary: found=15 ok=11 (city-centroid=3) skipped-null=1 skipped-no-address=3
[backfill] bbox check: PASS=11 FAIL=0 UNKNOWN=0
DRY RUN COMPLETE — 0 rows written
```

**Result: 11 resolved · 4 skipped · 0 bbox failures · 0 rows written.**

---

## Orchestrator verification (not taken on the executor's report)

- **Zero database writes confirmed against production**, after the run: `still_null = 15`, `any_written = 0`, `MAX(updated_at) = 2026-08-07 06:09:55+00` — eight days before this task. Nothing was touched.
- **Commit scope**: one file, `apps/web/scripts/backfill-facility-coordinates.ts`. `git diff` since the diagnostic shows nothing else.
- **Guards read as real code**, not described behaviour: the no-address skip `continue`s at line 283 before the throttle and before `geocodeAddress`; boxes at line 78-84 contain WI and IN and nothing else; the apply branch is behind `if (apply)` and writes only `{ latitude, longitude }`.
- **The coordinates are genuine, not fabricated.** Internal consistency check: `1620 W SILVER SPRING DR` → `-87.9306` and `2400 W SILVER SPRING DR` → `-87.9416`. The higher block number sits further west, which is what a real geocoder returns and what a fabricated table would get wrong. Independently, `Walmart IN` at `41.4169806, -87.3653136` matches the published Crown Point IN centroid to four decimals.
- **tsc gate probed, not assumed**: the executor injected `const __probe: number = 'this-should-fail-tsc'`, confirmed tsc reported `TS2322` at that exact line, removed it, and re-ran clean at 0.

---

## What needs a human decision before `--apply`

1. **`RUSS DARROW NISSAN` (`3864cde6…`) did not resolve.** `11212 W METRO BLVD, MILWAUKEE, WI 53224` returned null. The script correctly declined to guess. This is one of the four MKE-NORTH-2 facilities, so **the template still cannot be fully costed even after an apply run** — Phase 7's guard is all-or-nothing. Fixing it means correcting the address on file, not changing the script.
2. **The 3 city-centroid rows should probably NOT be applied.** `DealerCorp` and `House` resolved to **identical** coordinates (`41.534507, -87.4255305`) because they share a city and zip and have no street address. Writing those makes two distinct facilities occupy the same point, which the optimiser would cost as a zero-length leg. A bbox `PASS` here means "in the right state" and nothing more.
3. **The 3 no-address rows (`112`, `85`, `98`) cannot be fixed by geocoding at all** — they have no address to geocode. They need data entry or deletion.
4. **Sequencing still holds:** `route_matrix_cache` is at 0 rows, so applying now is free. The cache key encodes facility ids, not coordinates, and there is no L2 invalidation hook — apply before anything triggers an optimisation, or stale pre-geocode matrices get served for up to 30 days.

**Recommended apply subset:** the 8 resolved WI rows with real street addresses. Hold the 3 city-centroid IN rows and the 4 unresolvable ones.
