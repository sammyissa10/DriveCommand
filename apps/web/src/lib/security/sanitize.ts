/**
 * Filename and header sanitization utilities.
 *
 * Prevents path traversal, CRLF injection, and log injection attacks.
 * Part of quick-349 input/upload abuse hardening (Section 4A).
 */

/** Thrown when sanitization detects a security violation (e.g., CRLF in header). */
export class SanitizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SanitizationError';
  }
}

/**
 * Sanitize a filename to prevent path traversal and other injection attacks.
 *
 * - Strips path separators (`/`, `\`)
 * - Removes null bytes and control characters (0x00–0x1F)
 * - Keeps only `[A-Za-z0-9._-]` characters
 * - Collapses repeated dots
 * - Truncates to 200 characters
 * - Rejects leading dots (hidden files)
 * - Fallback to `'unnamed'` if empty after sanitization
 */
export function sanitizeFilename(name: string): string {
  if (!name) return 'unnamed';

  // Strip path separators and null bytes
  let safe = name.replace(/[/\\]/g, '').replace(/\x00/g, '');

  // Remove control characters (0x00–0x1F) and all non-allowed chars
  // Keep only [A-Za-z0-9._-]
  safe = safe.replace(/[^A-Za-z0-9._-]/g, '');

  // Collapse repeated dots (e.g., "foo....bar" -> "foo.bar")
  safe = safe.replace(/\.{2,}/g, '.');

  // Truncate to 200 characters
  safe = safe.slice(0, 200);

  // Remove leading dots (no hidden files like .hidden or .env)
  safe = safe.replace(/^\.+/, '');

  // Fallback if empty after sanitization
  return safe || 'unnamed';
}

/**
 * Sanitize a header value to prevent CRLF injection.
 *
 * Throws `SanitizationError` if the value contains CR (`\r`) or LF (`\n`).
 * Strips other control characters (0x00–0x08, 0x0A–0x1F, 0x7F) except tab (0x09).
 */
export function sanitizeHeader(value: string): string {
  if (value.includes('\r') || value.includes('\n')) {
    throw new SanitizationError('Header contains CRLF');
  }
  return stripControlChars(value);
}

/**
 * Strip control characters from a string (for safe logging).
 *
 * Removes characters in ranges: 0x00–0x08, 0x0A–0x1F, 0x7F.
 * Preserves tab (0x09 = \t) for structured log indentation.
 */
export function stripControlChars(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x08\x0A-\x1F\x7F]/g, '');
}
