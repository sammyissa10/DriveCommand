# quick-536 (user label: quick-535) — Phase 8 verification close-out

Closes the two unfinished checks from tonight's browser verification of Phase 8
and fixes the two findings it raised.

> **Numbering.** The user's brief calls this quick-535. `535` was already taken by
> `docs(quick-535): diagnose the CarrierFacility deletedBy error`, so GSD allocated
> **536**. Same task, different folder number.

## Parts

| Part | Items | Nature |
|------|-------|--------|
| A | 1–5 | Rollback test audit. **Report only, no changes.** |
| B | 6–7 | Notification isolation. New integration test + a logging finding. |
| C | 8–10 | Finding 1 — trucks missing from the picker. **The only application-behaviour change.** |
| D | 11–12 | Finding 2 — window materialisation test + firmness finding. |

## What the investigation already settled (before any change)

- **Part C's stated premise is false and the finding is still real.** `getCommitPreview`'s
  truck query is `where: { orgId, deletedAt: null, isSample: false }` — there is **no status
  filter**, and `toTruckOption` already pushes `'Out of service'` and sets `blocked = true`.
  The truck vanished for a different reason: `TRAILER_TYPES` diverts it to the Trailer list.
  `pg_constraint` says `carrier_trucks.truck_type ∈ semi | box_truck | flatbed | reefer |
  tanker | day_cab | straight_truck | cargo_van | sprinter_van | pickup | car` — every one a
  power unit, and **none of them a trailer**. `TRAILER_TYPES` holds `trailer`, `dry_van`,
  `step_deck` (impossible on this table — they are the `route_templates.equipment_type`
  vocabulary) plus `flatbed`, `reefer`, `tanker` (real tractors). The one `out_of_service`
  truck in the whole database is a **`flatbed`**.
- **Item 12 is answered by the schema.** `route_template_stops` has no firmness column at
  all — only `appt_window_start_offset_min` / `appt_window_end_offset_min`.
- **Item 7 is answered by a live run.** `notifications.ts:210` passes its *context* object in
  `logger.error`'s *error* slot, so every failure logs as `Error: [object Object]`.

## Tasks

### T1 — Part C: stop filing tractors as trailers (`TRAILER_TYPES`)
Correct the set against `pg_constraint` so every power unit is listed in the Truck picker,
where the existing flag/block/named-reason treatment already applies. Add a unit test that
pins the set against the real check-constraint vocabulary so it cannot drift back.
Commit: `fix(quick-536): list every power unit in the import truck picker`

### T2 — Part B: notification isolation test + the logging fix
`tests/carrier/document-import-commit-notification-isolation.test.ts`. Forces
`sendDispatchAssignedNotification` to reject, commits, and asserts **from the database** that
the trip, its stops, its load and its documents all persist. Fixes `notifications.ts:210`.
Commit: `test(quick-536): prove a failing driver notification cannot undo a committed trip`

### T3 — Part D: window materialisation test
`tests/carrier/document-import-commit-windows.test.ts`. Commits an import carrying a route
template's offsets and asserts `stops.appointment_start` / `appointment_end` equal
`scheduledDeparture + offsetMin * 60000` on **real rows**, using MKE-NORTH-2's offsets
(630/720, 480/600, 750/840, 870/960 — deliberately not ascending, so the test also proves each
offset travels with its own stop).
Commit: `test(quick-536): assert template appointment windows materialise at commit`

## Constraints carried from the brief
- No DDL, no schema changes, no Supabase writes outside the disposable test tenant.
- Every DB test: throwaway tenant with an unmistakable `ZZ-THROWAWAY-…` name, `afterAll`
  cleanup **verified by post-teardown row count**, skip when `DATABASE_URL` is unset, and no
  write may touch `7e9eca25-1f97-46ed-9365-e67be49436d5`.
- Trip `53e002c8-722b-4f36-a6a8-1c9428a294b0` and its rows are untouchable.
- `git worktree remove` for the baseline worktree — never `Remove-Item`.
