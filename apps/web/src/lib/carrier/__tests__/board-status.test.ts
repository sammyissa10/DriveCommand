/**
 * Phase 11 — the board's derivations.
 *
 * The behind-schedule definition is INVENTED (DEC-18) and will eventually be
 * quoted at a customer, so it is pinned here rather than left to a screenshot.
 * Constants are imported, never restated — same discipline as
 * `inspection-gate.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import {
  ATTENTION_RANK,
  NON_TERMINAL_STOP_STATUSES,
  ON_TIME_COPY,
} from '../board-constants';
import {
  allMissedStops,
  attentionRank,
  currentOrNextStop,
  deriveOnTime,
  deriveTripAttention,
  exceptionCount,
  hasAnyWindow,
  isBehindSchedule,
  minutesToWindowClose,
  missedStops,
  stopProgress,
  windowOutcome,
  type BoardStop,
} from '../board-status';

const NOW = new Date('2026-08-26T15:00:00.000Z');
const EARLIER = new Date('2026-08-26T12:00:00.000Z');
const LATER = new Date('2026-08-26T18:00:00.000Z');

function stop(over: Partial<BoardStop> = {}): BoardStop {
  return {
    id: over.id ?? 's1',
    sequenceOrder: over.sequenceOrder ?? 1,
    status: over.status ?? 'pending',
    appointmentEnd: over.appointmentEnd ?? null,
    arrivedAt: over.arrivedAt ?? null,
  };
}

describe('windowOutcome', () => {
  it('is NO_WINDOW when no appointment_end exists', () => {
    expect(windowOutcome(stop({ appointmentEnd: null }), NOW)).toBe('NO_WINDOW');
  });

  it('is MET when the driver arrived inside the window', () => {
    expect(
      windowOutcome(stop({ appointmentEnd: LATER, arrivedAt: NOW, status: 'arrived' }), NOW),
    ).toBe('MET');
  });

  it('is MET on the boundary — arriving exactly at the close is on time', () => {
    // Matches the performance report's `arrived_at <= appointment_end`, which is
    // inclusive. An exclusive comparison here would make the two disagree about
    // a stop landing on the minute.
    expect(windowOutcome(stop({ appointmentEnd: NOW, arrivedAt: NOW }), NOW)).toBe('MET');
  });

  it('is MISSED when the driver arrived after the window', () => {
    expect(windowOutcome(stop({ appointmentEnd: EARLIER, arrivedAt: NOW }), NOW)).toBe('MISSED');
  });

  it('is MISSED when the window closed and nobody arrived', () => {
    expect(windowOutcome(stop({ appointmentEnd: EARLIER, arrivedAt: null }), NOW)).toBe('MISSED');
  });

  it('is PENDING while the window is still open', () => {
    expect(windowOutcome(stop({ appointmentEnd: LATER, arrivedAt: null }), NOW)).toBe('PENDING');
  });
});

describe('the refinement on the approved wording', () => {
  /**
   * The ruling read "any non-terminal stop has appointment_end < now()". Taken
   * literally that marks a driver standing on the dock, who arrived INSIDE the
   * window, as late the moment the window closes — while the performance report
   * counts that same stop as on time. Board and report disagreeing about "late"
   * is the exact thing the ruling exists to prevent.
   */
  it('does NOT call a trip late when the driver arrived in time and is still there', () => {
    const stops = [stop({ status: 'arrived', appointmentEnd: EARLIER, arrivedAt: EARLIER })];
    expect(missedStops(stops, NOW)).toHaveLength(0);
    expect(isBehindSchedule('in_progress', stops, NOW)).toBe(false);
    expect(deriveOnTime('in_progress', stops, NOW)).toBe('ON_TRACK');
  });

  it('DOES call it late when the driver arrived after the window', () => {
    const stops = [stop({ status: 'arrived', appointmentEnd: EARLIER, arrivedAt: NOW })];
    expect(isBehindSchedule('in_progress', stops, NOW)).toBe(true);
  });
});

