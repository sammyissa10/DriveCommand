/**
 * Phase 11 — the live board's and the report's derivations. Pure functions, no
 * I/O, no Prisma. Everything here is arithmetic over rows the lookup fetched.
 *
 * ─── THE DEFINITION THIS FILE EXISTS FOR ───────────────────────────────────
 *
 * "Behind schedule" is invented here. Nothing in the schema records it and
 * nothing in the spec defines it, so it is written down in DECISIONS.md (DEC-18)
 * as well as implemented here, because it will eventually be quoted at a
 * customer.
 *
 *   A trip is BEHIND SCHEDULE when it is `in_progress` and at least one of its
 *   non-terminal stops has missed its appointment window.
 *
 * The load-bearing part is what "missed its window" means, and it is
 * deliberately the SAME two columns the performance report already scores on
 * (`arrived_at`, `appointment_end`). `getPerformanceReport` computes
 *
 *     count(arrived_at <= appointment_end AND appointment_end IS NOT NULL)
 *   / NULLIF(count(appointment_end IS NOT NULL), 0)
 *
 * so a stop is on time there exactly when it arrived inside its window, and the
 * denominator is NULL — not zero, not 100% — when no window exists. The board
 * uses the same two columns with the same meaning, which is why the board and
 * the report cannot disagree about which trips were late. Any other definition
 * (a GPS-derived ETA, a "should have left by now" heuristic) would be a second
 * mechanism, and two mechanisms for one word is how a dispatcher ends up
 * arguing with a report.
 *
 * ─── ONE REFINEMENT ON THE APPROVED WORDING ────────────────────────────────
 *
 * The ruling read "any non-terminal stop has appointment_end < now()". Taken
 * literally that marks a stop the driver ARRIVED AT INSIDE ITS WINDOW as late,
 * as soon as the window closes — while the driver is standing on the dock, and
 * while the performance report is counting that very stop as on time. That is
 * the disagreement the ruling exists to prevent, so `windowOutcome` also
 * requires that the window was actually missed.
 *
 * The case it excludes is real and has its own name: a driver who arrived on
 * time and is still there is in DETENTION, which the performance report already
 * measures separately as `avg_dwell_minutes`. Folding detention into lateness
 * would be one signal standing for two facts — the quick-550 defect class.
 */

import {
  ATTENTION_RANK,
  BOARD_EXCLUDED_TRIP_STATUSES,
  NON_TERMINAL_STOP_STATUSES,
  TERMINAL_TRIP_STATUSES,
  type TripAttention,
} from './board-constants';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** A stop, reduced to the four fields any of this reasons about. */
export interface BoardStop {
  id: string;
  sequenceOrder: number;
  /** `pending | arrived | completed | skipped` — see NON_TERMINAL_STOP_STATUSES. */
  status: string;
  appointmentEnd: Date | null;
  arrivedAt: Date | null;
}

/** Where one stop's appointment window ended up. Total over BoardStop × now. */
export type WindowOutcome =
  /** No `appointment_end`. Unmeasurable, and on this database the common case. */
  | 'NO_WINDOW'
  /** Arrived inside the window. The performance report's numerator. */
  | 'MET'
  /** Arrived after the window, or the window closed with nobody there. */
  | 'MISSED'
  /** No arrival yet, but the window is still open. Could still be met. */
  | 'PENDING';

export type OnTimeState = 'ON_TRACK' | 'BEHIND_SCHEDULE' | 'NO_WINDOWS' | 'NOT_APPLICABLE';

/**
 * Re-exported so consumers take the attention vocabulary from the module that
 * reasons about it, rather than reaching past it into the constants file. One
 * import path per concept.
 */
export type { TripAttention };

export type InspectionBadgeState =
  | 'PASSED'
  | 'PASSED_WITH_DEFECTS'
  | 'FAILED'
  | 'OVERRIDDEN'
  | 'IN_PROGRESS'
  | 'NOT_STARTED'
  | 'NOT_REQUIRED';

// ---------------------------------------------------------------------------
// Stop-level
// ---------------------------------------------------------------------------

export function isTerminalStop(status: string): boolean {
  return !(NON_TERMINAL_STOP_STATUSES as readonly string[]).includes(status);
}

