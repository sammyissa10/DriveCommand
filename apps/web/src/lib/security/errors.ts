/**
 * Standardized API error response helper with correlation IDs.
 *
 * Never echoes request input in the response body — only a safe code,
 * optional message, and a correlation ID for log correlation.
 *
 * Part of quick-349 input/upload abuse hardening (Section 4A).
 */

import { nanoid } from 'nanoid';
import { NextResponse } from 'next/server';
import { structuredLog } from './logger';

/**
 * Build a standardized JSON error response.
 *
 * - Generates a unique `correlationId` (10-char nanoid) for log correlation.
 * - Logs the error internally via `structuredLog` at 'warn' level.
 * - NEVER includes `options.detail` (internal context) in the response body.
 *
 * @param status  - HTTP status code (e.g., 413, 422, 429)
 * @param code    - Machine-readable error code (e.g., 'PAYLOAD_TOO_LARGE')
 * @param options - Optional message override + internal detail (NOT sent to client)
 */
export function apiError(
  status: number,
  code: string,
  options?: { message?: string; detail?: unknown }
): NextResponse {
  const correlationId = nanoid(10);

  structuredLog('warn', 'api_error', {
    status,
    code,
    correlationId,
    // detail is internal-only — sanitized in logger, never sent to client
    detail: typeof options?.detail === 'string'
      ? options.detail
      : options?.detail instanceof Error
        ? options.detail.message
        : undefined,
  });

  return NextResponse.json(
    {
      error: {
        code,
        message: options?.message ?? code,
        correlationId,
      },
    },
    { status }
  );
}
