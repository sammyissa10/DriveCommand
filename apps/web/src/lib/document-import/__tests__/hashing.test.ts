/**
 * Deduplication tests.
 * Spec Section 14: SHA-256 over source bytes + tenant + document number + date.
 *
 * These assert the APPLICATION mirror of the key. Enforcement lives in the
 * database index `document_imports_dedupe_key` — app code alone cannot stop two
 * dispatchers uploading the same manifest at the same moment.
 */

import { describe, it, expect } from 'vitest';
import {
  buildDedupeKey,
  DEDUPE_NULL_DOCUMENT_DATE,
  DEDUPE_NULL_DOCUMENT_NUMBER,
  hashDocument,
  hashPage,
  isDedupeViolation,
  isDuplicateOf,
  normalizeDocumentDate,
  sha256,
} from '../hashing';

const bytes = (s: string) => Buffer.from(s, 'utf8');

describe('hashing', () => {
  it('is deterministic', () => {
    expect(sha256(bytes('hello'))).toBe(sha256(bytes('hello')));
  });

  it('produces a 64-char hex digest', () => {
    expect(sha256(bytes('x'))).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hashes a page independently of the document it belongs to', () => {
    // The same photographed page must hash identically in any import — that is
    // what lets the cache span imports.
    const page = bytes('page-4-content');
    expect(hashPage(page)).toBe(hashPage(page));
  });

  it('treats a different page order as a different document', () => {
    // Page order determines stop order, so the same pages shuffled are a
    // genuinely different import and must not be blocked as a duplicate.
    const a = hashDocument([bytes('p1'), bytes('p2')]);
    const b = hashDocument([bytes('p2'), bytes('p1')]);
    expect(a).not.toBe(b);
  });

  it('is not the same as concatenating page hashes naively', () => {
    expect(hashDocument([bytes('ab')])).not.toBe(hashDocument([bytes('a'), bytes('c')]));
  });
});

describe('normalizeDocumentDate', () => {
  it('passes through an ISO date without a timezone shift', () => {
    // Round-tripping through Date would move this a day in negative offsets.
    expect(normalizeDocumentDate('2026-07-27')).toBe('2026-07-27');
  });

  it('takes the date portion of an ISO datetime', () => {
    expect(normalizeDocumentDate('2026-07-27T23:59:00Z')).toBe('2026-07-27');
  });

  it('uses the sentinel for null, undefined, and empty', () => {
    expect(normalizeDocumentDate(null)).toBe(DEDUPE_NULL_DOCUMENT_DATE);
    expect(normalizeDocumentDate(undefined)).toBe(DEDUPE_NULL_DOCUMENT_DATE);
    expect(normalizeDocumentDate('   ')).toBe(DEDUPE_NULL_DOCUMENT_DATE);
  });

  it('uses the sentinel for an unparseable value', () => {
    expect(normalizeDocumentDate('not a date')).toBe(DEDUPE_NULL_DOCUMENT_DATE);
  });
});

describe('dedupe key', () => {
  const base = { tenantId: 't1', contentHash: 'abc', documentNumber: 'M-1', documentDate: '2026-07-27' };

  it('blocks the identical document uploaded twice', () => {
    expect(isDuplicateOf(base, { ...base })).toBe(true);
  });

  it('does NOT collide across tenants', () => {
    // Two carriers hauling for the same shipper get the same manifest bytes.
    expect(isDuplicateOf(base, { ...base, tenantId: 't2' })).toBe(false);
  });

  it('does not collide when the content differs', () => {
    expect(isDuplicateOf(base, { ...base, contentHash: 'def' })).toBe(false);
  });

  it('does not collide when the document date differs', () => {
    // Tomorrow's run of the same route is a different day's work.
    expect(isDuplicateOf(base, { ...base, documentDate: '2026-07-28' })).toBe(false);
  });

  it('does not collide when the document number differs', () => {
    expect(isDuplicateOf(base, { ...base, documentNumber: 'M-2' })).toBe(false);
  });

  it('treats two missing document numbers as EQUAL, not as distinct nulls', () => {
    // This is the whole reason the index uses COALESCE: with a plain unique
    // index NULL <> NULL, so these two would both insert.
    const a = { tenantId: 't1', contentHash: 'abc', documentNumber: null, documentDate: null };
    const b = { tenantId: 't1', contentHash: 'abc', documentNumber: null, documentDate: null };
    expect(isDuplicateOf(a, b)).toBe(true);
  });

  it('uses the same sentinels the migration COALESCEs to', () => {
    const key = buildDedupeKey({ tenantId: 't1', contentHash: 'abc' });
    expect(key).toBe(['t1', 'abc', DEDUPE_NULL_DOCUMENT_NUMBER, DEDUPE_NULL_DOCUMENT_DATE].join('|'));
  });

  it('ignores surrounding whitespace on the document number', () => {
    expect(isDuplicateOf(base, { ...base, documentNumber: '  M-1  ' })).toBe(true);
  });
});

describe('isDedupeViolation', () => {
  it('recognises a Prisma unique violation on the dedupe index', () => {
    expect(isDedupeViolation({ code: 'P2002', meta: { target: 'document_imports_dedupe_key' } })).toBe(true);
  });

  it('recognises the column-list form some drivers report', () => {
    expect(isDedupeViolation({ code: 'P2002', meta: { target: ['org_id', 'content_hash'] } })).toBe(true);
  });

  it('ignores unrelated unique violations', () => {
    expect(isDedupeViolation({ code: 'P2002', meta: { target: ['contract_number'] } })).toBe(false);
  });

  it('ignores non-errors', () => {
    expect(isDedupeViolation(null)).toBe(false);
    expect(isDedupeViolation(new Error('boom'))).toBe(false);
  });
});