export function isTerminalTrip(status: string): boolean {
  return (TERMINAL_TRIP_STATUSES as readonly string[]).includes(status);
}

export function isBoardExcludedTrip(status: string): boolean {
  return (BOARD_EXCLUDED_TRIP_STATUSES as readonly string[]).includes(status);
}

/**
 * Total classification of one stop's window.
 *
 * Order matters: no window short-circuits everything, then a recorded arrival
 * decides MET vs MISSED on its own (the window's closing time is irrelevant
 * once somebody is there), and only a stop with NO arrival is judged against
 * the clock.
 */
export function windowOutcome(stop: BoardStop, now: Date): WindowOutcome {
  if (!stop.appointmentEnd) return 'NO_WINDOW';
  if (stop.arrivedAt) {
    return stop.arrivedAt.getTime() <= stop.appointmentEnd.getTime() ? 'MET' : 'MISSED';
  }
  return stop.appointmentEnd.getTime() < now.getTime() ? 'MISSED' : 'PENDING';
}

/** Does this trip carry any measurable window at all? */
export function hasAnyWindow(stops: BoardStop[]): boolean {
  return stops.some((s) => s.appointmentEnd !== null);
}

/**
 * The stops that put a trip behind schedule, in running order.
 *
 * NON-TERMINAL only, per the ruling: a completed or skipped stop is history and
 * belongs to the performance report, not to "what needs me now". Returned as a
 * list rather than a boolean so the row can name the first one — "behind
 * schedule" with no indication of WHERE is a colour with no information.
 */
export function missedStops<T extends BoardStop>(stops: T[], now: Date): T[] {
  return stops
    .filter((s) => !isTerminalStop(s.status) && windowOutcome(s, now) === 'MISSED')
    .sort((a, b) => a.sequenceOrder - b.sequenceOrder);
}

/**
 * Every stop whose window was missed, terminal ones included.
 *
 * Feeds the report's on-time COLUMN and its exception count, which are facts
 * about the whole trip, not about what is outstanding. Kept separate from
 * `missedStops` on purpose — they answer different questions, and collapsing
 * them would make a finished trip that ran late look like it still needs
 * action.
 */
export function allMissedStops<T extends BoardStop>(stops: T[], now: Date): T[] {
  return stops
    .filter((s) => windowOutcome(s, now) === 'MISSED')
    .sort((a, b) => a.sequenceOrder - b.sequenceOrder);
}

// ---------------------------------------------------------------------------
// Trip-level
// ---------------------------------------------------------------------------

/**
 * The on-time column.
 *
 * NO_WINDOWS outranks everything except NOT_APPLICABLE, which is the whole
 * point: a trip nobody set windows on can be neither on track nor late, and
 * must not be painted green. See ON_TIME_COPY for the sentence and why.
 */
export function deriveOnTime(tripStatus: string, stops: BoardStop[], now: Date): OnTimeState {
  if (isBoardExcludedTrip(tripStatus)) return 'NOT_APPLICABLE';
  if (!hasAnyWindow(stops)) return 'NO_WINDOWS';
  return allMissedStops(stops, now).length > 0 ? 'BEHIND_SCHEDULE' : 'ON_TRACK';
}

/**
 * Is this trip behind schedule in the ruling's sense — running, and already
 * late? This is the ATTENTION signal, and it is narrower than the column above:
 * it is scoped to `in_progress` and to stops that are still outstanding.
 *
 * The two can differ on a finished trip, and that is correct rather than a
 * drift: a completed trip that missed a window reads "Behind schedule" in the
 * on-time column (it did run late) and ranks COMPLETED in the sort (there is
 * nothing left to do about it). One column answers "did this run to time", the
 * other "does this need me now".
 */
export function isBehindSchedule(tripStatus: string, stops: BoardStop[], now: Date): boolean {
  return tripStatus === 'in_progress' && missedStops(stops, now).length > 0;
}

export interface TripAttentionInput {
  tripStatus: string;
  inspection: InspectionBadgeState;
  stops: BoardStop[];
  now: Date;
}

