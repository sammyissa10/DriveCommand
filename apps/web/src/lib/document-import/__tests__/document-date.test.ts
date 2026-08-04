/**
 * The document's date, from the page to the card.
 *
 * WHAT WAS BROKEN. The extraction prompt asked for `documentDate` and never
 * said in what format, so the model returned it exactly as the page printed it.
 * Every import in the table proves it — the manifest run stored
 * `raw_extraction.header.documentDate = "07/27/26"`, the rate confirmation
 * stored `"08/03/26"`, and the `document_date` COLUMN was NULL on both, because
 * `parseDocumentDate` accepted `^\d{4}-\d{2}-\d{2}` and nothing else. The Zod
 * schema was never the problem (`z.string().nullish()` keeps any string) and
 * neither was the card, which read the right field of an empty column.
 *
 * So: the prompt now demands ISO, and this parser accepts what documents
 * actually print — the second half matters because a model will still echo the
 * printed form, and because the imports already taken only carry that form.
 */

import { describe, expect, it } from 'vitest';
import { parseDocumentDate } from '../persistence';

/** `YYYY-MM-DD` back out, so an assertion reads like the document. */
function iso(value: string | null | undefined): string | null {
  const d = parseDocumentDate(value);
  return d ? d.toISOString().slice(0, 10) : null;
}

describe('parseDocumentDate', () => {
  it('reads the exact strings the live imports stored', () => {
    // From document_imports.raw_extraction on the two walkthrough imports.
    expect(iso('07/27/26')).toBe('2026-07-27');
    expect(iso('08/03/26')).toBe('2026-08-03');
  });

  it('still reads ISO, which is what the prompt now asks for', () => {
    expect(iso('2026-07-27')).toBe('2026-07-27');
    expect(iso('2026-07-27T00:00:00.000Z')).toBe('2026-07-27');
  });

  it('reads the other printed separators and a four-digit year', () => {
    expect(iso('7/27/26')).toBe('2026-07-27');
    expect(iso('07-27-2026')).toBe('2026-07-27');
    expect(iso('07.27.2026')).toBe('2026-07-27');
  });

  it('treats a slashed date as month-first, US freight convention', () => {
    // Not 3 August. Every document this module reads is a US carrier's.
    expect(iso('03/08/26')).toBe('2026-03-08');
  });

  it('splits two-digit years at 80', () => {
    expect(iso('01/01/79')).toBe('2079-01-01');
    expect(iso('01/01/80')).toBe('1980-01-01');
  });

  it('never lands at the wrong instant, whatever the runtime timezone is', () => {
    // A date-only column. Parsing through local time is how "27 July" becomes
    // "26 July" for anyone west of UTC.
    const d = parseDocumentDate('07/27/26')!;
    expect(d.toISOString()).toBe('2026-07-27T00:00:00.000Z');
    expect(d.getUTCHours()).toBe(0);
  });

  it('returns null rather than guessing', () => {
    expect(parseDocumentDate(null)).toBeNull();
    expect(parseDocumentDate('')).toBeNull();
    expect(parseDocumentDate('   ')).toBeNull();
    expect(parseDocumentDate('Manifest')).toBeNull();
    expect(parseDocumentDate('27 July 2026')).toBeNull();
  });

  it('rejects a date that is not a date, rather than rolling it over', () => {
    // new Date() would turn these into March and February. A document number
    // misread as a date must not silently become a plausible one.
    expect(parseDocumentDate('02/31/26')).toBeNull();
    expect(parseDocumentDate('13/01/26')).toBeNull();
    expect(parseDocumentDate('00/10/26')).toBeNull();
    expect(parseDocumentDate('07/00/26')).toBeNull();
  });
});
