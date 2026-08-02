/**
 * Source file → ordered pages.
 *
 * Spec: docs/specs/DocumentImport_TechnicalSpec_v1.md Section 14, Phase 1 item 3.
 *
 * PDF STRATEGY (audit D5, option A).
 * A PDF is handed to the model whole, as one "page" unit, using the `document`
 * content block that `ai-documents.ts` already proves works. It is NOT
 * rasterised into per-page images.
 *
 * Why: `pdfjs-dist` is present but the repo only uses it inside a try/catch with
 * a documented "pdfjs-dist has Next.js compatibility issues" comment
 * (lib/storage/validate.ts:171-195). Putting it on the extraction hot path would
 * be the single least-proven thing in this phase.
 *
 * The cost: per-PAGE caching does not apply to PDFs — the whole PDF is one cache
 * unit. Per-page caching does apply to photos, where each photo genuinely is one
 * page, and photos are the 5:30am flow the module exists for. Revisit if
 * per-page PDF caching turns out to matter (see 01-SUMMARY.md).
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
}

/** One unit of extraction work. For photos, one page. For a PDF, the whole file. */
export interface SourcePage {
  pageNumber: number;
  mimeType: string;
  bytes: Buffer;
  hash: string;
  storageKey?: string | null;
  /** True when this unit is a multi-page PDF rather than a single page. */
  isMultiPage: boolean;
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
    });
  }

  return pages;
}
