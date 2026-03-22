/**
 * Timezone-aware date formatting utilities.
 * Uses built-in Intl.DateTimeFormat (no external libraries needed).
 */

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
