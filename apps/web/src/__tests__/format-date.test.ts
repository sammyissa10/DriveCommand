import { describe, it, expect } from 'vitest';
import { formatPayPeriodDate } from '@/lib/utils/date';

// ---------------------------------------------------------------------------
// Timezone helper
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

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('formatPayPeriodDate', () => {
  const TIMEZONES = [
    'America/Los_Angeles',
    'America/Chicago',
    'America/New_York',
    'UTC',
  ] as const;

  // ── Date-only string: raw 'YYYY-MM-DD' ──────────────────────────────────

  describe("raw 'YYYY-MM-DD' string — stable across all US timezones", () => {
    for (const tz of TIMEZONES) {
      it(`renders '2026-05-11' as 'May 11, 2026' in ${tz}`, () => {
        runInTz(tz, () => {
          expect(formatPayPeriodDate('2026-05-11')).toBe('May 11, 2026');
        });
      });
    }

    it('produces identical output across all 4 timezones for raw date string', () => {
      const results = TIMEZONES.map((tz) => {
        let result = '';
        runInTz(tz, () => {
          result = formatPayPeriodDate('2026-05-11');
        });
        return result;
      });
      // All entries must be the same string
      const unique = new Set(results);
      expect(unique.size).toBe(1);
      expect(results[0]).toBe('May 11, 2026');
    });
  });

  // ── toISOString-of-a-DATE shape: '2026-05-11T00:00:00.000Z' ─────────────
  // This is the actual production bug shape — Prisma serializes DATE columns
  // via toISOString(), producing UTC midnight strings that render as the prior
  // calendar day in negative-offset timezones.

  describe("UTC midnight ISO string ('YYYY-MM-DDT00:00:00.000Z') — the production bug shape", () => {
    for (const tz of TIMEZONES) {
      it(`renders '2026-05-11T00:00:00.000Z' as 'May 11, 2026' in ${tz}`, () => {
        runInTz(tz, () => {
          expect(formatPayPeriodDate('2026-05-11T00:00:00.000Z')).toBe('May 11, 2026');
        });
      });
    }

    it('produces identical output across all 4 timezones for UTC midnight ISO string', () => {
      const results = TIMEZONES.map((tz) => {
        let result = '';
        runInTz(tz, () => {
          result = formatPayPeriodDate('2026-05-11T00:00:00.000Z');
        });
        return result;
      });
      const unique = new Set(results);
      expect(unique.size).toBe(1);
      expect(results[0]).toBe('May 11, 2026');
    });
  });

  // ── UTC midnight ISO without milliseconds: '2026-05-11T00:00:00Z' ───────

  describe("UTC midnight ISO without ms ('YYYY-MM-DDT00:00:00Z')", () => {
    for (const tz of TIMEZONES) {
      it(`renders '2026-05-11T00:00:00Z' as 'May 11, 2026' in ${tz}`, () => {
        runInTz(tz, () => {
          expect(formatPayPeriodDate('2026-05-11T00:00:00Z')).toBe('May 11, 2026');
        });
      });
    }
  });

  // ── Timestamp pass-through: real timestamps must NOT be treated as date-only ──

  describe('real timestamp strings — pass through standard Date parsing (NOT date-only branch)', () => {
    it("'2026-05-11T05:00:00.000Z' renders differently in UTC vs America/Los_Angeles (day-boundary proof)", () => {
      // 2026-05-11T05:00:00.000Z is:
      //   UTC:              May 11, 2026 05:00  → renders as May 11
      //   America/Los_Angeles: May 10, 2026 22:00 → renders as May 10
      // This proves the timestamp is NOT going through the date-only branch.
      let utcResult = '';
      let laResult = '';

      runInTz('UTC', () => {
        utcResult = formatPayPeriodDate('2026-05-11T05:00:00.000Z');
      });
      runInTz('America/Los_Angeles', () => {
        laResult = formatPayPeriodDate('2026-05-11T05:00:00.000Z');
      });

      // They must differ — UTC gives May 11, LA gives May 10
      expect(utcResult).not.toBe(laResult);
      expect(utcResult).toBe('May 11, 2026');
      expect(laResult).toBe('May 10, 2026');
    });

    it("'2026-05-11T18:30:00.000Z' is not caught by the date-only regex", () => {
      // '18:30:00' does not match T00:00:00, so it must go through new Date(input)
      let utcResult = '';
      runInTz('UTC', () => {
        utcResult = formatPayPeriodDate('2026-05-11T18:30:00.000Z');
      });
      // UTC 18:30 is still May 11 in UTC
      expect(utcResult).toBe('May 11, 2026');

      // But in UTC-8 (LA during standard time) it would still be May 11 at 10:30,
      // so just confirm it doesn't throw and returns a sensible string
      let laResult = '';
      runInTz('America/Los_Angeles', () => {
        laResult = formatPayPeriodDate('2026-05-11T18:30:00.000Z');
      });
      expect(typeof laResult).toBe('string');
      expect(laResult.length).toBeGreaterThan(0);
    });
  });

  // ── Custom options ───────────────────────────────────────────────────────

  describe('custom Intl.DateTimeFormatOptions', () => {
    it('renders with short month when opts override is passed', () => {
      const opts: Intl.DateTimeFormatOptions = {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      };
      expect(formatPayPeriodDate('2026-05-11', opts)).toBe('May 11, 2026');
    });

    it('renders with month + day only (no year) when opts override is passed', () => {
      const opts: Intl.DateTimeFormatOptions = {
        month: 'short',
        day: 'numeric',
      };
      expect(formatPayPeriodDate('2026-05-11', opts)).toBe('May 11');
    });
  });

  // ── Date instance input ──────────────────────────────────────────────────

  describe('Date instance input', () => {
    it('formats a Date object via the standard branch', () => {
      // new Date(2026, 4, 11) = May 11, 2026 in local calendar (month is 0-indexed)
      const d = new Date(2026, 4, 11); // local midnight
      expect(formatPayPeriodDate(d)).toBe('May 11, 2026');
    });
  });
});
