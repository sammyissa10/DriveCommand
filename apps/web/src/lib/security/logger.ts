/**
 * Structured logger with control-character stripping on user-provided fields.
 *
 * Prevents log injection attacks where user input containing newlines or
 * control characters could corrupt structured log output.
 *
 * Part of quick-349 input/upload abuse hardening (Section 4A.5).
 */

import { stripControlChars } from './sanitize';

type LogLevel = 'info' | 'warn' | 'error';

/**
 * Walk a value recursively, applying stripControlChars to all string values.
 * Numbers, booleans, null, undefined are left as-is.
 */
function sanitizeData(value: unknown): unknown {
  if (typeof value === 'string') {
    return stripControlChars(value);
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeData);
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = sanitizeData(v);
    }
    return result;
  }
  // Numbers, booleans, null, undefined, etc.
  return value;
}

/**
 * Emit a structured JSON log entry with all string fields sanitized.
 *
 * @param level - Log level: 'info', 'warn', or 'error'
 * @param message - Log message (will be sanitized)
 * @param data - Optional additional data (all strings recursively sanitized)
 */
export function structuredLog(
  level: LogLevel,
  message: string,
  data?: Record<string, unknown>
): void {
  const sanitizedData = data ? (sanitizeData(data) as Record<string, unknown>) : {};

  const payload: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    message: stripControlChars(message),
    ...sanitizedData,
  };

  console[level](JSON.stringify(payload));
}