describe('isBehindSchedule', () => {
  const lateStop = [stop({ status: 'pending', appointmentEnd: EARLIER })];

  it('requires the trip to be in_progress', () => {
    expect(isBehindSchedule('in_progress', lateStop, NOW)).toBe(true);
    expect(isBehindSchedule('planned', lateStop, NOW)).toBe(false);
    expect(isBehindSchedule('completed', lateStop, NOW)).toBe(false);
  });

  it('ignores terminal stops — those belong to the performance report', () => {
    const done = [stop({ status: 'completed', appointmentEnd: EARLIER, arrivedAt: null })];
    expect(isBehindSchedule('in_progress', done, NOW)).toBe(false);
  });

  it('is never true for a trip with no windows anywhere', () => {
    expect(isBehindSchedule('in_progress', [stop(), stop({ id: 's2' })], NOW)).toBe(false);
  });

  it('only considers the two non-terminal statuses the CHECK constraint admits', () => {
    for (const status of NON_TERMINAL_STOP_STATUSES) {
      expect(
        isBehindSchedule('in_progress', [stop({ status, appointmentEnd: EARLIER })], NOW),
      ).toBe(true);
    }
  });
});

describe('deriveOnTime — the unschedulable case', () => {
  /**
   * The dominant path on this database: 7 of 308 trips carry a window at all.
   * NO_WINDOWS must never be ON_TRACK, because green is read as "fine" when it
   * would actually mean "nobody set any windows".
   */
  it('is NO_WINDOWS, not ON_TRACK, when the trip has no appointment windows', () => {
    expect(deriveOnTime('in_progress', [stop(), stop({ id: 's2' })], NOW)).toBe('NO_WINDOWS');
  });

  it('says so in words rather than leaving the cell blank', () => {
    expect(ON_TIME_COPY.NO_WINDOWS.label).toBe('No windows set');
    expect(ON_TIME_COPY.NO_WINDOWS.label).not.toBe('');
    expect(ON_TIME_COPY.NO_WINDOWS.label).not.toBe(ON_TIME_COPY.ON_TRACK.label);
  });

  it('is NOT_APPLICABLE for cancelled and TONU', () => {
    expect(deriveOnTime('cancelled', [stop({ appointmentEnd: EARLIER })], NOW)).toBe(
      'NOT_APPLICABLE',
    );
    expect(deriveOnTime('tonu', [stop({ appointmentEnd: EARLIER })], NOW)).toBe('NOT_APPLICABLE');
  });

  it('reports a finished trip that ran late as BEHIND_SCHEDULE', () => {
    // The COLUMN is a fact about the trip; the attention RANK is about what
    // needs doing. They differ here on purpose.
    const stops = [stop({ status: 'completed', appointmentEnd: EARLIER, arrivedAt: NOW })];
    expect(deriveOnTime('completed', stops, NOW)).toBe('BEHIND_SCHEDULE');
    expect(deriveTripAttention({ tripStatus: 'completed', inspection: 'PASSED', stops, now: NOW }))
      .toBe('COMPLETED');
  });

  it('has no window at all when every stop lacks one', () => {
    expect(hasAnyWindow([stop(), stop({ id: 's2' })])).toBe(false);
    expect(hasAnyWindow([stop(), stop({ id: 's2', appointmentEnd: LATER })])).toBe(true);
  });
});

