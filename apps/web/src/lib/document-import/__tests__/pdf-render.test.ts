/**
 * PDF → per-page image rendering.
 *
 * The property that actually matters here is DETERMINISM. The per-page cache is
 * keyed on the SHA-256 of the rendered bytes, so if rendering the same PDF twice
 * produces different pixels, no PDF page ever cache-hits and the whole point of
 * the change is lost. That is asserted directly rather than assumed.
 *
 * The fixture is built in-process rather than committed as a binary: a checked-in
 * PDF is an opaque blob that nobody can review, and a generated one states its
 * own page count in the code that asserts it.
 */

import { describe, expect, it } from 'vitest';
import { hashPage } from '../hashing';
import {
  countPdfPages,
  MAX_PDF_PAGES,
  PdfPageLimitError,
  renderPdfPages,
  TARGET_LONG_EDGE_PX,
} from '../pdf-render';

// ---------------------------------------------------------------------------
// A minimal, valid, multi-page PDF
// ---------------------------------------------------------------------------

/**
 * Build an `n`-page PDF with one line of text per page.
 *
 * Byte offsets in the xref table are computed as the body is assembled, because
 * a hand-written table drifts the moment any object above it changes length.
 */
function buildPdf(pageCount: number): Buffer {
  const objects: string[] = [];
  const kids: string[] = [];

  // Object numbering: 1 = catalog, 2 = pages, 3 = font, then a page object and
  // a content stream per page.
  const fontRef = 3;
  for (let i = 0; i < pageCount; i++) {
    const pageObj = 4 + i * 2;
    kids.push(`${pageObj} 0 R`);
  }

  objects[1] = `<</Type/Catalog/Pages 2 0 R>>`;
  objects[2] = `<</Type/Pages/Kids[${kids.join(' ')}]/Count ${pageCount}>>`;
  objects[fontRef] = `<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>`;

  for (let i = 0; i < pageCount; i++) {
    const pageObj = 4 + i * 2;
    const contentObj = pageObj + 1;
    const text = `BT /F1 36 Tf 72 700 Td (Page ${i + 1} of ${pageCount}) Tj ET`;

    objects[pageObj] =
      `<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]` +
      `/Resources<</Font<</F1 ${fontRef} 0 R>>>>/Contents ${contentObj} 0 R>>`;
    objects[contentObj] = `<</Length ${text.length}>>\nstream\n${text}\nendstream`;
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
  for (let n = 1; n <= maxObj; n++) {
    xref += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<</Size ${maxObj + 1}/Root 1 0 R>>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(body + xref, 'latin1');
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

// ---------------------------------------------------------------------------

describe('countPdfPages', () => {
  it('reads the real page count out of a multi-page document', async () => {
    expect(await countPdfPages(buildPdf(3))).toBe(3);
    expect(await countPdfPages(buildPdf(1))).toBe(1);
  });
});

describe('renderPdfPages', () => {
  it('produces one PNG per page, numbered in document order', async () => {
    const pages = await renderPdfPages(buildPdf(3));

    expect(pages).toHaveLength(3);
    expect(pages.map((p) => p.pageNumber)).toEqual([1, 2, 3]);
    for (const p of pages) {
      expect(p.bytes.subarray(0, 4)).toEqual(PNG_MAGIC);
      expect(p.bytes.length).toBeGreaterThan(0);
    }
  });

  it('scales the long edge to the pinned target', async () => {
    const [page] = await renderPdfPages(buildPdf(1));
    // 612x792pt letter — the height is the long edge.
    expect(Math.max(page.width, page.height)).toBe(TARGET_LONG_EDGE_PX);
  });

  it('renders byte-identically across runs, so page hashes are stable', async () => {
    // THE cache-correctness property. Two independent renders of the same bytes
    // must hash the same, or re-uploading a PDF re-bills every page.
    const first = await renderPdfPages(buildPdf(3));
    const second = await renderPdfPages(buildPdf(3));

    expect(first.map((p) => hashPage(p.bytes))).toEqual(second.map((p) => hashPage(p.bytes)));
  });

  it('gives each page of a document a distinct hash', async () => {
    // Pages that differ only by their text must not collide, or page 2 would
    // serve page 1's cached extraction.
    const pages = await renderPdfPages(buildPdf(3));
    const hashes = new Set(pages.map((p) => hashPage(p.bytes)));
    expect(hashes.size).toBe(3);
  });

  it('actually draws the text, rather than rendering a blank white page', async () => {
    // Regression guard for a silent, expensive failure mode. The fixture uses
    // Helvetica — one of the fourteen standard fonts a PDF may reference without
    // embedding. If pdfjs is not given `standardFontDataUrl` it drops that text
    // and emits a page that is uniformly white: the render "succeeds", the model
    // is billed, and the user is told their manifest contained no stops.
    //
    // Measured as ink coverage rather than by eye: a blank page has a mean
    // channel value of exactly 255.
    const sharp = (await import('sharp')).default;
    const [page] = await renderPdfPages(buildPdf(1));

    const { channels } = await sharp(page.bytes).stats();
    const meanLuma = channels.slice(0, 3).reduce((n, c) => n + c.mean, 0) / 3;

    expect(meanLuma).toBeLessThan(255);
    expect(meanLuma).toBeGreaterThan(200); // mostly white page with a line of text
  });

  it('refuses a document over the page ceiling rather than billing for it', async () => {
    await expect(renderPdfPages(buildPdf(MAX_PDF_PAGES + 1))).rejects.toBeInstanceOf(
      PdfPageLimitError,
    );
  });
});
