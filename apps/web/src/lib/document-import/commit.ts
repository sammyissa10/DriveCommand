/**
 * Pre-commit validation, appointment-window arithmetic, and the shapes the
 * commit transaction writes.
 *
 * Spec: docs/specs/DocumentImport_TechnicalSpec_v1.md Section 11.
 *
 * PURE. No database, no clock beyond what the caller hands in, no storage. The
 * writing half is `commit-service.ts`, and the split is the same one Phases 5-7
 * used (`stop-review.ts` / `stop-review-service.ts`, `end-stop.ts` /
 * `end-stop-service.ts`): the rules are testable without a database, and the
 * transaction has exactly one place it can be read.
 *
 * ---------------------------------------------------------------------------
 * THE SEVERITY TABLE IS SECTION 11'S, VERBATIM.
 * ---------------------------------------------------------------------------
 *
 *   BLOCK  overlapping assignment · expired licence / medical · truck out of
 *          service (and, from the Phase 8 prompt, overdue inspection)
 *   WARN   insufficient hours · over capacity · unreachable window ·
 *          unusual geography
 *
 * A block disables the primary action and NAMES ITS REASON. Warnings are one
 * dismissible summary — never a modal, per Section 10's rule for the same
 * screen family.
 *
 * `validateCommit` is called from the commit endpoint as well as the screen.
 * That is the whole point: a direct API call with a blocked driver must still
 * be blocked, so the UI's disabled button is a courtesy and this function is
 * the control.
 */

import type { CanonicalConsignment } from '@drivecommand/validation';
import { formatDateOnlyShort, isExpiredDateOnly } from '@/lib/utils/date';
import type { EndStopPolicy } from './end-stop-constants';
import type { StopIssue, StopReviewRow } from './stop-review';

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

export type CommitBlockCode =
  | 'DRIVER_OVERLAP'
  | 'TRUCK_OVERLAP'
  | 'LICENCE_EXPIRED'
  | 'MEDICAL_EXPIRED'
  | 'TRUCK_OUT_OF_SERVICE'
  | 'TRUCK_INSPECTION_OVERDUE'
  | 'NO_DRIVER'
  | 'NO_TRUCK'
  | 'NO_START_TIME'
  | 'STOPS_NOT_READY';

export type CommitWarnCode =
  | 'INSUFFICIENT_HOURS'
  | 'OVER_CAPACITY'
  | 'UNREACHABLE_WINDOW'
  | 'UNUSUAL_GEOGRAPHY'
  | 'NO_HOS_DATA'
  | 'END_STOP_UNRESOLVED'
  | 'STOPS_WARNING';

export type CommitIssueCode = CommitBlockCode | CommitWarnCode;

export interface CommitIssue {
  code: CommitIssueCode;
  severity: 'BLOCK' | 'WARN';
  /**
   * One plain sentence, already counted and already naming the thing.
   * "Marcus Webb's CDL expired on 12 Aug 2026", not "compliance failure".
   *
   * Composed here rather than in the two front-ends for the reason quick-517
   * recorded for `template-copy.ts`: a sentence assembled from fragments in JSX
   * is a sentence with whitespace bugs, and there are two surfaces to get wrong.
   */
  message: string;
}

export interface CommitValidation {
  blocks: CommitIssue[];
  warnings: CommitIssue[];
  canCommit: boolean;
  /**
   * The sentence printed beside the disabled action. The FIRST block, because
   * Section 10 draws one line under the button and Section 11 inherits it.
   */
  blockedReason: string | null;
}

// ---------------------------------------------------------------------------
// What the validator is given
// ---------------------------------------------------------------------------

/** One trip already on the books that could clash. Dates are real Dates. */
export interface ExistingAssignment {
  tripId: string;
  scheduledDeparture: Date;
  /** Null when the trip has no planned arrival — treated as a full day. */
  scheduledArrival: Date | null;
  status: string;
}

export interface DriverFacts {
  id: string;
  name: string;
  /** `CarrierDriver.cdl_expiry`. Null when the tenant never recorded one. */
  cdlExpiry: Date | null;
  /**
   * Expiry of the driver's medical card, read from the legacy `Document` row
   * (`description = 'MEDICAL_CARD'`) keyed to the linked User. There is no
   * medical column on `carrier_drivers` — checked against the live schema, not
   * assumed from the presence of `cdl_expiry` beside it.
   */
  medicalExpiry: Date | null;
  /**
   * `User.is_dispatch_ready`, the Phase 45 gate. This is what "when enforcement
   * is on" means in this repo, and it is reused rather than duplicated — a
   * second enforcement flag would be a second thing to keep in step.
   *
   * Null when the driver has no linked User at all, in which case there is no
   * enforcement to apply and licence/medical still block on their own dates.
   */
  isDispatchReady: boolean | null;
  overlapping: ExistingAssignment[];
  /** Minutes of driving time left in the cycle, or null when nothing is logged. */
  hoursRemainingMin: number | null;
}