describe('deriveTripAttention — Section 13 order', () => {
  const late = [stop({ status: 'pending', appointmentEnd: EARLIER })];

  it('ranks the five states in the spec order, then CLOSED', () => {
    expect(ATTENTION_RANK.FAILED_INSPECTION).toBeLessThan(ATTENTION_RANK.NOT_STARTED);
    expect(ATTENTION_RANK.NOT_STARTED).toBeLessThan(ATTENTION_RANK.BEHIND_SCHEDULE);
    expect(ATTENTION_RANK.BEHIND_SCHEDULE).toBeLessThan(ATTENTION_RANK.ON_TRACK);
    expect(ATTENTION_RANK.ON_TRACK).toBeLessThan(ATTENTION_RANK.COMPLETED);
    // Ruling 2: cancelled and TONU rank last, AFTER completed.
    expect(ATTENTION_RANK.COMPLETED).toBeLessThan(ATTENTION_RANK.CLOSED);
  });

  it('puts a failed inspection above not-started, since a blocked trip IS both', () => {
    expect(
      deriveTripAttention({ tripStatus: 'planned', inspection: 'FAILED', stops: [], now: NOW }),
    ).toBe('FAILED_INSPECTION');
  });

  it('does NOT promote a cancelled trip with a stale failed inspection', () => {
    // Testing the inspection first would pin every cancelled run with an old
    // failed walkaround to the top of the report forever.
    expect(
      deriveTripAttention({ tripStatus: 'cancelled', inspection: 'FAILED', stops: [], now: NOW }),
    ).toBe('CLOSED');
  });

  it('classifies the running states', () => {
    expect(
      deriveTripAttention({ tripStatus: 'in_progress', inspection: 'PASSED', stops: late, now: NOW }),
    ).toBe('BEHIND_SCHEDULE');
    expect(
      deriveTripAttention({ tripStatus: 'in_progress', inspection: 'PASSED', stops: [], now: NOW }),
    ).toBe('ON_TRACK');
  });

  it('sorts ascending into the drawn order', () => {
    const states = ['COMPLETED', 'ON_TRACK', 'CLOSED', 'FAILED_INSPECTION', 'BEHIND_SCHEDULE', 'NOT_STARTED'] as const;
    const sorted = [...states].sort((a, b) => attentionRank(a) - attentionRank(b));
    expect(sorted).toEqual([
      'FAILED_INSPECTION',
      'NOT_STARTED',
      'BEHIND_SCHEDULE',
      'ON_TRACK',
      'COMPLETED',
      'CLOSED',
    ]);
  });
});

describe('progress and the next stop', () => {
  it('counts a skipped stop as done — the driver is not going back for it', () => {
    const stops = [
      stop({ id: 'a', sequenceOrder: 1, status: 'completed' }),
      stop({ id: 'b', sequenceOrder: 2, status: 'skipped' }),
      stop({ id: 'c', sequenceOrder: 3, status: 'pending' }),
    ];
    expect(stopProgress(stops)).toEqual({ completed: 2, total: 3 });
  });

  it('picks the lowest-sequence outstanding stop regardless of array order', () => {
    const stops = [
      stop({ id: 'c', sequenceOrder: 3, status: 'pending' }),
      stop({ id: 'b', sequenceOrder: 2, status: 'pending' }),
      stop({ id: 'a', sequenceOrder: 1, status: 'completed' }),
    ];
    expect(currentOrNextStop(stops)?.id).toBe('b');
  });

  it('has no next stop once everything is terminal', () => {
    expect(currentOrNextStop([stop({ status: 'completed' })])).toBeNull();
  });

  it('reports minutes to the window close, negative once it has passed', () => {
    expect(minutesToWindowClose(stop({ appointmentEnd: LATER }), NOW)).toBe(180);
    expect(minutesToWindowClose(stop({ appointmentEnd: EARLIER }), NOW)).toBe(-180);
    expect(minutesToWindowClose(stop({ appointmentEnd: null }), NOW)).toBeNull();
    expect(minutesToWindowClose(null, NOW)).toBeNull();
  });
});

describe('exceptionCount', () => {
  it('counts a missed window and a skip on the SAME stop only once', () => {
    const stops = [
      stop({ id: 'a', status: 'skipped', appointmentEnd: EARLIER, arrivedAt: null }),
    ];
    expect(allMissedStops(stops, NOW)).toHaveLength(1);
    expect(exceptionCount({ stops, inspectionFailureCount: 0, now: NOW })).toBe(1);
  });

  it('adds inspection failures to stop exceptions', () => {
    const stops = [
      stop({ id: 'a', status: 'pending', appointmentEnd: EARLIER }),
      stop({ id: 'b', sequenceOrder: 2, status: 'skipped' }),
    ];
    expect(exceptionCount({ stops, inspectionFailureCount: 2, now: NOW })).toBe(4);
  });

  it('is zero for a clean trip', () => {
    const stops = [stop({ status: 'completed', appointmentEnd: LATER, arrivedAt: NOW })];
    expect(exceptionCount({ stops, inspectionFailureCount: 0, now: NOW })).toBe(0);
  });
});
