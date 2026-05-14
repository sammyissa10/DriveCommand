/**
 * Timezone-aware date formatting utilities.
 * Uses built-in Intl.DateTimeFormat (no external libraries needed).
 */

// TODO: The following modules are suspected of the same UTC-midnight DATE bug as the
// settlement period_start/period_end displays fixed in quick-313. These modules use
// `new Date(isoString).toLocaleDateString()` on PostgreSQL DATE columns (no time component),
// which renders the prior calendar day in any negative-offset timezone (Chicago, LA, NY)
// because the API serializes DATE as '2026-05-11T00:00:00.000Z'. Fix them in a future task:
//   - apps/web/src/app/(owner)/carrier/loads/**  (load pickup/delivery date displays)
//   - apps/web/src/app/(owner)/carrier/dispatches/**  (dispatch date column)
//   - driver hire_date displays anywhere in the codebase

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
 * @param input - 'YYYY-MM-DD', 'YYYY-MM-DDT00:00:00.000Z' (DATE column shape), or a Date instance
 * @param opts  - Intl.DateTimeFormatOptions (default: long month + numeric day + year)
 * @returns Formatted date string in en-US locale
 */
export function formatPayPeriodDate(
  input: string | Date,
  opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' },
): string {
  // Regex covers:
  //   'YYYY-MM-DD'                   — raw date-only string
  //   'YYYY-MM-DDT00:00:00Z'         — toISOString of a DATE at UTC midnight (no ms)
  //   'YYYY-MM-DDT00:00:00.000Z'     — toISOString of a DATE at UTC midnight (with ms)
  // These patterns identify PostgreSQL DATE column values serialized via Prisma/JSON.
  const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}(T00:00:00(\.\d+)?Z?)?$/;

  let dateObj: Date;
  if (typeof input === 'string' && DATE_ONLY_RE.test(input)) {
    const year = parseInt(input.slice(0, 4), 10);
    const monthIndex = parseInt(input.slice(5, 7), 10) - 1; // 0-based
    const day = parseInt(input.slice(8, 10), 10);
    dateObj = new Date(year, monthIndex, day);
  } else {
    dateObj = typeof input === 'string' ? new Date(input) : input;
  }

  return dateObj.toLocaleDateString('en-US', opts);
}
