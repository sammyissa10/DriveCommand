/**
 * quick-536, Finding 1 — the Truck picker must list every power unit.
 *
 * ---------------------------------------------------------------------------
 * WHAT WENT WRONG, AND WHY IT LOOKED LIKE A STATUS FILTER
 * ---------------------------------------------------------------------------
 * Browser verification of Phase 8 reported that an `out_of_service` truck did
 * not appear in the assignment screen's truck picker at all, while `inactive`
 * trucks and trucks with expired insurance did appear, flagged. That read as a
 * status filter, and it was not one: `getCommitPreview`'s truck query carries
 * no status predicate, and `toTruckOption` already pushes `'Out of service'`
 * onto `complianceFlags` and sets `blocked = true`.
 *
 * The truck was being diverted into the *Trailer* list by `TRAILER_TYPES`,
 * which claimed six `truck_type` values. Three of them (`trailer`, `dry_van`,
 * `step_deck`) cannot exist on `carrier_trucks` at all — they are
 * `route_templates.equipment_type`'s vocabulary — and the other three
 * (`flatbed`, `reefer`, `tanker`) are ordinary tractors. The only
 * `out_of_service` row in the database is a `flatbed`.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS TEST PINS
 * ---------------------------------------------------------------------------
 * One property, stated so it cannot be satisfied by accident: **no value the
 * `carrier_trucks.truck_type` CHECK admits may be classified as a trailer.**
 * That is the invariant, not the emptiness of the set — if a real trailer value
 * is added to the CHECK one day, it goes in both constants and this test keeps
 * holding the line for everything else.
 *
 * The vocabulary is imported from the module under test rather than restated
 * here, because a list copied into a test is a list that drifts. It was read
 * off `pg_constraint` in production, never inferred from the names — DEC-1 and
 * DEC-14's rule, and the exact rule the original set broke.
 */

import { describe, it, expect } from 'vitest';
import { TRAILER_TYPES, CARRIER_TRUCK_TYPES } from '../commit-service';

describe('quick-536 — truck vs trailer classification on the import assignment screen', () => {
  it('classifies no admissible truck_type as a trailer', () => {
    const misfiled = CARRIER_TRUCK_TYPES.filter((t) => TRAILER_TYPES.has(t));
    expect(misfiled).toEqual([]);
  });

  it('names no value the truck_type CHECK cannot hold', () => {
    // The other half of the original bug: three of the six values were copied
    // from a different table's enum and could never have matched a row, so the
    // set was both over-matching and dead at the same time.
    const impossible = [...TRAILER_TYPES].filter(
      (t) => !(CARRIER_TRUCK_TYPES as readonly string[]).includes(t),
    );
    expect(impossible).toEqual([]);
  });

  it('keeps every power unit on the truck side of the split', () => {
    // This is the user-visible guarantee: `trucks` is
    // `truckRows.filter((t) => !TRAILER_TYPES.has(t.truckType))`, so a type
    // landing in TRAILER_TYPES is a type that vanishes from the Truck picker.
    // A flatbed tractor that is out of service must be LISTED and blocked, not
    // absent — the expired-CDL driver's treatment, which is the one the
    // dispatcher can act on.
    for (const truckType of CARRIER_TRUCK_TYPES) {
      expect(TRAILER_TYPES.has(truckType)).toBe(false);
    }
  });
});
