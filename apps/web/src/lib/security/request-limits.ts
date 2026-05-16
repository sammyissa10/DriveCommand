/**
 * Request limits middleware wrapper.
 *
 * Enforces limits on request body size, URL length, query param count,
 * and JSON structure depth/keys/array length before the handler runs.
 *
 * Part of quick-349 input/upload abuse hardening (Section 4A.1).
 */

import { NextRequest, NextResponse } from 'next/server';
import { apiError } from './errors';

// ─── Constants ─────────────────────────────────────────────────────────────

export const DEFAULT_BODY_LIMIT = 1_048_576;        // 1 MB
export const UPLOAD_BODY_LIMIT = 104_857_600;       // 100 MB
export const URL_MAX_LENGTH = 8_192;                // 8 KB
export const QUERY_PARAM_MAX = 100;
export const JSON_MAX_DEPTH = 32;
export const OBJECT_MAX_KEYS = 1_000;
export const ARRAY_MAX_LENGTH = 10_000;

// ─── Internal helpers ──────────────────────────────────────────────────────

class StructureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StructureError';
  }
}

function checkStructure(value: unknown, depth: number): void {
  if (depth > JSON_MAX_DEPTH) {
    throw new StructureError(`JSON depth exceeds ${JSON_MAX_DEPTH}`);
  }
  if (Array.isArray(value)) {
    if (value.length > ARRAY_MAX_LENGTH) {
      throw new StructureError(`Array length ${value.length} exceeds ${ARRAY_MAX_LENGTH}`);
    }
    for (const item of value) {
      checkStructure(item, depth + 1);
    }
  } else if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as object);
    if (keys.length > OBJECT_MAX_KEYS) {
      throw new StructureError(`Object keys ${keys.length} exceeds ${OBJECT_MAX_KEYS}`);
    }
    for (const key of keys) {
      checkStructure((value as Record<string, unknown>)[key], depth + 1);
    }
  }
}

// ─── Handler types ─────────────────────────────────────────────────────────

type RouteHandler = (req: NextRequest, ctx: unknown) => Promise<NextResponse | Response>;

// ─── Exports ───────────────────────────────────────────────────────────────

/**
 * Get the pre-parsed JSON body stashed by `withRequestLimits`.
 * Returns undefined if the body was not parsed (non-JSON routes or GET).
 */
export function getParsedBody<T = unknown>(req: NextRequest): T | undefined {
  return (req as unknown as Record<string, unknown>)['__parsedBody'] as T | undefined;
}

/**
 * Wrap a Next.js route handler with request limits enforcement.
 *
 * Checks (in order):
 * 1. URL length > URL_MAX_LENGTH → 414
 * 2. Query param count > QUERY_PARAM_MAX → 414
 * 3. Content-Length header > bodySizeLimit → 413 (fast path)
 * 4. JSON body size > bodySizeLimit → 413
 * 5. JSON structure depth/keys/array length violations → 422
 *
 * @param handler       - The actual route handler
 * @param options.bodySizeLimit   - Override the default body size limit (bytes)
 * @param options.uploadRoute     - Set to true to use UPLOAD_BODY_LIMIT (100 MB)
 */
export function withRequestLimits(
  handler: RouteHandler,
  options?: { bodySizeLimit?: number; uploadRoute?: boolean }
): RouteHandler {
  const bodyLimit = options?.bodySizeLimit
    ?? (options?.uploadRoute ? UPLOAD_BODY_LIMIT : DEFAULT_BODY_LIMIT);

  return async (req: NextRequest, ctx: unknown): Promise<NextResponse | Response> => {
    try {
      // 1. URL length check
      if (req.url.length > URL_MAX_LENGTH) {
        return apiError(414, 'URI_TOO_LONG');
      }

      // 2. Query param count check
      const url = new URL(req.url);
      let paramCount = 0;
      for (const _ of url.searchParams) {
        paramCount++;
        if (paramCount > QUERY_PARAM_MAX) {
          return apiError(414, 'TOO_MANY_QUERY_PARAMS');
        }
      }

      // 3. Content-Length fast path (no body read)
      const contentLength = req.headers.get('content-length');
      if (contentLength !== null) {
        const len = parseInt(contentLength, 10);
        if (!isNaN(len) && len > bodyLimit) {
          return apiError(413, 'PAYLOAD_TOO_LARGE', {
            message: `Request body exceeds ${bodyLimit} bytes`,
          });
        }
      }

      // 4 & 5. JSON body parsing + structure check
      const contentType = req.headers.get('content-type') ?? '';
      const method = req.method.toUpperCase();

      if (
        contentType.includes('application/json') &&
        (method === 'POST' || method === 'PUT' || method === 'PATCH')
      ) {
        const bodyText = await req.text();

        if (Buffer.byteLength(bodyText, 'utf8') > bodyLimit) {
          return apiError(413, 'PAYLOAD_TOO_LARGE', {
            message: `Request body exceeds ${bodyLimit} bytes`,
          });
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(bodyText);
        } catch {
          return apiError(422, 'INVALID_JSON', { message: 'Request body is not valid JSON' });
        }

        try {
          checkStructure(parsed, 0);
        } catch (err) {
          if (err instanceof StructureError) {
            return apiError(422, 'INVALID_STRUCTURE', { message: err.message });
          }
          throw err;
        }

        // Stash parsed body so handler doesn't have to parse again
        (req as unknown as Record<string, unknown>)['__parsedBody'] = parsed;
      }

      return await handler(req, ctx);
    } catch (err) {
      return apiError(500, 'INTERNAL_ERROR', { detail: err });
    }
  };
}
