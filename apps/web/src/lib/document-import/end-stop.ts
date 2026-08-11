/**
 * End stop policy — the PURE half. Spec Section 9, Part A.
 *
 * Nothing here touches Prisma, the network, or the clock beyond what it is
 * handed. `end-stop-lookup.ts` beside it does the reads and builds the view;
 * `end-stop-service.ts` holds every write. Same three-file split as Phase 6, for
 * the same reason: the arithmetic that decides where a working day closes should
 * be assertable without a database.
 *
 * ---------------------------------------------------------------------------
 * WHY THE END STOP IS NOT A CONSIGNMENT
 * ---------------------------------------------------------------------------
 * The obvious shortcut is to append the end stop to `reviewedExtraction.
 * consignments` so the review screen renders it for free. It is the wrong shape
 * and would have cost the module three separate correctness properties:
 *
 *  - **Template scoring.** quick-517 established that what reaches the scorer is
 *    a claim about today's run. An end stop is not on the document; a yard in the
 *    facility set would score every template against a stop no manifest mentions.
 *  - **The ghost rule.** quick-518's `isTemplateInsertedStop` is a deliberate
 *    conjunction so that every direction of doubt keeps a row. Adding a fourth
 *    kind of synthetic consignment gives that predicate a case it was never
 *    written for.
 *  - **Reorder.** Array order IS the running order (Phase 5). A consignment that
 *    must always be last is a rule the reorder endpoint would have to enforce,
 *    and a rule enforced in a permutation validator is a rule one refactor away
 *    from being dropped.
 *
 * So the end stop is DERIVED on read from the policy ladder, COMMITTED at the
 * mutation boundary as one key on `resolution_provenance` (quick-508/509/510),
 * and MATERIALISED by Phase 8's commit as a real `CarrierStop` with
 * `is_end_stop = true`, `stop_type = 'layover'`, and a sequence one past the last
 * reviewed stop. Pinned last is then a property of how the row is written rather
 * than a rule some later edit has to remember.
 *
 * NO DDL. `Tenant."defaultEndStopPolicy"`, `Tenant."homeBaseFacilityId"`,
 * `route_templates.end_stop_policy`, `dispatches.end_stop_policy`,
 * `stops.is_end_stop`, `facilities.is_driver_residence`,
 * `facilities.resident_driver_id` and the `driver_residence` facility type were
 * all created by Phase 1 and verified present against production on 2026-08-10
 * before this file was written.
 */

import {
  END_STOP_DEFAULT_POLICY,
  END_STOP_STOP_TYPE,
  isEndStopPolicy,
  type EndStopPolicy,
} from './end-stop-constants';

// ---------------------------------------------------------------------------
// Layer 1 — which policy applies
// ---------------------------------------------------------------------------

/**
 * Which of the three layers supplied the answer (spec Section 9: *"Resolution
 * order: tenant default, then template override, then per-trip choice"*).
 */
export type EndStopPolicySource = 'TENANT' | 'TEMPLATE' | 'TRIP';

export interface EndStopPolicyInput {
  /** `Tenant."defaultEndStopPolicy"` — NOT NULL, so always an answer. */
  tenant: string | null | undefined;
  /** `route_templates.end_stop_policy` on the selected template, or null. */
  template: string | null | undefined;
  /** The per-trip choice, from `resolution_provenance.endStop`, or null. */
  trip: string | null | undefined;
}

export interface EndStopPolicyResolution {
  policy: EndStopPolicy;
  source: EndStopPolicySource;
  /** Each layer's own answer, so the "why" can say what was overridden. */
  layers: {
    tenant: EndStopPolicy;
    template: EndStopPolicy | null;
    trip: EndStopPolicy | null;
  };
}

/**
 * Resolve the three layers, last one wins.
 *
 * An unreadable value at any layer is treated as absent rather than trusted. The
 * columns carry CHECK constraints so a bad value cannot normally be there, but
 * "normally" is doing work a deploy-skew or a hand-run UPDATE can undo, and a
 * policy this build has never heard of must not silently become an end stop
 * somewhere nobody chose.
 */
export function resolveEndStopPolicy(input: EndStopPolicyInput): EndStopPolicyResolution {
  const tenant = isEndStopPolicy(input.tenant) ? input.tenant : END_STOP_DEFAULT_POLICY;
  const template = isEndStopPolicy(input.template) ? input.template : null;
  const trip = isEndStopPolicy(input.trip) ? input.trip : null;

  const layers = { tenant, template, trip };

  if (trip) return { policy: trip, source: 'TRIP', layers };
  if (template) return { policy: template, source: 'TEMPLATE', layers };
  return { policy: tenant, source: 'TENANT', layers };
}

// ---------------------------------------------------------------------------
// Layer 2 — which facility that policy points at
// ---------------------------------------------------------------------------

export type EndStopTargetState =
  /** A facility is known. This is the only state that produces a stop. */
  | 'RESOLVED'
  /** The policy is `NONE`. Not a problem — a deliberate open route. */
  | 'NONE'
  /** The policy needs a facility a person has not picked yet. */
  | 'NEEDS_CHOICE'
  /** `DRIVER_RESIDENCE`, and no driver is assigned to this trip yet. */
  | 'NEEDS_DRIVER'
  /** The policy points at something this tenant has not configured. */
  | 'UNAVAILABLE';

export interface EndStopTarget {
  state: EndStopTargetState;
  facilityId: string | null;
  /** Plain language, shown to the dispatcher. Null when nothing is wrong. */
  reason: string | null;
}