export interface TruckFacts {
  id: string;
  unitNumber: string;
  /** `carrier_trucks.status` — active | maintenance | out_of_service | inactive. */
  status: string;
  registrationExpiry: Date | null;
  insuranceExpiry: Date | null;
  payloadCapacityLbs: number | null;
  overlapping: ExistingAssignment[];
}

/** A resolved stop's facility geometry, for the two geography-ish warnings. */
export interface StopGeoFacts {
  facilityId: string;
  state: string | null;
  hasCoordinates: boolean;
}

export interface CommitValidationInput {
  driver: DriverFacts | null;
  truck: TruckFacts | null;
  scheduledDeparture: Date | null;
  /** Every stop the trip will actually contain — skipped rows already removed. */
  stops: StopReviewRow[];
  /** Stop-review's own verdict, carried through rather than recomputed. */
  stopBlocks: StopIssue[];
  stopWarnings: StopIssue[];
  geo: StopGeoFacts[];
  endStopPolicy: EndStopPolicy;
  /** True when the policy resolves to a real facility. False is a warning. */
  endStopResolved: boolean;
  /** `now`, injected so the rules are testable without freezing a global. */
  now: Date;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

/**
 * Every date this formats is a `@db.Date` column — `cdl_expiry`, the medical
 * card's `expiry_date`, `registration_expiry`, `insurance_expiry`. It used to
 * be `d.toLocaleDateString(...)`, which renders a UTC midnight as the PREVIOUS
 * day in any negative offset, and this is the message a dispatcher reads under
 * a disabled Commit button: a CDL stored as 2026-01-14 was reported as
 * "expired on Jan 13, 2026". quick-541 routed it through the shared helper.
 *
 * `fmtTime` below is deliberately untouched — it formats `scheduledDeparture`,
 * a real timestamptz, and local rendering is correct there.
 *
 * Accepts null because `isExpiredDateOnly` is a predicate over the value rather
 * than a `x && x.getTime() < …` guard, so it no longer narrows the field for
 * the message that follows. Null is unreachable at every call site (a null
 * expiry is never expired) and renders as an em dash if that ever changes.
 */
function fmtDate(d: Date | null): string {
  return formatDateOnlyShort(d);
}

function fmtTime(d: Date): string {
  return d.toLocaleString('en-US', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Does an existing assignment overlap the planned day?
 *
 * The trip being committed has a start and NO end — its arrival is not known
 * until it runs. So "overlap" is read as: the existing trip is still open at,
 * or begins on, the planned start day. A trip with no scheduled arrival is
 * treated as occupying its whole day rather than as an instant, because the
 * alternative — treating a null arrival as "already finished" — would let a
 * driver be double-booked by whichever of the two trips forgot to fill the
 * field in. Erring toward blocking is right here: the dispatcher can see the
 * clash named and clear it, whereas a driver in two places is found at 5am.
 */
function overlapsPlannedDay(existing: ExistingAssignment, plannedStart: Date): boolean {
  const dayStart = new Date(plannedStart);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);

  const from = existing.scheduledDeparture.getTime();
  const to = existing.scheduledArrival
    ? existing.scheduledArrival.getTime()
    : // Null arrival: the whole of its own departure day.
      new Date(existing.scheduledDeparture).setHours(23, 59, 59, 999);

  return from < dayEnd.getTime() && to >= dayStart.getTime();
}

// ---------------------------------------------------------------------------
// Weight, for the capacity warning
// ---------------------------------------------------------------------------

/**
 * Total weight the trip will carry, in pounds, or null when no stop states one.
 *
 * Null rather than 0, for `stop-review.ts`'s stated reason: a manifest that
 * prints no weight has an UNKNOWN weight, and warning about "0 lbs over
 * capacity" would be a claim about the freight rather than an absence of one.
 */
export function totalWeightLbs(stops: StopReviewRow[]): number | null {
  let total = 0;
  let seen = false;
  for (const stop of stops) {
    const value = stop.rollups.weight.value;
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    seen = true;
    // The rollup carries whatever uom the document printed. `weightUom` is
    // normalised to LBS|KG upstream; KG is converted rather than added raw,
    // because 1,200 kg silently counted as 1,200 lb is a capacity check that
    // passes when it should not.
    total += stop.rollups.weightUom === 'KG' ? value * 2.20462 : value;
  }
  return seen ? Math.round(total) : null;
}

// ---------------------------------------------------------------------------
// The validator
// ---------------------------------------------------------------------------

const block = (code: CommitBlockCode, message: string): CommitIssue => ({
  code,
  severity: 'BLOCK',
  message,
});
const warn = (code: CommitWarnCode, message: string): CommitIssue => ({
  code,
  severity: 'WARN',
  message,
});

/**
 * Section 11's gate, in one function, used by both the screen and the endpoint.
 *
 * ORDER MATTERS ONLY FOR `blockedReason`, which is `blocks[0]`. The list is
 * therefore assembled most-actionable-first: the missing-input blocks come
 * before the compliance ones, because "pick a driver" is a more useful sentence
 * under a disabled button than "no driver's licence has expired".
 */
export function validateCommit(input: CommitValidationInput): CommitValidation {
  const blocks: CommitIssue[] = [];
  const warnings: CommitIssue[] = [];

  const { driver, truck, scheduledDeparture, now } = input;

  // --- the three inputs the screen collects --------------------------------
  if (!driver) blocks.push(block('NO_DRIVER', 'Pick a driver for this trip'));
  if (!truck) blocks.push(block('NO_TRUCK', 'Pick a truck for this trip'));
  if (!scheduledDeparture) {
    blocks.push(block('NO_START_TIME', 'Set a planned start time'));
  }

  // --- stop review's own blocks, carried not recomputed ---------------------
  //
  // A commit cannot be more permissive than the review screen that fed it. The
  // blocks are re-emitted under this module's codes so one consumer renders one
  // list, but the SENTENCES are stop-review's, already counted, so the two
  // screens never disagree about how many stops need a facility.
  for (const issue of input.stopBlocks) {
    blocks.push(block('STOPS_NOT_READY', issue.message));
  }

  // --- BLOCK: overlapping assignment ---------------------------------------
  if (driver && scheduledDeparture) {
    const clash = driver.overlapping.find((a) => overlapsPlannedDay(a, scheduledDeparture));
    if (clash) {
      blocks.push(
        block(
          'DRIVER_OVERLAP',
          `${driver.name} is already on a trip that day (departs ${fmtTime(clash.scheduledDeparture)})`,
        ),
      );
    }
  }

  if (truck && scheduledDeparture) {
    const clash = truck.overlapping.find((a) => overlapsPlannedDay(a, scheduledDeparture));
    if (clash) {
      blocks.push(
        block(
          'TRUCK_OVERLAP',
          `Truck ${truck.unitNumber} is already on a trip that day (departs ${fmtTime(clash.scheduledDeparture)})`,
        ),
      );
    }
  }

  // --- BLOCK: expired licence / medical ------------------------------------
  //
  // Measured against the PLANNED START, not against `now`. A licence that
  // expires tomorrow is valid today and invalid for a trip scheduled next week,
  // and checking the wrong one of those is how a compliant driver gets refused
  // or a lapsed one gets dispatched.
  // …and compared as CALENDAR DATES, not as instants. Each of these columns is
  // a `@db.Date`, which Prisma materialises at UTC midnight; `expiry.getTime()
  // < asOf.getTime()` therefore reported a document as expired for the whole of
  // the day it was still valid, because midnight precedes every departure time
  // on that date. A licence that expires on the 14th is good ON the 14th, so
  // "expired" has to mean the calendar date has passed — which is exactly what
  // `isExpiredDateOnly` asks (quick-541).
  const asOf = scheduledDeparture ?? now;

  if (driver) {
    if (isExpiredDateOnly(driver.cdlExpiry, asOf)) {
      blocks.push(
        block('LICENCE_EXPIRED', `${driver.name}'s CDL expired on ${fmtDate(driver.cdlExpiry)}`),
      );
    }

    // "when enforcement is on" — the Phase 45 gate, reused. A driver with no
    // linked User has no readiness record and is not held to it; their licence
    // and medical dates still block above and below on their own merits.
    const enforcementOn = driver.isDispatchReady === false;

    if (isExpiredDateOnly(driver.medicalExpiry, asOf) && enforcementOn) {
      blocks.push(
        block(
          'MEDICAL_EXPIRED',
          `${driver.name}'s medical certificate expired on ${fmtDate(driver.medicalExpiry)}`,
        ),
      );
    }
  }

  // --- BLOCK: truck out of service or overdue inspection -------------------
  if (truck) {
    if (truck.status === 'out_of_service') {
      blocks.push(block('TRUCK_OUT_OF_SERVICE', `Truck ${truck.unitNumber} is out of service`));
    } else if (truck.status === 'maintenance') {
      blocks.push(block('TRUCK_OUT_OF_SERVICE', `Truck ${truck.unitNumber} is in the shop`));
    } else if (truck.status === 'inactive') {
      blocks.push(block('TRUCK_OUT_OF_SERVICE', `Truck ${truck.unitNumber} is inactive`));
    }

    // "Overdue inspection" has no dedicated column on `carrier_trucks` —
    // checked against the live schema. Annual inspection is carried by the
    // registration and insurance expiries, which are the dates that actually
    // put a truck out of service at a roadside stop, so those are what this
    // reads. Stated rather than silently mapped: if a real
    // `next_inspection_due` column is added later, this is the one place to
    // change.
    if (isExpiredDateOnly(truck.registrationExpiry, asOf)) {
      blocks.push(
        block(
          'TRUCK_INSPECTION_OVERDUE',
          `Truck ${truck.unitNumber}'s registration expired on ${fmtDate(truck.registrationExpiry)}`,
        ),
      );
    }
    if (isExpiredDateOnly(truck.insuranceExpiry, asOf)) {
      blocks.push(
        block(
          'TRUCK_INSPECTION_OVERDUE',
          `Truck ${truck.unitNumber}'s insurance expired on ${fmtDate(truck.insuranceExpiry)}`,
        ),
      );
    }
  }

  // --- WARN: everything else ------------------------------------------------

  for (const issue of input.stopWarnings) {
    warnings.push(warn('STOPS_WARNING', issue.message));
  }

  // Insufficient hours. `null` is not zero — a carrier driver with no HOS log
  // is the common case in this schema (there is no carrier-side HOS table;
  // `driver-status.ts` says so), and warning "0 hours remaining" would be a
  // claim about their day rather than an absence of one.
  if (driver) {
    if (driver.hoursRemainingMin === null) {
      warnings.push(
        warn('NO_HOS_DATA', `No hours-of-service log for ${driver.name} — hours not checked`),
      );
    } else if (driver.hoursRemainingMin < 60) {
      const h = Math.floor(driver.hoursRemainingMin / 60);
      const m = driver.hoursRemainingMin % 60;
      warnings.push(
        warn(
          'INSUFFICIENT_HOURS',
          `${driver.name} has ${h > 0 ? `${h}h ` : ''}${m}m of driving time left`,
        ),
      );
    }
  }

  // Over capacity.
  const weight = totalWeightLbs(input.stops);
  if (truck && weight !== null && truck.payloadCapacityLbs && weight > truck.payloadCapacityLbs) {
    const over = weight - truck.payloadCapacityLbs;
    warnings.push(
      warn(
        'OVER_CAPACITY',
        `This trip carries ${weight.toLocaleString('en-US')} lbs — ${over.toLocaleString('en-US')} lbs over truck ${truck.unitNumber}'s capacity`,
      ),
    );
  }

  // Unreachable window: a FIRM appointment that closes before the trip starts.
  // Only firm windows, because a soft window is a preference and warning about
  // every one of them is the noise Section 9 says erodes trust.
  if (scheduledDeparture) {
    const unreachable = input.stops.filter((s) => {
      if (!s.appointment?.isFirm) return false;
      const latest = s.appointment.latest ? new Date(s.appointment.latest) : null;
      return (
        latest != null &&
        !Number.isNaN(latest.getTime()) &&
        latest.getTime() < scheduledDeparture.getTime()
      );
    });
    if (unreachable.length > 0) {
      warnings.push(
        warn(
          'UNREACHABLE_WINDOW',
          unreachable.length === 1
            ? `${unreachable[0].name}'s appointment window closes before this trip starts`
            : `${unreachable.length} stops have appointment windows that close before this trip starts`,
        ),
      );
    }
  }

  // Unusual geography. Counted over DISTINCT states across resolved facilities,
  // which is the only geographic fact available without coordinates — and
  // import-created facilities have none (quick-523, still open at Phase 8).
  const states = new Set(
    input.geo.map((g) => g.state?.trim().toUpperCase()).filter((s): s is string => Boolean(s)),
  );
  if (states.size > 3) {
    warnings.push(warn('UNUSUAL_GEOGRAPHY', `This trip crosses ${states.size} states in one run`));
  }

  if (!input.endStopResolved && input.endStopPolicy !== 'NONE') {
    warnings.push(
      warn(
        'END_STOP_UNRESOLVED',
        'The end stop could not be resolved — this trip will finish at its last delivery',
      ),
    );
  }

  return {
    blocks,
    warnings,
    canCommit: blocks.length === 0,
    blockedReason: blocks[0]?.message ?? null,
  };
}

// ---------------------------------------------------------------------------
// Appointment windows — the quick-515 deferral, landing here
// ---------------------------------------------------------------------------

export interface MaterialisedWindow {
  start: Date | null;
  end: Date | null;
  isFirm: boolean;
}

/**
 * The appointment window a committed stop actually carries.
 *
 * quick-515 deliberately deferred this to Phase 8 and said why: a template's
 * offsets anchor to the TRIP'S start time, which does not exist while an import
 * is being reviewed, so materialising a window at template-application time
 * would put an appointment on a stop that nobody agreed to.
 *
 * Precedence, and the reason for it:
 *
 *   1. A PRINTED window wins. It is a fact off the document; a template's
 *      offsets are a standing expectation. When the two disagree the document
 *      is what the consignee actually said this time.
 *   2. Otherwise the template's offsets, resolved against `scheduledDeparture`.
 *   3. Otherwise no window at all — NOT a window of zero length.
 *
 * The arithmetic is `departure + offsetMin * 60000`, character for character
 * what `trips.ts` has always done in its three template-inheritance paths. It
 * is repeated here rather than imported because `trips.ts` computes it inline
 * from a `RouteTemplateStop` row and this computes it from a consignment; what
 * matters is that the two produce identical instants for identical inputs.
 */
export function materialiseWindow(
  consignment: CanonicalConsignment,
  scheduledDeparture: Date,
): MaterialisedWindow {
  const printedStart = parseInstant(consignment.appointment?.earliest);
  const printedEnd = parseInstant(consignment.appointment?.latest);

  if (printedStart || printedEnd) {
    return {
      start: printedStart,
      end: printedEnd,
      isFirm: consignment.appointment?.isFirm === true,
    };
  }

  const startOffset = consignment.templateApptOffsetStartMin;
  const endOffset = consignment.templateApptOffsetEndMin;

  if (typeof startOffset !== 'number' && typeof endOffset !== 'number') {
    return { start: null, end: null, isFirm: false };
  }

  return {
    start:
      typeof startOffset === 'number'
        ? new Date(scheduledDeparture.getTime() + startOffset * 60000)
        : null,
    end:
      typeof endOffset === 'number'
        ? new Date(scheduledDeparture.getTime() + endOffset * 60000)
        : null,
    // A window derived from a template's standing offsets is a plan, not a
    // commitment the consignee made. Marking it firm would hand Phase 7's
    // optimiser a hard constraint nobody agreed to.
    isFirm: false,
  };
}

function parseInstant(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------------------
// Which stops actually commit
// ---------------------------------------------------------------------------

/**
 * The stops that become rows, in running order.
 *
 * `skipped` rows are dropped — Phase 6's rule, and the same one quick-517
 * applied to the scorer: a stop the template has and today's document does not
 * is *visible as missing* on the review screen and is not on today's run. It is
 * not freight and must not become a `stops` row.
 *
 * Array order IS the running order (Phase 5). No sort happens here, and none
 * may be added: `sequenceOrder` is the array position, which is what the
 * dispatcher dragged.
 */
export function committableStops(stops: StopReviewRow[]): StopReviewRow[] {
  return stops.filter((s) => !s.skipped);
}

/**
 * `stops.stop_type` for a committed consignment.
 *
 * `stops_stop_type_check` admits exactly pickup|delivery|fuel_stop|layover|
 * relay_handoff — read from `pg_constraint` against production, not inferred
 * from the enum beside it (DEC-14, and the `route_template_stops` variant that
 * admits only four of the five).
 *
 * An unset type commits as `delivery`. The review screen refuses to DEFAULT it
 * (`stopType` is nullish there precisely so an unset type is asked about rather
 * than assumed), but the column is NOT NULL and a commit has to write
 * something. Delivery is the right fallback for a consignment on a manifest,
 * and the review screen's NO_STOP_TYPE warning is what surfaces it beforehand.
 */
export const COMMITTABLE_STOP_TYPES = [
  'pickup',
  'delivery',
  'fuel_stop',
  'layover',
  'relay_handoff',
] as const;

export function stopTypeForCommit(stopType: string | null | undefined): string {
  if (!stopType) return 'delivery';
  const lowered = stopType.toLowerCase();
  return (COMMITTABLE_STOP_TYPES as readonly string[]).includes(lowered) ? lowered : 'delivery';
}
