/**
 * PDF → per-page raster images, server-side.
 *
 * Spec: docs/specs/DocumentImport_TechnicalSpec_v1.md Section 14, Phase 1 item 3
 * — "split PDFs into pages, normalise, hash each page independently, cache per
 * page hash".
 *
 * WHY RASTERISE RATHER THAN SPLIT INTO PER-PAGE PDFs.
 *
 * Splitting a PDF into N single-page PDFs needs a PDF *writer* that can import
 * pages — `pdf-lib`'s `copyPages`, or equivalent. Nothing installed can do it:
 * `@react-pdf/pdfkit` writes PDFs but cannot import existing pages, and
 * `pdf-lib` is not a dependency of this monorepo. Rasterising needs only a
 * reader plus a canvas, and both are already here — `pdfjs-dist` is a direct
 * dependency of `apps/web`, and `@napi-rs/canvas` ships as its own optional
 * dependency for exactly this purpose. No new dependency is added.
 *
 * Rasterising is also the better fit for what this module does. A rendered page
 * is a PNG, which is precisely what a photographed page is, so a PDF page and a
 * phone photo become the same kind of thing the moment they enter the pipeline:
 * one extraction path, one cache, one page row, one thumbnail, one per-page
 * object a driver can later be served. The previous whole-PDF strategy made the
 * PDF a permanent special case in every one of those.
 *
 * DETERMINISM IS THE LOAD-BEARING PROPERTY.
 *
 * The per-page cache is keyed on the SHA-256 of these bytes, so re-uploading the
 * same PDF must produce byte-identical renders or nothing ever cache-hits.
 * `pdfjs-dist` rendering plus `@napi-rs/canvas` PNG encoding is deterministic for
 * a fixed input and a fixed scale — verified across separate processes.
 *
 * That is why `TARGET_LONG_EDGE_PX` is a pinned constant and not a tunable.
 * Changing it silently invalidates every cached PDF page in every tenant. If it
 * ever has to change, that is a deliberate cache eviction, not a tweak.
 */

import { createRequire } from 'module';
import { dirname, join } from 'path';
import { logger, serializeError } from '@/lib/logger';

/**
 * Long edge of a rendered page, in pixels.
 *
 * PINNED — see the determinism note above. Sized just over the point where the
 * vision API downscales anyway (~1568px), so it buys maximum legible detail
 * without paying to upload pixels that get thrown away. For a letter page that
 * is roughly 145 DPI, comfortably enough for machine-printed manifest text.
 */
export const TARGET_LONG_EDGE_PX = 1600;

/**
 * Hard ceiling on pages taken from a single PDF.
 *
 * Not a decompression-bomb guard — `validatePdfPageCount` covers that. This is a
 * spend guard: every page here becomes its own billed model call, so a
 * mistakenly-uploaded 400-page document would quietly cost 400 extractions. The
 * user gets told the number and asked to split the file instead.
 */
export const MAX_PDF_PAGES = 50;

export class PdfPageLimitError extends Error {
  readonly pageCount: number;
  constructor(pageCount: number) {
    super(
      `That PDF has ${pageCount} pages, and the limit is ${MAX_PDF_PAGES}. ` +
        `Split it into smaller files and upload them separately.`,
    );
    this.name = 'PdfPageLimitError';
    this.pageCount = pageCount;
  }
}

export interface RenderedPdfPage {
  /** 1-based, in document order. */
  pageNumber: number;
  /** PNG bytes. Always `image/png`. */
  bytes: Buffer;
  width: number;
  height: number;
}

/**
 * `pdfjs-dist` is ESM-only and pulls in a native canvas binding, so it is loaded
 * lazily and kept out of the module graph of anything that merely imports this
 * file. `next.config.ts` lists both packages in `serverExternalPackages` so the
 * bundler leaves them alone rather than trying to trace the `.node` binary.
 */
async function loadPdfjs() {
  return import('pdfjs-dist/legacy/build/pdf.mjs');
}

/**
 * Where pdfjs's own font and character-map assets live on disk.
 *
 * These are NOT optional. The PDF format lets a document reference the fourteen
 * standard fonts (Helvetica, Times, Courier…) without embedding them, on the
 * understanding that the reader supplies them. Without this pdfjs logs
 * "Ensure that the `standardFontDataUrl` API parameter is provided" and renders
 * that text as nothing — so a typed rate confirmation, which is exactly the kind
 * of PDF that arrives by email, would rasterise to a blank white page, extract
 * to zero consignments, and tell the user their document had no stops in it.
 * Scanned manifests would have kept working, which is what would have made this
 * a slow, confusing bug rather than an obvious one.
 *
 * Resolved through the package's own `package.json` rather than assembled from
 * `node_modules` by hand, so it stays correct under pnpm, hoisting, and a
 * bundled serverless deployment.
 *
 * These are filesystem PATHS, not `file://` URLs, despite the parameters being
 * named `...Url`. Under Node pdfjs concatenates the asset filename onto the
 * string and hands the result to `fs.readFile`, which rejects a `file://` URL —
 * so a URL here fails to load every font while looking perfectly reasonable.
 * Forward slashes and a trailing separator, because it is string concatenation
 * on the other side, not a path join.
 */