export interface EndStopTargetContext {
  /**
   * The facility of the first stop typed `pickup`, or — when nothing is typed —
   * the first resolved stop.
   *
   * The fallback is deliberate and is the honest reading of "the pickup
   * facility" for this module's commonest document: a consignee manifest types
   * nothing (`stopType` is nullish until a person sets it, Phase 5), and its
   * first stop is where the freight was collected. Falling back to *nothing*
   * would make `RETURN_TO_ORIGIN` unusable on exactly the document the feature
   * was designed around.
   */
  firstPickupFacilityId: string | null;
  /** `Tenant."homeBaseFacilityId"`. Null until an owner configures one. */
  homeBaseFacilityId: string | null;
  /** The parking facility a person chose for THIS trip, from the stored key. */
  designatedParkingFacilityId: string | null;
  /**
   * The assigned driver's residence facility, or null.
   *
   * Resolved by the caller through `residenceFacilityForDriver`, which applies
   * the visibility rules. Passing the id in rather than looking it up here keeps
   * the privacy filter in one server-side place instead of two.
   */
  driverResidenceFacilityId: string | null;
  /** Whether a driver is assigned yet. Null before Phase 8's assignment screen. */
  assignedDriverId: string | null;
}

/**
 * Where the day closes, for one policy.
 *
 * Every unresolved case returns a state and a sentence rather than throwing or
 * quietly degrading to `NONE`. A trip that silently loses its end stop is the
 * failure this feature exists to prevent — the untracked miles in Section 9's
 * left-hand diagram — so "we could not work out where" has to be visible.
 */
export function endStopTargetFor(
  policy: EndStopPolicy,
  context: EndStopTargetContext,
): EndStopTarget {
  switch (policy) {
    case 'NONE':
      return { state: 'NONE', facilityId: null, reason: null };

    case 'RETURN_TO_ORIGIN':
      if (context.firstPickupFacilityId) {
        return { state: 'RESOLVED', facilityId: context.firstPickupFacilityId, reason: null };
      }
      return {
        state: 'UNAVAILABLE',
        facilityId: null,
        reason: 'No first stop has a facility yet, so there is nothing to return to.',
      };

    case 'HOME_BASE':
      if (context.homeBaseFacilityId) {
        return { state: 'RESOLVED', facilityId: context.homeBaseFacilityId, reason: null };
      }
      return {
        state: 'UNAVAILABLE',
        facilityId: null,
        reason: 'This company has no home base set. Add one in Settings, or pick a different end stop.',
      };

    case 'DESIGNATED_PARKING':
      if (context.designatedParkingFacilityId) {
        return { state: 'RESOLVED', facilityId: context.designatedParkingFacilityId, reason: null };
      }
      // NEEDS_CHOICE, never UNAVAILABLE: designated parking is "per template or
      // trip" (Section 9) and the answer is a tap away, not a settings change.
      return {
        state: 'NEEDS_CHOICE',
        facilityId: null,
        reason: 'Pick where this truck parks at the end of the day.',
      };

    case 'DRIVER_RESIDENCE':
      if (!context.assignedDriverId) {
        return {
          state: 'NEEDS_DRIVER',
          facilityId: null,
          reason: 'The driver’s home is set once a driver is assigned to this trip.',
        };
      }
      if (context.driverResidenceFacilityId) {
        return { state: 'RESOLVED', facilityId: context.driverResidenceFacilityId, reason: null };
      }
      return {
        state: 'UNAVAILABLE',
        facilityId: null,
        reason: 'This driver has no home address on file. Add one on the driver, or pick a different end stop.',
      };
  }
}

// ---------------------------------------------------------------------------
// Layer 3 — the row Phase 8 writes
// ---------------------------------------------------------------------------

/**
 * The `CarrierStop` an end stop becomes, as data.
 *
 * Returned rather than written because Phase 8 owns the commit transaction and
 * this phase must not open a second write path into `stops` — the audit's B9
 * finding is that the module already has one too many. Phase 8 spreads this into
 * its `carrierStop.create`.
 *
 * `sequenceOrder` is `lastSequenceOrder + 1` and nothing else. `stops` carries
 * `@@unique([dispatchId, sequenceOrder])`, so "pinned last" is enforced by the
 * database once the row exists rather than by whoever renders the list.
 */
export interface EndStopStopDraft {
  facilityId: string;
  sequenceOrder: number;
  stopType: typeof END_STOP_STOP_TYPE;
  isEndStop: true;
  /**
   * No paperwork at an end stop. Both columns are camelCase on `stops`
   * (`"bolRequired"` / `"podRequired"`, verified — `bol_required` does not
   * exist), which is why they are named this way here rather than in the
   * snake_case of their neighbours.
   */
  bolRequired: false;
  podRequired: false;
}

export function endStopStopDraft(facilityId: string, lastSequenceOrder: number): EndStopStopDraft {
  return {
    facilityId,
    sequenceOrder: lastSequenceOrder + 1,
    stopType: END_STOP_STOP_TYPE,
    isEndStop: true,
    bolRequired: false,
    podRequired: false,
  };
}

/**
 * Whether this policy produces a trackable arrival at all.
 *
 * The point of the end stop, per Section 9, is that the return leg is tracked
 * and the working day closes for mileage and pay. `NONE` is the one policy that
 * deliberately gives that up, and callers computing planned miles or a pay
 * window need to be able to ask without re-deriving the ladder.
 */
export function endStopIsTracked(policy: EndStopPolicy): boolean {
  return policy !== 'NONE';
}
