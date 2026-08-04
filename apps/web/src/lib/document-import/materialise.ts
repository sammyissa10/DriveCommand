/**
 * Source files → per-page source files.
 *
 * Spec: docs/specs/DocumentImport_TechnicalSpec_v1.md Section 14, Phase 1 item 3
 * — "split PDFs into pages, normalise, hash each page independently, cache per
 * page hash".
 *
 * This is the one place a PDF stops being a PDF. Every page of a PDF is rendered
 * to a PNG, stored as its own object, and handed onward as an ordinary image
 * source. Photos and CSVs pass through untouched.
 *
 * WHY IT RUNS AT INTAKE, NOT AT EXTRACTION.
 *
 * `document_imports.source_file_keys` is an ordered array of storage keys, and
 * its LENGTH is what the UI counts and its ORDER is the page order. Expanding
 * the PDF before that row is written means the array holds three keys for a
 * three-page PDF, and every downstream consumer is correct without knowing that
 * PDFs exist:
 *
 *   - the page count says 3, not 1
 *   - each entry has an `image/png` key, so `summariseImport` mints a real
 *     signed thumbnail URL per page instead of the null it returns for a PDF
 *   - `loadSources` → `toPages` yields three independently hashed pages
 *   - each page extracts through the image path photos already use
 *   - `writePageOutcome` writes three rows, each with its own `storage_key`,
 *     which is the per-page object a later phase serves to a driver
 *   - re-shooting page 2 of a PDF replaces one array slot, exactly as for photos
 *
 * Doing it at extraction time instead would leave the row — and therefore the
 * staging screen and the page strip — still claiming one page.
 *
 * NO SCHEMA CHANGE. `source_file_keys` is already `String[]`, and
 * `document_import_pages.storage_key` already exists. The original filename and
 * MIME type are preserved on the row through `originalName` / `sourceMimeType`
 * so the UI can still say "manifest-3page.pdf" over a strip of three pages.
 */

import { nanoid } from 'nanoid';
import { logger } from '@/lib/logger';
import { putObjectBytes } from '@/lib/storage/object-bytes';
import { assertTenantKey } from '@/lib/storage/tenant-key';
import { classify, type SourceFile } from './pages';
import { PdfPageLimitError, tryRenderPdfPages } from './pdf-render';

export { PdfPageLimitError };

/** Storage key for one rendered page. Same convention as `generateUploadUrl`. */
export function renderedPageKey(
  orgId: string,
  baseName: string,
  pageNumber: number,
  totalPages: number,
): string {
  // Zero-padded so the keys of a ten-page document sort in page order in any
  // bucket listing, which is the only place a human ever sees these.
  const width = String(totalPages).length;
  const suffix = String(pageNumber).padStart(width, '0');
  return `tenant-${orgId}/imports/${nanoid()}-${baseName}-p${suffix}.png`;
}

/** `manifest-3page.pdf` → `manifest-3page`. Keeps the rendered keys readable. */
export function baseNameOf(filename: string): string {
  const withoutExt = filename.replace(/\.[^.]+$/, '');
  const cleaned = withoutExt.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned.slice(0, 60) || 'document';
}

export interface MaterialiseResult {
  /** Expanded, re-ordinalled sources. Ready for `toPages`. */
  sources: SourceFile[];
  /** True when at least one PDF was split into pages. */
  expanded: boolean;
  /**
   * True when a PDF was left whole because the renderer would not load.
   * The import still runs; it just runs the Phase 1 way for that file.
   */
  degraded: boolean;
}

/**
 * Expand every PDF in `sources` into one image source per page.
 *
 * Ordinals are reassigned across the whole expanded list, so page numbering
 * stays contiguous and in the user's chosen order when a PDF sits between two
 * photos.
 *
 * Throws `PdfPageLimitError` for a document over the page ceiling — the caller
 * turns that into a plain-language rejection. A renderer that will not load is
 * NOT an error: that file is passed through whole, which is exactly what Phase 1
 * did, and the import proceeds.
 */
export async function materialisePages(
  orgId: string,
  sources: SourceFile[],
): Promise<MaterialiseResult> {
  const ordered = [...sources].sort((a, b) => a.ordinal - b.ordinal);
  const out: SourceFile[] = [];
  let expanded = false;
  let degraded = false;

  for (const src of ordered) {
    if (classify(src.mimeType) !== 'pdf') {
      out.push({ ...src, ordinal: out.length });
      continue;
    }

    const rendered = await tryRenderPdfPages(src.bytes, {
      orgId,
      filename: src.filename,
      storageKey: src.storageKey,
    });

    // Renderer unavailable — keep the Phase 1 behaviour rather than fail an
    // import over it. The document still reads; it just reads as one unit.
    if (!rendered) {
      degraded = true;
      out.push({ ...src, ordinal: out.length });
      continue;
    }

    expanded = true;
    const base = baseNameOf(src.filename);

    for (const page of rendered) {
      const key = renderedPageKey(orgId, base, page.pageNumber, rendered.length);
      // Belt and braces: the key is built from `orgId` two lines up, and it is
      // still checked, because this is the value that ends up in a tenant's
      // row and every other storage write in this module is checked too.
      assertTenantKey(key, orgId);
      await putObjectBytes(key, page.bytes, 'image/png');

      out.push({
        ordinal: out.length,
        // Named for the page, not the file, so the page strip reads
        // "manifest-3page-p2.png" rather than three identical rows.
        filename: `${base}-p${page.pageNumber}.png`,
        mimeType: 'image/png',
        bytes: page.bytes,
        storageKey: key,
        fromPdf: true,
      });
    }

    logger.info('[document-import] PDF split into pages', {
      orgId,
      filename: src.filename,
      pageCount: rendered.length,
    });
  }

  return { sources: out, expanded, degraded };
}
