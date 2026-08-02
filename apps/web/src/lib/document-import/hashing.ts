/**
 * Content hashing and deduplication keys.
 *
 * Spec: docs/specs/DocumentImport_TechnicalSpec_v1.md Section 14.
 *
 * Two distinct hashes, for two distinct jobs:
 *
 * 1. DOCUMENT hash — SHA-256 over the concatenated source bytes. Combined with
 *    tenant + document number + document date it forms the dedupe key, so two
 *    dispatchers photographing the same manifest cannot both create a trip.
 *    Enforced by `document_imports_dedupe_key` in the database, not here — app
 *    code alone loses the race between concurrent uploads.
 *
 * 2. PAGE hash — SHA-256 over one page's bytes, independently. Re-running a
 *    sixteen-page manifest where one page was re-shot bills for one page.
 */

import { createHash } from 'crypto';

/** Sentinels must match the COALESCE values in the migration's unique index. */
export const DEDUPE_NULL_DOCUMENT_NUMBER = '';
export const DEDUPE_NULL_DOCUMENT_DATE = '1900-01-01';

export function sha256(bytes: Uint8Array | Buffer): string {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex');
}

/**
 * Hash of one page's bytes. Order-independent and self-contained: the same page
 * photographed twice, in any document, hashes identically — which is exactly
 * what makes the cache work across imports.
 */
export function hashPage(bytes: Uint8Array | Buffer): string {
  return sha256(bytes);
}

/**
 * Hash over all source bytes in order.
 *
 * Order matters: the same pages in a different order are a different document,
 * because page order determines stop order downstream. Two uploads of the same
 * pages shuffled are genuinely different imports and must not collide.
 */
export function hashDocument(parts: Array<Uint8Array | Buffer>): string {
  const h = createHash('sha256');
  for (const p of parts) h.update(Buffer.from(p));
  return h.digest('hex');
}

export interface DedupeKeyInput {
  tenantId: string;
  contentHash: string;
  documentNumber?: string | null;
  /** ISO date (YYYY-MM-DD) or a Date. Null when the document has none. */
  documentDate?: string | Date | null;
}

/** Normalise a document date to YYYY-MM-DD, or the sentinel when absent. */
export function normalizeDocumentDate(value?: string | Date | null): string {
  if (value === null || value === undefined || value === '') return DEDUPE_NULL_DOCUMENT_DATE;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return DEDUPE_NULL_DOCUMENT_DATE;
    return value.toISOString().slice(0, 10);
  }
  const trimmed = String(value).trim();
  if (!trimmed) return DEDUPE_NULL_DOCUMENT_DATE;
  // Already ISO-ish: take the date portion as-is rather than round-tripping
  // through Date, which would shift it by the runtime's timezone offset.
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
  if (iso) return iso[1];
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return DEDUPE_NULL_DOCUMENT_DATE;
  return parsed.toISOString().slice(0, 10);
}

/**
 * The application-side mirror of the database unique index. Useful for a fast
 * pre-check that gives the user a good error before the insert, and for tests.
 *
 * This is NOT the enforcement point. The index is.
 */
export function buildDedupeKey(input: DedupeKeyInput): string {
  const number = input.documentNumber?.trim() || DEDUPE_NULL_DOCUMENT_NUMBER;
  const date = normalizeDocumentDate(input.documentDate);
  return [input.tenantId, input.contentHash, number, date].join('|');
}

/** True when two imports would collide under `document_imports_dedupe_key`. */
export function isDuplicateOf(a: DedupeKeyInput, b: DedupeKeyInput): boolean {
  return buildDedupeKey(a) === buildDedupeKey(b);
}

/**
 * Postgres unique-violation code. The dedupe path catches this rather than
 * pre-checking, because only the database sees concurrent inserts.
 */
export const PG_UNIQUE_VIOLATION = 'P2002';

export function isDedupeViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; meta?: { target?: unknown } };
  if (e.code !== PG_UNIQUE_VIOLATION) return false;
  const target = e.meta?.target;
  const asText = Array.isArray(target) ? target.join(',') : String(target ?? '');
  // Prisma reports either the index name or the column list depending on driver.
  return asText.includes('dedupe') || asText.includes('content_hash');
}