/**
 * The five-state sort, plus CLOSED.
 *
 * Evaluation order is the whole function and none of it is cosmetic:
 *
 *  1. CLOSED first. A cancelled trip whose inspection failed is not a safety
 *     problem needing a dispatcher — it is a trip that is not happening. Test
 *     the inspection first and every cancelled run with a stale failed
 *     walkaround pins itself to the top of the report forever.
 *  2. FAILED_INSPECTION above NOT_STARTED. A blocked trip IS not started; the
 *     inspection is the more specific and more urgent fact, and the reason the
 *     driver is standing still.
 *  3. COMPLETED before the running states, so a finished trip cannot be
 *     re-classified by a window it missed hours ago.
 *  4. NOT_STARTED, then the two running states.
 */
export function deriveTripAttention({
  tripStatus,
  inspection,
  stops,
  now,
}: TripAttentionInput): TripAttention {
  if (isBoardExcludedTrip(tripStatus)) return 'CLOSED';
  if (inspection === 'FAILED') return 'FAILED_INSPECTION';
  if (tripStatus === 'completed') return 'COMPLETED';
  if (tripStatus === 'planned') return 'NOT_STARTED';
  if (isBehindSchedule(tripStatus, stops, now)) return 'BEHIND_SCHEDULE';
  return 'ON_TRACK';
}

export function attentionRank(attention: TripAttention): number {
  return ATTENTION_RANK[attention];
}

// ---------------------------------------------------------------------------
// Progress and the next stop
// ---------------------------------------------------------------------------

export interface StopProgress {
  completed: number;
  total: number;
}

/**
 * "Stops completed over total".
 *
 * A SKIPPED stop counts as done. It is not outstanding, the driver is not going
 * back for it, and the existing trip-completion check (`trips.ts`) already
 * treats `completed | skipped` as the finished set. Counting only `completed`
 * would leave a finished trip reading 7/9 forever.
 */
export function stopProgress(stops: BoardStop[]): StopProgress {
  return {
    completed: stops.filter((s) => isTerminalStop(s.status)).length,
    total: stops.length,
  };
}

/**
 * The stop the driver is at, or heading for: the lowest-sequence non-terminal
 * stop. `arrived` outranks `pending` at the same sequence by construction,
 * since a driver cannot have arrived at a later stop than the one they are
 * still travelling to.
 */
export function currentOrNextStop<T extends BoardStop>(stops: T[]): T | null {
  const outstanding = stops
    .filter((s) => !isTerminalStop(s.status))
    .sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  return outstanding[0] ?? null;
}

/**
 * Minutes until the next stop's window closes. Negative means it already has.
 *
 * Deliberately NOT a travel-time ETA. The trip has no departure time until it
 * starts, there is no live routing call on this page, and a number derived from
 * a straight-line guess would look like a promise. This is the one time fact
 * the database actually holds, and `null` where it holds none — the same
 * restraint the optimisation suggestion takes about inventing a departure time.
 */
export function minutesToWindowClose(stop: BoardStop | null, now: Date): number | null {
  if (!stop?.appointmentEnd) return null;
  return Math.round((stop.appointmentEnd.getTime() - now.getTime()) / 60_000);
}

// ---------------------------------------------------------------------------
// Exceptions
// ---------------------------------------------------------------------------

export interface ExceptionInput {
  stops: BoardStop[];
  /** Failed inspection items on this trip's walkaround, critical or not. */
  inspectionFailureCount: number;
  now: Date;
}

/**
 * The report's exception count: things that went wrong on this trip, counted
 * from rows rather than from a `hasException` flag.
 *
 * There is no exception column anywhere in the carrier schema — the existing
 * `ExceptionFlag` component is fed by `(vehicle.dispatch as any).hasException`,
 * which no query in this repo ever sets. Rather than render a flag that is
 * always false, this counts three things that are really recorded:
 *
 *   · stops whose appointment window was missed
 *   · stops that were skipped (`stops_skip_reason_check` guarantees a reason)
 *   · failed inspection items
 *
 * A missed window on a skipped stop counts once, not twice.
 */
export function exceptionCount({ stops, inspectionFailureCount, now }: ExceptionInput): number {
  const missed = new Set(allMissedStops(stops, now).map((s) => s.id));
  for (const s of stops) if (s.status === 'skipped') missed.add(s.id);
  return missed.size + inspectionFailureCount;
}
