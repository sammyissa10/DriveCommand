/**
 * Timezone-aware date formatting utilities.
 * Uses built-in Intl.DateTimeFormat (no external libraries needed).
 */

// quick-313 opened this file with a TODO listing modules suspected of the same
// UTC-midnight DATE bug. quick-541 swept every `@db.Date` column in the schema
// and discharged it: `formatDateOnly` / `daysUntilDateOnly` below are now the
// single way a date-only column reaches a screen, and every render site listed
// in `.planning/quick/541-three-driver-surface-fixes/` imports them.
//
// Reading this file to decide how to render something? The rule is one line:
//   * `@db.Date`        → `formatDateOnly` / `daysUntilDateOnly`  (a calendar date)
//   * `@db.Timestamptz` → `toLocaleDateString` / `formatDateInTenantTimezone`
//                         (a real instant — rendering it locally is CORRECT)
// Using the date-only helpers on a timestamptz introduces the inverse bug.

/**
 * The shapes a PostgreSQL DATE column takes on the way to a screen:
 *   'YYYY-MM-DD'                — raw date-only string
 *   'YYYY-MM-DDT00:00:00Z'      — toISOString() of a DATE at UTC midnight
 *   'YYYY-MM-DDT00:00:00.000Z'  — same, with milliseconds
 */
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}(T00:00:00(\.\d+)?Z?)?$/;

/**
 * Pull the calendar fields out of a date-only value, whatever shape it arrived in.
 *
 * A `Date` is read with **UTC getters**, because that is where Prisma puts a
 * DATE column: 2027-01-14 comes back as the instant 2027-01-14T00:00:00.000Z.
 * Local getters on that instant return 13 Jan in any negative-offset zone,
 * which is the entire bug.
 *
 * A string is **sliced**, never parsed-then-read, so no zone can intervene.
 */
function calendarParts(value: Date | string): { y: number; m: number; d: number } | null {
  if (typeof value === 'string') {
    // Covers the date-only shapes above and also 'YYYY-MM-DDTHH:mm:ss' with a
    // non-midnight time, which a DATE column should never produce but which a
    // caller may hand us after round-tripping through a form.
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (m) return { y: +m[1], m: +m[2] - 1, d: +m[3] };
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return { y: parsed.getUTCFullYear(), m: parsed.getUTCMonth(), d: parsed.getUTCDate() };
  }
  if (Number.isNaN(value.getTime())) return null;
  return { y: value.getUTCFullYear(), m: value.getUTCMonth(), d: value.getUTCDate() };
}

/**
 * Format a **date-only** column (`@db.Date`) as the calendar date it stores.
 *
 * WHY THIS EXISTS
 * A DATE column has no time and no zone — 2027-01-14 is "the fourteenth",
 * full stop. Prisma materialises it as the instant 2027-01-14T00:00:00.000Z.
 * `new Date(that).toLocaleDateString()` renders it in the *viewer's* zone, and
 * in America/Chicago (UTC−6) that instant is still 13 Jan at 18:00 — so a CDL
 * stored as expiring on the 14th displayed as "January 13, 2027", and the trip
 * gate told a dispatcher the licence "expired on Jan 13" when it had not.
 *
 * The fix is to never let a zone touch the value: read the calendar fields
 * directly (see `calendarParts`) and rebuild the Date at **local noon**, which
 * is far enough from both midnights that no offset, and no DST transition, can
 * roll it to an adjacent day.
 *
 * Do NOT use this on a `@db.Timestamptz`. Those are real instants and must be
 * rendered in the viewer's zone.
 *
 * @param value - A `Date` from Prisma, or its ISO/`YYYY-MM-DD` serialisation
 * @param opts  - Intl options (default: long month, numeric day, numeric year)
 * @returns The formatted date, or `'—'` when the value is null/unparseable
 */
export function formatDateOnly(
  value: Date | string | null | undefined,
  opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' },
): string {
  if (value === null || value === undefined || value === '') return '—';
  const parts = calendarParts(value);
  if (!parts) return '—';
  // Local noon: immune to every UTC offset (−12…+14) and to DST shifts.
  return new Date(parts.y, parts.m, parts.d, 12).toLocaleDateString('en-US', opts);
}

/**
 * `formatDateOnly` in the compact form the grids and cards use
 * ("Jan 14, 2027"). A named export rather than an options object repeated at
 * twenty call sites, so the fleet surfaces cannot drift apart again.
 */
