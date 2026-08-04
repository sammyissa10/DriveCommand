/**
 * PDF expansion at intake.
 *
 * Storage is mocked — the property under test is "one PDF becomes N page
 * sources, in order, each with its own object", not S3 behaviour. The live
 * end-to-end path including real R2 writes is exercised by
 * `scripts/test-pdf-import.ts`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// `vi.hoisted` because `vi.mock` is lifted above the imports, so a plain
// top-level const would not exist yet when the factory runs.
const { put } = vi.hoisted(() => ({ put: vi.fn(async () => {}) }));

vi.mock('@/lib/storage/object-bytes', () => ({
  putObjectBytes: put,
  MAX_OBJECT_BYTES: 25 * 1024 * 1024,
  ObjectTooLargeError: class extends Error {},
}));

import { baseNameOf, materialisePages, renderedPageKey } from '../materialise';
import { hashPage } from '../hashing';
import { toPages, type SourceFile } from '../pages';

const ORG = '7e9eca25-1f97-46ed-9365-e67be49436d5';

/** Same minimal-PDF builder as `pdf-render.test.ts`, kept local on purpose. */
function buildPdf(pageCount: number): Buffer {
  const objects: string[] = [];
  const kids: string[] = [];
  for (let i = 0; i < pageCount; i++) kids.push(`${4 + i * 2} 0 R`);

  objects[1] = `<</Type/Catalog/Pages 2 0 R>>`;
  objects[2] = `<</Type/Pages/Kids[${kids.join(' ')}]/Count ${pageCount}>>`;
  objects[3] = `<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>`;

  for (let i = 0; i < pageCount; i++) {
    const pageObj = 4 + i * 2;
    const text = `BT /F1 36 Tf 72 700 Td (Page ${i + 1} of ${pageCount}) Tj ET`;
    objects[pageObj] =
      `<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]` +
      `/Resources<</Font<</F1 3 0 R>>>>/Contents ${pageObj + 1} 0 R>>`;
    objects[pageObj + 1] = `<</Length ${text.length}>>\nstream\n${text}\nendstream`;
  }

  const maxObj = objects.length - 1;
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let n = 1; n <= maxObj; n++) {
    offsets[n] = Buffer.byteLength(body, 'latin1');
    body += `${n} 0 obj\n${objects[n]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(body, 'latin1');
  let xref = `xref\n0 ${maxObj + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= maxObj; n++) xref += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<</Size ${maxObj + 1}/Root 1 0 R>>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(body + xref, 'latin1');
}

function pdfSource(ordinal: number, pages: number, filename = 'manifest.pdf'): SourceFile {
  return { ordinal, filename, mimeType: 'application/pdf', bytes: buildPdf(pages), storageKey: `tenant-${ORG}/imports/x-${filename}` };
}

function photo(ordinal: number, name: string): SourceFile {
  return {
    ordinal,
    filename: name,
    mimeType: 'image/jpeg',
    bytes: Buffer.from(`photo-${name}`, 'utf8'),
    storageKey: `tenant-${ORG}/imports/x-${name}`,
  };
}

beforeEach(() => put.mockClear());

describe('baseNameOf', () => {
  it('strips the extension and anything a storage key should not carry', () => {
    expect(baseNameOf('manifest-3page.pdf')).toBe('manifest-3page');
    expect(baseNameOf('WEST MKE run (1).pdf')).toBe('WEST-MKE-run-1');
  });
});

describe('renderedPageKey', () => {
  it('is tenant-prefixed and zero-padded to sort in page order', () => {
    const key = renderedPageKey(ORG, 'manifest', 2, 12);
    expect(key.startsWith(`tenant-${ORG}/imports/`)).toBe(true);
    expect(key.endsWith('-manifest-p02.png')).toBe(true);
  });
});

describe('materialisePages', () => {
  it('turns a 3-page PDF into 3 image sources, each stored as its own object', async () => {
    const { sources, expanded, degraded } = await materialisePages(ORG, [pdfSource(0, 3)]);

    expect(expanded).toBe(true);
    expect(degraded).toBe(false);
    expect(sources).toHaveLength(3);
    expect(sources.map((s) => s.mimeType)).toEqual(['image/png', 'image/png', 'image/png']);
    expect(sources.map((s) => s.ordinal)).toEqual([0, 1, 2]);
    // Every page is its own object — this is what a later phase serves to a
    // driver when they need page 2 and nothing else.
    expect(put).toHaveBeenCalledTimes(3);
    expect(new Set(sources.map((s) => s.storageKey))).toHaveProperty('size', 3);
  });

  it('marks rendered pages as PDF-derived so the failure copy stays honest', async () => {
    const { sources } = await materialisePages(ORG, [pdfSource(0, 2)]);
    expect(sources.every((s) => s.fromPdf)).toBe(true);
  });

  it('hashes each page independently, and identically on a re-upload', async () => {
    // The cache contract: the same PDF uploaded twice must produce the same
    // per-page hashes, or the second upload re-bills every page.
    const first = await materialisePages(ORG, [pdfSource(0, 3)]);
    const second = await materialisePages(ORG, [pdfSource(0, 3)]);

    const hashesOf = (r: typeof first) => r.sources.map((s) => hashPage(s.bytes));
    expect(hashesOf(first)).toEqual(hashesOf(second));
    expect(new Set(hashesOf(first)).size).toBe(3);
  });

  it('keeps user order when a PDF sits between photos', async () => {
    // The photo after the PDF must land on page 5, not page 3 — page order is
    // stop order downstream, so an off-by-two here reorders a driver's day.
    const { sources } = await materialisePages(ORG, [
      photo(0, 'first.jpg'),
      pdfSource(1, 3),
      photo(2, 'last.jpg'),
    ]);

    expect(sources).toHaveLength(5);
    expect(sources.map((s) => s.filename)).toEqual([
      'first.jpg',
      'manifest-p1.png',
      'manifest-p2.png',
      'manifest-p3.png',
      'last.jpg',
    ]);

    const pages = toPages(sources);
    expect(pages.map((p) => p.pageNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(pages.map((p) => p.fromPdf)).toEqual([false, true, true, true, false]);
  });

  it('leaves photos and CSVs alone', async () => {
    const { sources, expanded } = await materialisePages(ORG, [photo(0, 'a.jpg'), photo(1, 'b.jpg')]);
    expect(expanded).toBe(false);
    expect(sources.map((s) => s.filename)).toEqual(['a.jpg', 'b.jpg']);
    expect(put).not.toHaveBeenCalled();
  });

  it('produces pages that no longer look like a PDF to the extractor', async () => {
    // The point of the whole change: after this, extraction takes the image
    // path photos take. Nothing downstream special-cases PDFs.
    const { sources } = await materialisePages(ORG, [pdfSource(0, 2)]);
    const pages = toPages(sources);

    expect(pages.every((p) => p.mimeType === 'image/png')).toBe(true);
    expect(pages.every((p) => !p.isMultiPage)).toBe(true);
    expect(new Set(pages.map((p) => p.hash)).size).toBe(2);
  });
});
