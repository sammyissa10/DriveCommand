/**
 * Phase 11 — the live board's and Today's Trips report's tuneable values and
 * user-facing sentences, in one file.
 *
 * Same discipline as `template-constants.ts`, `optimisation-constants.ts` and
 * `inspection-constants.ts`: one occurrence each, grep-verifiable, imported by
 * the tests rather than restated in them.
 *
 * The COPY lives here for the reason quick-517 recorded: a sentence assembled
 * inline out of JSX children is four nodes, three of them whitespace-sensitive,
 * and it renders wrong in ways two separate investigations both misattributed.
 * One string per sentence removes the boundary rather than the suspect.
 */

// ---------------------------------------------------------------------------
// Attention ordering
// ---------------------------------------------------------------------------

/**
 * The report's default sort, as a derived NUMBER rather than a comparator.
 *
 * Section 13 draws it as:
 *
 *     failed inspection -> not started -> behind schedule
 *     -> on track -> completed
 *
 * plus a sixth rung this build adds: CLOSED (cancelled and TONU), ranked after
 * completed. A cancelled trip is not a trip that needs attention — it is a trip
 * that is over — and putting it above a completed one would make the top of the
 * report noise on the first tenant who cancels a run.
 *
 * WHY A NUMBER AND NOT A COMPARATOR. GridShell sorts through TanStack Table on
 * a column's accessor value. A comparator would have to be threaded through the
 * column def as a custom `sortingFn`, which means the ordering lives in the
 * table config — invisible to the tests and impossible to assert without
 * mounting a grid. A numeric `attentionRank` on the row is sortable by the
 * stock ascending sorter, readable in a snapshot, and testable as arithmetic.
 */
export const ATTENTION_RANK = {
  FAILED_INSPECTION: 0,
  NOT_STARTED: 1,
  BEHIND_SCHEDULE: 2,
  ON_TRACK: 3,
  COMPLETED: 4,
  CLOSED: 5,
} as const;

export type TripAttention = keyof typeof ATTENTION_RANK;

/**
 * Trip statuses excluded from the LIVE board entirely (ruling 2).
 *
 * The board answers "what is happening right now"; a cancelled or TONU trip is
 * not happening. They still appear in the report, ranked CLOSED, because the
 * report is a record of the day and a run that was cancelled at 06:00 is part
 * of that day.
 */
export const BOARD_EXCLUDED_TRIP_STATUSES = ['cancelled', 'tonu'] as const;

/** Trip statuses that mean the trip is over, one way or another. */
export const TERMINAL_TRIP_STATUSES = ['completed', 'cancelled', 'tonu'] as const;

/**
 * Stop statuses that are NOT terminal — the ones a trip can still be late for.
 *
 * `stops_status_check` admits exactly `pending | arrived | completed | skipped`,
 * read off production via `pg_constraint` per DEC-14 rather than inferred from
 * the surrounding code. `completed` and `skipped` are history; the performance
 * report already scores them.
 */
export const NON_TERMINAL_STOP_STATUSES = ['pending', 'arrived'] as const;

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

/**
 * The on-time column, one sentence per state.
 *
 * `NO_WINDOWS` is the one that matters and the one that was nearly missed.
 * On this database **7 of 308 trips carry an appointment window at all** (16 of
 * 720 stops) — so "we cannot measure this" is the DOMINANT path, not an edge
 * case, and rendering it as a green "On track" would tell an owner their day is
 * fine when what it actually means is that nobody set any windows.
 *
 * It is deliberately not an empty cell either: a blank reads as a rendering
 * bug, and the owner's next question ("why is this column empty?") is exactly
 * the question the sentence answers.
 *
 * The same restraint the performance report already shows: `on_time_pct` is
 * `NULLIF(count(windows), 0)`, so that report has always returned `null` rather
 * than a percentage for a windowless trip. This is the board saying the same
 * thing in words.
 */
export const ON_TIME_COPY = {
  ON_TRACK: {
    label: 'On track',
    description: 'Every appointment window on this trip is still being met.',
  },
  BEHIND_SCHEDULE: {
    label: 'Behind schedule',
    description: 'At least one appointment window has passed without arrival.',
  },
  NO_WINDOWS: {
    label: 'No windows set',
    description: "No appointment windows on this trip — on-time can't be measured.",
  },
  NOT_APPLICABLE: {
    label: 'Not applicable',
    description: 'This trip was cancelled or marked TONU.',
  },
} as const;

/** The attention column / board grouping, one sentence per state. */
export const ATTENTION_COPY = {
  FAILED_INSPECTION: {
    label: 'Failed inspection',
    description: 'A critical inspection item failed and the trip cannot start.',
  },
  NOT_STARTED: {
    label: 'Not started',
    description: 'Planned, but the driver has not started the trip.',
  },
  BEHIND_SCHEDULE: {
    label: 'Behind schedule',
    description: 'Running, with at least one appointment window already missed.',
  },
  ON_TRACK: { label: 'On track', description: 'Running, with nothing outstanding.' },
  COMPLETED: { label: 'Completed', description: 'Every stop is done.' },
  CLOSED: { label: 'Closed', description: 'Cancelled or marked TONU.' },
} as const;

/** The inspection badge. Colour AND icon AND text — Section 15. */
export const INSPECTION_COPY = {
  PASSED: { label: 'Passed', description: 'Every inspection item passed.' },
  PASSED_WITH_DEFECTS: {
    label: 'Defects logged',
    description: 'Non-critical items failed. The trip may still run.',
  },
  FAILED: {
    label: 'Failed',
    description: 'A critical item failed. The trip is blocked until it is cleared.',
  },
  OVERRIDDEN: {
    label: 'Overridden',
    description: 'An owner cleared a failed inspection with a written reason.',
  },
  IN_PROGRESS: { label: 'In progress', description: 'The walkaround has been started.' },
  NOT_STARTED: { label: 'Not started', description: 'The walkaround has not been opened.' },
  NOT_REQUIRED: {
    label: 'Not required',
    description: 'This tenant does not require a pre-trip inspection.',
  },
} as const;

/**
 * Empty states. Real sentences, because Phase 11's verify list calls out an
 * empty board as the thing testing skips — and because the page it sits on used
 * to swallow a server error into an empty array, which made "no trips" and
 * "we could not load your trips" render identically.
 */
export const BOARD_EMPTY_COPY = {
  noDriversTitle: 'No drivers on duty',
  noDriversBody: 'Drivers appear here once they are on an active trip or logged on duty.',
  noTrucksTitle: 'No active trucks',
  noTrucksBody: 'Trucks appear here once they are assigned to a trip that is running today.',
  noTripsTitle: 'No trips today',
  noTripsBody: 'Trips scheduled to depart today will appear here, newest problems first.',
} as const;
