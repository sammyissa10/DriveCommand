/**
 * Source file → ordered pages.
 *
 * Spec: docs/specs/DocumentImport_TechnicalSpec_v1.md Section 14, Phase 1 item 3.
 *
 * PDF STRATEGY — superseded.
 *
 * Phase 1 handed a PDF to the model whole, as a single "page" unit, on the
 * grounds that `pdfjs-dist` was unproven on this hot path. That worked, because
 * the model reads PDFs natively — and it is precisely why the gap stayed hidden:
 * a three-page PDF extracted correctly while producing ONE page row, ONE generic
 * "1 page" thumbnail, and no per-page cache entries at all. The spec requirement
 * — split, normalise, hash each page independently, cache per page hash — was
 * met for photos and quietly unmet for every PDF.
 *
 * PDFs are now rasterised to one PNG per page BEFORE they reach this function,
 * by `materialise.ts`. By the time `toPages` runs, a three-page PDF has already
 * become three `image/png` sources, so this function does not special-case PDFs
 * at all — it just numbers and hashes whatever it is given. One path for photos
 * and PDF pages alike, which is the point.
 *
 * `isMultiPage` survives for the fallback case only: if the renderer is
 * unavailable at runtime, `materialise.ts` degrades to passing the PDF through
 * whole rather than failing the import, and that unit is still flagged here.
 */

import { hashPage } from './hashing';

export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const PDF_TYPE = 'application/pdf';
export const SPREADSHEET_TYPES = ['text/csv', 'application/csv'] as const;

export type SourceKind = 'image' | 'pdf' | 'spreadsheet' | 'unsupported';

export interface SourceFile {
  /** Position in the user's chosen order. Photos get reordered in the UI before
   *  extraction, and that order must reach here — it determines stop order. */
  ordinal: number;
  filename: string;
  mimeType: string;
  bytes: Buffer;
  /** Tenant-prefixed storage key, when already uploaded. */
  storageKey?: string | null;
  /**
   * True when this source is a page rendered out of a PDF rather than something
   * the user photographed.
   *
   * Carried purely so the failure copy stays honest (DEC-6): a rendered page is
   * an `image/png` and therefore indistinguishable from a photo by MIME type,
   * and telling a dispatcher to "take a clearer photo" of a PDF they were
   * emailed is an instruction they cannot follow.
   */
  fromPdf?: boolean;
}

/** One unit of extraction work — one page, whether photographed or rendered. */
export interface SourcePage {
  pageNumber: number;
  mimeType: string;
  bytes: Buffer;
  hash: string;
  storageKey?: string | null;
  /**
   * True only for a whole PDF passed through unsplit, which happens solely on
   * the renderer-unavailable fallback path in `materialise.ts`.
   */
  isMultiPage: boolean;
  /** True when this page was rendered from a PDF. See `SourceFile.fromPdf`. */
  fromPdf: boolean;
}

export function classify(mimeType: string): SourceKind {
  const m = mimeType.toLowerCase().split(';')[0].trim();
  if ((SUPPORTED_IMAGE_TYPES as readonly string[]).includes(m)) return 'image';
  if (m === PDF_TYPE) return 'pdf';
  if ((SPREADSHEET_TYPES as readonly string[]).includes(m)) return 'spreadsheet';
  return 'unsupported';
}

/**
 * XLSX is deliberately unsupported in v1 — no spreadsheet library is installed
 * in either app and the module may not add one (audit C14/D1). Detected here so
 * the user gets a plain-language message naming CSV, rather than a MIME error.
 */
export const XLSX_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
] as const;

export function isUnsupportedSpreadsheet(mimeType: string): boolean {
  const m = mimeType.toLowerCase().split(';')[0].trim();
  return (XLSX_TYPES as readonly string[]).includes(m);
}

/**
 * Turn ordered source files into ordered extraction units.
 *
 * Page numbers are 1-based and assigned by source order, which is the order the
 * user arranged the thumbnails in. Spec Section 14: "Photos out of order — sort
 * by page number, else user reorders first."
 */
export function toPages(sources: SourceFile[]): SourcePage[] {
  const ordered = [...sources].sort((a, b) => a.ordinal - b.ordinal);
  const pages: SourcePage[] = [];

  let pageNumber = 1;
  for (const src of ordered) {
    const kind = classify(src.mimeType);
    if (kind === 'spreadsheet' || kind === 'unsupported') continue;

    pages.push({
      pageNumber: pageNumber++,
      mimeType: kind === 'pdf' ? PDF_TYPE : src.mimeType.toLowerCase().split(';')[0].trim(),
      bytes: src.bytes,
      hash: hashPage(src.bytes),
      storageKey: src.storageKey ?? null,
      isMultiPage: kind === 'pdf',
      // A whole PDF is trivially PDF-derived; a rendered page says so itself.
      fromPdf: kind === 'pdf' || src.fromPdf === true,
    });
  }

  return pages;
}
