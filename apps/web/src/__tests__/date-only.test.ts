import { describe, it, expect } from 'vitest';
import { formatDateOnly, daysUntilDateOnly, isExpiredDateOnly } from '@/lib/utils/date';

// ---------------------------------------------------------------------------
// Timezone helper — mirrors format-date.test.ts so the two suites agree on how
// a zone is forced. Node reads process.env.TZ lazily, so setting it around the
// call is enough for the Intl/Date calls made inside.
// ---------------------------------------------------------------------------

const ORIG_TZ = process.env.TZ;

function runInTz(tz: string, fn: () => void) {
  process.env.TZ = tz;
  try {
    fn();
  } finally {
    process.env.TZ = ORIG_TZ;
  }
}

/**
 * Every zone that broke the old code, plus UTC and a positive offset as
 * controls. Chicago is the one that produced the reported bug.
 */
const ZONES = [
  'America/Chicago',
  'America/Los_Angeles',
  'America/New_York',
  'UTC',
  'Australia/Sydney',
];

// ---------------------------------------------------------------------------
// formatDateOnly
// ---------------------------------------------------------------------------

describe('formatDateOnly', () => {
  // The exact reported defect: carrier_drivers.cdl_expiry holds 2027-01-14 and
  // /carrier/fleet/drivers rendered "January 13, 2027".
  describe('the reported CDL defect — 2027-01-14 is the fourteenth everywhere', () => {
    for (const tz of ZONES) {
      it(`renders "January 14, 2027" in ${tz}`, () => {
        runInTz(tz, () => {
          // Prisma's shape for a DATE column: a Date at UTC midnight.
          expect(formatDateOnly(new Date('2027-01-14T00:00:00.000Z'))).toBe('January 14, 2027');
          // The serialised shapes the same value takes over the wire.
          expect(formatDateOnly('2027-01-14T00:00:00.000Z')).toBe('January 14, 2027');
          expect(formatDateOnly('2027-01-14')).toBe('January 14, 2027');
        });
      });
    }
  });

  // A Date *object* was the gap in quick-313's helper: it fell through to the
  // local-render branch and stayed off by one. Server components pass exactly
  // this, which is why the roster was wrong.
  it('handles a Prisma Date object, not just the serialised string', () => {
    runInTz('America/Chicago', () => {
      const prismaValue = new Date(Date.UTC(2026, 0, 14));
      expect(formatDateOnly(prismaValue)).toBe('January 14, 2026');
      // Proof the naive call really is wrong, so this test cannot pass vacuously.
      expect(prismaValue.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }))
        .toBe('January 13, 2026');
    });
  });

  it('respects Intl options', () => {
    runInTz('America/Chicago', () => {
      expect(formatDateOnly('2027-01-14', { month: 'short', day: 'numeric', year: 'numeric' }))
        .toBe('Jan 14, 2027');
    });
  });

  it('survives a DST boundary in both directions', () => {
    runInTz('America/Chicago', () => {
      // US spring-forward and fall-back dates — the days a midnight-anchored
      // Date is most likely to slip.
      expect(formatDateOnly('2026-03-08')).toBe('March 8, 2026');
      expect(formatDateOnly('2026-11-01')).toBe('November 1, 2026');
    });
  });

  it('returns an em dash for null, undefined, empty and unparseable input', () => {
    expect(formatDateOnly(null)).toBe('—');
    expect(formatDateOnly(undefined)).toBe('—');
    expect(formatDateOnly('')).toBe('—');
    expect(formatDateOnly('not a date')).toBe('—');
    expect(formatDateOnly(new Date('nonsense'))).toBe('—');
  });
});

// ---------------------------------------------------------------------------
// daysUntilDateOnly
// ---------------------------------------------------------------------------

describe('daysUntilDateOnly', () => {
  // The compliance question the old ms-subtraction got wrong.
  it('a licence expiring today is 0 days out, not -1', () => {
    runInTz('America/Chicago', () => {
      // 09:00 local on the 14th — well past the UTC midnight the DATE column holds.
      const now = new Date('2026-01-14T15:00:00.000Z');
      expect(daysUntilDateOnly('2026-01-14T00:00:00.000Z', now)).toBe(0);
      expect(isExpiredDateOnly('2026-01-14T00:00:00.000Z', now)).toBe(false);
    });
  });

  it('yesterday is -1 and genuinely expired', () => {
    runInTz('America/Chicago', () => {
      const now = new Date('2026-01-14T15:00:00.000Z');
      expect(daysUntilDateOnly('2026-01-13', now)).toBe(-1);
      expect(isExpiredDateOnly('2026-01-13', now)).toBe(true);
    });
  });

  it('counts forward in whole days regardless of the time of day', () => {
    runInTz('America/Chicago', () => {
      // Late evening local — the moment most likely to roll a naive calculation.
      const lateEvening = new Date('2026-01-15T05:30:00.000Z'); // 23:30 on the 14th, Chicago
      expect(daysUntilDateOnly('2026-01-14', lateEvening)).toBe(0);
      expect(daysUntilDateOnly('2026-01-15', lateEvening)).toBe(1);
      expect(daysUntilDateOnly('2026-02-13', lateEvening)).toBe(30);
    });
  });

  it('gives the same answer in every zone for a given local day', () => {
    for (const tz of ZONES) {
      runInTz(tz, () => {
        // Midday UTC keeps every listed zone on the same calendar day.
        const now = new Date('2026-06-15T12:00:00.000Z');
        expect(daysUntilDateOnly('2026-06-15', now)).toBe(0);
        expect(daysUntilDateOnly('2026-06-16', now)).toBe(1);
      });
    }
  });

  it('returns null for null, undefined, empty and unparseable input', () => {
    expect(daysUntilDateOnly(null)).toBeNull();
    expect(daysUntilDateOnly(undefined)).toBeNull();
    expect(daysUntilDateOnly('')).toBeNull();
    expect(daysUntilDateOnly('not a date')).toBeNull();
    expect(isExpiredDateOnly(null)).toBe(false);
  });
});