export function formatDateOnlyShort(value: Date | string | null | undefined): string {
  return formatDateOnly(value, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Whole days from **today's calendar date** to a date-only column's calendar
 * date. Today is `0`, tomorrow `1`, yesterday `-1`.
 *
 * WHY NOT `(expiry - Date.now()) / 86400000`
 * That is what every compliance surface used to do, and it compares a UTC
 * midnight against the current instant. On the morning of the 14th, a CDL
 * expiring on the 14th produced a negative fraction and the badge read
 * "Expired" — a driver told to park on a day their licence was still valid.
 * Collapsing both sides to a calendar day index removes the time of day from
 * the question entirely, which is the only way "expires today" is answerable.
 *
 * @param value - A `Date` from Prisma, or its ISO/`YYYY-MM-DD` serialisation
 * @param now   - Injectable clock for tests; defaults to the current time
 * @returns Whole days, or `null` when the value is null/unparseable
 */
export function daysUntilDateOnly(
  value: Date | string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parts = calendarParts(value);
  if (!parts) return null;
  // Both sides as UTC day indices. `now` is read with LOCAL getters because
  // "today" means today where the viewer is standing, not in UTC.
  const target = Date.UTC(parts.y, parts.m, parts.d);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86_400_000);
}

/**
 * True when a date-only column is strictly before today — i.e. genuinely
 * expired, not merely expiring today. The distinction decides whether a driver
 * rolls, so it gets a name rather than being re-derived at each call site.
 */
export function isExpiredDateOnly(
  value: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  const days = daysUntilDateOnly(value, now);
  return days !== null && days < 0;
}

/**
 * Format date in tenant timezone using Intl.DateTimeFormat.
 * Avoids hydration mismatches by formatting server-side.
 *
 * @param date - Date object or ISO string
 * @param timezone - IANA timezone (e.g., 'America/New_York', 'UTC')
 * @param options - Intl.DateTimeFormat options
 * @returns Formatted date string
 */
export function formatDateInTenantTimezone(
  date: Date | string,
  timezone: string = 'UTC',
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    ...options,
    timeZone: timezone,
  }).format(dateObj);
}

/**
 * Format date for datetime-local input (YYYY-MM-DDTHH:mm).
 * Converts UTC date to tenant timezone for form pre-fill.
 *
 * @param date - Date object
 * @param timezone - IANA timezone (e.g., 'America/New_York', 'UTC')
 * @returns Date string in datetime-local format
 */
export function formatForDatetimeInput(date: Date, timezone: string = 'UTC'): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).formatToParts(date);

  const get = (type: string) => parts.find(p => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/**
 * Format a settlement pay period date (period_start / period_end) in a
 * timezone-stable way.
 *
 * WHY THIS EXISTS:
 * PostgreSQL DATE columns (e.g. DriverSettlement.period_start) have no time
 * component. When Prisma serializes them via toISOString(), they become
 * '2026-05-11T00:00:00.000Z'. Calling `new Date(iso).toLocaleDateString()` on
 * that value renders the *prior* calendar day in any negative-offset timezone
 * (America/Chicago, America/Los_Angeles, America/New_York) because UTC midnight
 * is still the previous evening locally. This helper detects the date-only ISO
 * shape and constructs the Date via `new Date(year, monthIndex, day)` — a
 * local-calendar parse that sidesteps the UTC trap entirely.
 *
 * Real timestamp inputs (finalizedAt, paidAt, createdAt, approvedAt) are NOT
 * date-only strings and fall through to the standard `new Date(input)` branch,
 * preserving their existing behavior.
 *
 * RELATIONSHIP TO `formatDateOnly` (quick-541):
 * The date-only branch now delegates to `formatDateOnly`, so there is one
 * implementation of the calendar-date rule. The *heuristic* stays here and is
 * deliberately NOT pushed down: this function is the only one that must guess
 * whether its input is a date or an instant, and `src/__tests__/format-date.test.ts`
 * pins the guess — a real timestamp must keep rendering in local time. New
 * call sites should import `formatDateOnly` directly, where the column type is
 * known and no guessing is needed.
 *
 * @param input - 'YYYY-MM-DD', 'YYYY-MM-DDT00:00:00.000Z' (DATE column shape), or a Date instance
 * @param opts  - Intl.DateTimeFormatOptions (default: long month + numeric day + year)
 * @returns Formatted date string in en-US locale
 */
export function formatPayPeriodDate(
  input: string | Date,
  opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' },
): string {
  if (typeof input === 'string' && DATE_ONLY_RE.test(input)) {
    return formatDateOnly(input, opts);
  }
  const dateObj = typeof input === 'string' ? new Date(input) : input;
  return dateObj.toLocaleDateString('en-US', opts);
}