function pdfjsAssetPaths(): { standardFontDataUrl: string; cMapUrl: string } {
  const require_ = createRequire(import.meta.url);
  const root = dirname(require_.resolve('pdfjs-dist/package.json'));
  const asPath = (segment: string) => `${join(root, segment).replace(/\\/g, '/')}/`;
  return { standardFontDataUrl: asPath('standard_fonts'), cMapUrl: asPath('cmaps') };
}

/**
 * Open a PDF with the settings this module always uses.
 *
 * `useSystemFonts: false` keeps the render independent of whatever fonts happen
 * to be installed on the host. That is a determinism requirement, not a
 * preference: the same PDF must render identically on a developer's Windows box
 * and in a Linux serverless function, or the two produce different page hashes
 * for the same document and the cache never hits.
 *
 * There is deliberately no `isEvalSupported: false` here. That option is gone in
 * pdfjs v5 — the eval-based path it disabled was removed from the library — so
 * passing it is now a type error and, more to the point, a no-op.
 */
async function openDocument(pdf: Buffer) {
  const pdfjs = await loadPdfjs();
  return pdfjs.getDocument({
    // A fresh Uint8Array: pdfjs takes ownership of the buffer it is given and
    // will detach it, which would corrupt a Buffer the caller still holds.
    data: new Uint8Array(pdf),
    useSystemFonts: false,
    ...pdfjsAssetPaths(),
  }).promise;
}

/** Page count without rendering anything. */
export async function countPdfPages(pdf: Buffer): Promise<number> {
  const doc = await openDocument(pdf);
  try {
    return doc.numPages;
  } finally {
    await doc.destroy();
  }
}

/**
 * Render every page of a PDF to a PNG.
 *
 * Throws `PdfPageLimitError` when the document is over `MAX_PDF_PAGES`; the
 * caller turns that into a plain-language rejection. Any other throw means the
 * renderer itself is unavailable, and callers are expected to fall back to
 * handing the PDF to the model whole rather than failing the import — see
 * `materialise.ts`.
 */
export async function renderPdfPages(pdf: Buffer): Promise<RenderedPdfPage[]> {
  const doc = await openDocument(pdf);

  try {
    if (doc.numPages > MAX_PDF_PAGES) throw new PdfPageLimitError(doc.numPages);

    const { createCanvas } = await import('@napi-rs/canvas');
    const out: RenderedPdfPage[] = [];

    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      try {
        const unscaled = page.getViewport({ scale: 1 });
        const longEdge = Math.max(unscaled.width, unscaled.height);
        // Guard against a malformed page box reporting zero, which would make
        // the scale Infinity and the canvas allocation throw.
        const scale = longEdge > 0 ? TARGET_LONG_EDGE_PX / longEdge : 1;
        const viewport = page.getViewport({ scale });

        const width = Math.max(1, Math.ceil(viewport.width));
        const height = Math.max(1, Math.ceil(viewport.height));
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // PDF pages have no background of their own. Without this the canvas
        // stays transparent and black text renders onto transparent pixels,
        // which flattens to black-on-black in most viewers and reads as a
        // blank page to the model.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        await page.render({
          canvasContext: ctx as unknown as CanvasRenderingContext2D,
          viewport,
          canvas: canvas as unknown as HTMLCanvasElement,
        }).promise;

        out.push({ pageNumber: n, bytes: canvas.toBuffer('image/png'), width, height });
      } finally {
        page.cleanup();
      }
    }

    return out;
  } finally {
    await doc.destroy();
  }
}

/**
 * `renderPdfPages` that reports unavailability instead of throwing it.
 *
 * Distinguishes the two failures that need different handling: a document that
 * is simply too big (the user can act on that, so it propagates) from a renderer
 * that would not load at all (the user cannot act on that, so the caller
 * degrades to the whole-PDF path instead of failing an import over it).
 */
export async function tryRenderPdfPages(
  pdf: Buffer,
  context: Record<string, unknown> = {},
): Promise<RenderedPdfPage[] | null> {
  try {
    return await renderPdfPages(pdf);
  } catch (err) {
    if (err instanceof PdfPageLimitError) throw err;
    logger.warn('[document-import] PDF page rendering unavailable; falling back to whole-PDF', {
      ...context,
      err: serializeError(err),
    });
    return null;
  }
}
