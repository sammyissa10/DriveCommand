/**
 * Audit trail time formatting helpers.
 * Pure functions — no side effects, no external dependencies.
 * The optional `now` parameter enables deterministic testing.
 */

/**
 * Returns a human-readable relative time string (e.g. "3 minutes ago").
 * Future timestamps are treated defensively as "just now".
 */
export function formatRelativeTime(input: Date | string, now?: Date): string {
  const d = input instanceof Date ? input : new Date(input as string);
  if (isNaN(d.getTime())) return '';

  const nowMs = now ? now.getTime() : Date.now();
  const diffMs = nowMs - d.getTime();

  // Defensive: future timestamps
  if (diffMs < 0) return 'just now';

  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHour = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);
  const diffWeek = Math.floor(diffMs / 604_800_000);
  const diffMonth = Math.floor(diffMs / 2_592_000_000); // 30-day months
  const diffYear = Math.floor(diffMs / 31_536_000_000); // 365-day years

  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec} seconds ago`;
  if (diffMin < 60) return diffMin === 1 ? '1 minute ago' : `${diffMin} minutes ago`;
  if (diffHour < 24) return diffHour === 1 ? '1 hour ago' : `${diffHour} hours ago`;
  if (diffDay < 7) return diffDay === 1 ? '1 day ago' : `${diffDay} days ago`;
  if (diffWeek < 4) return diffWeek === 1 ? '1 week ago' : `${diffWeek} weeks ago`;
  if (diffMonth < 12) return diffMonth === 1 ? '1 month ago' : `${diffMonth} months ago`;
  return diffYear === 1 ? '1 year ago' : `${diffYear} years ago`;
}

/**
 * Returns an absolute timestamp string in the user's local timezone and locale.
 * Example: "May 14, 2026, 3:45 PM"
 */
export function formatAbsoluteTime(input: Date | string): string {
  const d = input instanceof Date ? input : new Date(input as string);
  if (isNaN(d.getTime())) return '';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}
