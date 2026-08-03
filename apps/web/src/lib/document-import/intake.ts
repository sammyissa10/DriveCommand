/**
 * Intake orchestration — the operations behind Phase 2's screens.
 *
 * Spec: docs/specs/DocumentImport_TechnicalSpec_v1.md Sections 4, 14, 15.
 *
 * Every function here takes `orgId` and `userId` explicitly and reads no
 * request context, so the same code serves both surfaces: the web routes
 * (`/api/v1/carrier/document-imports/*`, session cookie) and the mobile routes
 * (`/api/mobile/carrier/owner/document-imports/*`, Bearer token). There is one
 * implementation of "start an import", not two that drift.
 *
 * WHAT THIS PHASE DOES NOT DO: no client resolution, no contract, no template
 * matching, no stop review, no commit. `summariseImport` returns the counts the
 * summary card placeholder shows and nothing more.
 */

import type { CanonicalExtraction } from '@drivecommand/validation';
import { logger } from '@/lib/logger';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';
import { generateDownloadUrl } from '@/lib/storage/presigned';
import { getObjectBytes, ObjectTooLargeError } from '@/lib/storage/object-bytes';
import { assertTenantKey } from '@/lib/storage/tenant-key';
import { hashDocument } from './hashing';
import { classify, isUnsupportedSpreadsheet, type SourceFile } from './pages';
import { extractDocument, type ExtractionUsage } from './service';
import { parseSpreadsheet } from './spreadsheet';
import { prismaPageCache } from './cache';
import type { ImportStatus } from './lifecycle';
import {
  createImport,
  DuplicateImportError,
  failExtraction,
  filenameFromKey,
  findActiveDuplicate,
  finishExtraction,
  getImportPages,
  getImportRecord,
  listRecentImports,
  listResumableImports,
  mimeTypeFromKey,
  replaceSourceFile,
  supersedeImport,
  transitionImport,
  writePageOutcome,
  type ImportRecord,
  type StagedFile,
} from './persistence';

// ---------------------------------------------------------------------------
// Views the UI renders
// ---------------------------------------------------------------------------

export interface ImportPageView {
  pageNumber: number;
  filename: string;
  mimeType: string;
  storageKey: string;
  /** Signed GET url for the thumbnail. Absent for non-image sources. */
  previewUrl: string | null;
  status: 'pending' | 'done' | 'failed';
  failureMessage: string | null;
}

export interface ImportSummaryView {
  consignmentCount: number;
  totalPieces: number | null;
  documentType: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  originName: string | null;
  clientNameOnDocument: string | null;
  warnings: Array<{ code: string; message: string; pageNumbers: number[] }>;
}

export interface ImportView {
  id: string;
  status: ImportStatus;
  originalName: string | null;
  pageCount: number;
  pagesDone: number;
  pagesFailed: number;
  failureCode: string | null;
  failureMessage: string | null;
  createdTripId: string | null;
  createdAt: string;
  updatedAt: string;
  pages: ImportPageView[];
  summary: ImportSummaryView | null;
}

const IMAGE_PREVIEWABLE = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Statuses the UI treats as "still working". */
export const IN_FLIGHT_STATUSES: readonly ImportStatus[] = ['UPLOADED', 'EXTRACTING'];

// ---------------------------------------------------------------------------
// Staging helpers
// ---------------------------------------------------------------------------

/** Rebuild the staged-file list from the row's ordered keys. */
export function stagedFilesFromRecord(record: ImportRecord): StagedFile[] {
  return record.sourceFileKeys.map((key) => ({
    storageKey: key,
    filename: filenameFromKey(key),
    mimeType: mimeTypeFromKey(key),
    sizeBytes: 0,
  }));
}

/**
 * Pull every source file's bytes, in order.
 *
 * Order is the array order of `sourceFileKeys`, which is the order the user
 * arranged the thumbnails in. This is the single point where that order becomes
 * page numbers, and it is why a reorder cannot fail to reach the extractor.
 */
async function loadSources(orgId: string, files: StagedFile[]): Promise<SourceFile[]> {
  const out: SourceFile[] = [];
  for (const [i, f] of files.entries()) {
    assertTenantKey(f.storageKey, orgId);
    const bytes = await getObjectBytes(f.storageKey);
    out.push({
      ordinal: i,
      filename: f.filename,
      mimeType: f.mimeType,
      bytes,
      storageKey: f.storageKey,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Start an import
// ---------------------------------------------------------------------------

export type StartImportMode = 'new' | 'correction';

export interface StartImportInput {
  orgId: string;
  userId: string;
  files: StagedFile[];
  mode?: StartImportMode;
}

export interface StartImportDuplicate {
  ok: false;
  reason: 'DUPLICATE';
  message: string;
  duplicate: {
    importId: string;
    status: ImportStatus;
    originalName: string | null;
    createdAt: string;
    createdTripId: string | null;
  };
}

export interface StartImportSuccess {
  ok: true;
  importId: string;
}

export interface StartImportRejected {
  ok: false;
  reason: 'UNSUPPORTED_XLSX' | 'UNSUPPORTED_TYPE' | 'NO_FILES' | 'TOO_LARGE';
  message: string;
}

export type StartImportResult = StartImportSuccess | StartImportDuplicate | StartImportRejected;

/**
 * Hash the staged bytes, check for a duplicate, create the row.
 *
 * The duplicate check happens BEFORE extraction, not at commit — spec Section
 * 14: "Two dispatchers, same manifest: dedupe blocks at extraction, not
 * commit." Blocking later would mean paying to read a document twice and
 * telling the second dispatcher after they had already reviewed twelve stops.
 */
export async function startImport(input: StartImportInput): Promise<StartImportResult> {
  const { orgId, userId, files, mode = 'new' } = input;

  if (files.length === 0) {
    return { ok: false, reason: 'NO_FILES', message: 'Add at least one photo or file.' };
  }

  const xlsx = files.find((f) => isUnsupportedSpreadsheet(f.mimeType));
  if (xlsx) {
    return {
      ok: false,
      reason: 'UNSUPPORTED_XLSX',
      message: 'Excel files are not supported yet. Save the sheet as CSV and upload that instead.',
    };
  }

  const bad = files.find((f) => classify(f.mimeType) === 'unsupported');
  if (bad) {
    return {
      ok: false,
      reason: 'UNSUPPORTED_TYPE',
      message: `"${bad.filename}" is not a photo, PDF, or CSV.`,
    };
  }

  let contentHash: string;
  try {
    const sources = await loadSources(orgId, files);
    contentHash = hashDocument(sources.map((s) => s.bytes));
  } catch (err) {
    if (err instanceof ObjectTooLargeError) {
      return { ok: false, reason: 'TOO_LARGE', message: err.message };
    }
    throw err;
  }

  const existing = await findActiveDuplicate(orgId, contentHash, userId);

  if (existing && mode === 'new') {
    return {
      ok: false,
      reason: 'DUPLICATE',
      message: existing.createdTripId
        ? 'This document has already been imported and a trip was created from it.'
        : 'This document has already been uploaded.',
      duplicate: {
        importId: existing.id,
        status: existing.status,
        originalName: existing.originalName,
        createdAt: existing.createdAt.toISOString(),
        createdTripId: existing.createdTripId,
      },
    };
  }

  // "Import as a correction" — the earlier import steps aside so this one can
  // take the dedupe key. It is soft-deleted, not removed: the row survives, so
  // a trip already created from it still points at a real import record.
  if (existing && mode === 'correction') {
    await supersedeImport(orgId, userId, existing.id);
    logger.info('[document-import] superseded by correction', {
      supersededImportId: existing.id,
      contentHash,
    });
  }

  try {
    const record = await createImport({ orgId, userId, files, contentHash });
    return { ok: true, importId: record.id };
  } catch (err) {
    // Lost the race to a concurrent upload of the same bytes. Re-read and
    // report it as the duplicate it is.
    if (err instanceof DuplicateImportError) {
      const raced = await findActiveDuplicate(orgId, contentHash, userId);
      if (raced) {
        return {
          ok: false,
          reason: 'DUPLICATE',
          message: 'Someone else just uploaded this same document.',
          duplicate: {
            importId: raced.id,
            status: raced.status,
            originalName: raced.originalName,
            createdAt: raced.createdAt.toISOString(),
            createdTripId: raced.createdTripId,
          },
        };
      }
    }
    throw err;
  }
}

/*
 * NOTE — there is no server-side reorder.
 *
 * Reordering happens entirely in the staging screen, BEFORE the import row is
 * created: the client arranges thumbnails, then posts the keys in that order.
 * The array it posts is the array that gets stored, so there is nothing to
 * reorder afterwards and no second code path that could disagree with the
 * first. Once a document has been read, changing the page order would change
 * the stop order under an extraction that was done against the old one, which
 * is not a reorder — it is a different document, and it should be a new import.
 */

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

/** How long an EXTRACTING import may sit untouched before it counts as stalled. */
export const STALE_EXTRACTION_MS = 3 * 60 * 1000;

export interface RunExtractionResult {
  ok: boolean;
  status: ImportStatus;
  code?: string;
  message?: string;
}

/**
 * Read the document and persist the result.
 *
 * Safe to call again on the same import. That is the whole backgrounding story:
 * this writes each page row as it settles, so a run killed halfway leaves the
 * pages that landed behind it, and the next call re-reads only what is missing
 * — the per-page cache serves the rest for free.
 *
 * A run that is genuinely still in flight is left alone rather than doubled up.
 */
export async function runExtraction(
  orgId: string,
  userId: string,
  importId: string,
): Promise<RunExtractionResult> {
  const record = await getImportRecord(orgId, importId, userId);
  if (!record) return { ok: false, status: 'FAILED', message: 'Import not found.' };

  // Only these four have a legal edge to EXTRACTING. Anything else — READY,
  // COMMITTING, COMMITTED, CANCELLED — would make `assertTransition` throw, and
  // a 500 is the wrong way to say "that import has moved on".
  if (!(['UPLOADED', 'EXTRACTING', 'NEEDS_REVIEW', 'FAILED'] as ImportStatus[]).includes(record.status)) {
    return {
      ok: false,
      status: record.status,
      message: `This import is ${record.status.replace(/_/g, ' ').toLowerCase()} and cannot be read again.`,
    };
  }

  if (
    record.status === 'EXTRACTING' &&
    Date.now() - record.updatedAt.getTime() < STALE_EXTRACTION_MS
  ) {
    return { ok: true, status: 'EXTRACTING', message: 'Already reading this document.' };
  }

  const from = record.status;
  await transitionImport(orgId, userId, importId, from, 'EXTRACTING');

  const files = stagedFilesFromRecord(record);
  const spreadsheet = files.find((f) => classify(f.mimeType) === 'spreadsheet');

  try {
    const result = spreadsheet
      ? await runSpreadsheetExtraction(orgId, userId, importId, spreadsheet)
      : await runVisionExtraction(orgId, userId, importId, files);
    return result;
  } catch (err) {
    logger.error('[document-import] extraction threw', err, { importId });
    const message =
      err instanceof ObjectTooLargeError
        ? err.message
        : 'Something went wrong while reading the document. Try again, and contact support if it keeps happening.';
    await failExtraction(orgId, userId, importId, 'EXTRACTING', 'EXTRACTION_ERROR', message);
    return { ok: false, status: 'FAILED', code: 'EXTRACTION_ERROR', message };
  }
}

async function runVisionExtraction(
  orgId: string,
  userId: string,
  importId: string,
  files: StagedFile[],
): Promise<RunExtractionResult> {
  const sources = await loadSources(orgId, files);

  const result = await extractDocument({
    tenantId: orgId,
    sources,
    cache: prismaPageCache,
    // Each settled page is written before the run finishes. This is the
    // progress counter, the resume point, and the cache row, all at once.
    onPageSettled: (outcome, extraction) =>
      writePageOutcome(orgId, userId, importId, outcome, extraction),
    // Cancel is a status write from another request; the running extraction
    // notices it between pages and stops without billing for the rest.
    shouldContinue: async () => {
      const live = await getImportRecord(orgId, importId, userId);
      return live?.status === 'EXTRACTING';
    },
  });

  if (result.ok) {
    await finishExtraction({
      orgId,
      userId,
      importId,
      from: 'EXTRACTING',
      extraction: result.extraction,
      usage: result.usage,
    });
    return { ok: true, status: 'NEEDS_REVIEW' };
  }

  // Cancelled is not failed. The status was already set to CANCELLED by
  // whoever pressed the button; overwriting it with FAILED would tell the user
  // their document was unreadable when they simply stopped it.
  if (result.code === 'CANCELLED') {
    return { ok: false, status: 'CANCELLED', code: 'CANCELLED', message: result.message };
  }

  await failExtraction(
    orgId,
    userId,
    importId,
    'EXTRACTING',
    result.code,
    result.message,
    result.usage,
  );
  return { ok: false, status: 'FAILED', code: result.code, message: result.message };
}

/**
 * The spreadsheet path (DEC-4: CSV only, `.xlsx` rejected upstream).
 *
 * No saved column mapping can exist yet — the document profile is per client,
 * and client resolution is Phase 3. Rather than dead-ending every first CSV on
 * NO_MAPPING, the header suggestion is applied AND declared: a warning on the
 * extraction says the columns were matched automatically and asks the user to
 * check them. That keeps spec Section 1.6 intact — the system may not guess
 * SILENTLY, and this does not.
 */
async function runSpreadsheetExtraction(
  orgId: string,
  userId: string,
  importId: string,
  file: StagedFile,
): Promise<RunExtractionResult> {
  const bytes = await getObjectBytes(file.storageKey);
  const csv = bytes.toString('utf8');

  let result = parseSpreadsheet({ csv });

  let autoMapped = false;
  if (!result.ok && result.code === 'NO_MAPPING' && result.suggestedMapping) {
    const mapping = result.suggestedMapping;
    if (Object.values(mapping).includes('name')) {
      autoMapped = true;
      result = parseSpreadsheet({ csv, mapping });
    } else {
      const message =
        'The columns in that sheet could not be matched automatically — no consignee name column was found. Rename the column to "Name" or "Consignee" and upload it again.';
      await failExtraction(orgId, userId, importId, 'EXTRACTING', 'NO_MAPPING', message);
      return { ok: false, status: 'FAILED', code: 'NO_MAPPING', message };
    }
  }

  if (!result.ok) {
    await failExtraction(orgId, userId, importId, 'EXTRACTING', result.code, result.message);
    return { ok: false, status: 'FAILED', code: result.code, message: result.message };
  }

  const extraction: CanonicalExtraction = result.extraction;
  if (autoMapped) {
    extraction.extractionWarnings.unshift({
      code: 'COLUMNS_AUTO_MATCHED',
      message:
        'The columns in this sheet were matched automatically. Check the stops before creating the trip — the mapping will be saved to this client once you confirm it.',
      pageNumbers: [],
    });
  }

  const usage: ExtractionUsage = {
    model: 'csv-parser',
    inputTokens: 0,
    outputTokens: 0,
    costUsd: '0.000000',
    pageCount: 1,
    cachedPages: 0,
  };

  await writePageOutcome(
    orgId,
    userId,
    importId,
    {
      pageNumber: 1,
      pageHash: '',
      storageKey: file.storageKey,
      ok: true,
      wasCached: false,
      inputTokens: 0,
      outputTokens: 0,
      model: 'csv-parser',
    },
    extraction,
  );

  await finishExtraction({ orgId, userId, importId, from: 'EXTRACTING', extraction, usage });
  return { ok: true, status: 'NEEDS_REVIEW' };
}

// ---------------------------------------------------------------------------
// Cancel, re-shoot
// ---------------------------------------------------------------------------

export async function cancelImport(
  orgId: string,
  userId: string,
  importId: string,
): Promise<{ ok: boolean; message?: string }> {
  const record = await getImportRecord(orgId, importId, userId);
  if (!record) return { ok: false, message: 'Import not found.' };
  if (record.status === 'CANCELLED') return { ok: true };
  if (record.status === 'COMMITTED') {
    return { ok: false, message: 'This import has already created a trip and cannot be cancelled.' };
  }
  await transitionImport(orgId, userId, importId, record.status, 'CANCELLED');
  return { ok: true };
}

/**
 * Re-shoot one page (spec Section 14: "One page unreadable — flag it, extract
 * the rest, re-shoot that page").
 *
 * Replaces the file at that position and drops that page's row, leaving every
 * other page cached. The next extraction run bills for one page.
 */
export async function reshootPage(
  orgId: string,
  userId: string,
  importId: string,
  pageNumber: number,
  file: StagedFile,
): Promise<{ ok: boolean; message?: string }> {
  const record = await getImportRecord(orgId, importId, userId);
  if (!record) return { ok: false, message: 'Import not found.' };
  if (record.status === 'COMMITTED' || record.status === 'CANCELLED') {
    return { ok: false, message: `This import is ${record.status.toLowerCase()} and cannot be changed.` };
  }

  const nextKeys = await replaceSourceFile(orgId, userId, importId, pageNumber, file);

  // The bytes changed, so the document hash changed with them.
  const files: StagedFile[] = nextKeys.map((key) => ({
    storageKey: key,
    filename: filenameFromKey(key),
    mimeType: mimeTypeFromKey(key),
    sizeBytes: 0,
  }));
  const sources = await loadSources(orgId, files);
  const contentHash = hashDocument(sources.map((s) => s.bytes));

  const db = await getTenantPrismaForOrg(orgId, userId);
  await db.documentImport.updateMany({
    where: { id: importId, orgId, deletedAt: null },
    data: { contentHash, updatedById: userId },
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export async function summariseImport(
  orgId: string,
  importId: string,
  userId?: string | null,
): Promise<ImportView | null> {
  const record = await getImportRecord(orgId, importId, userId);
  if (!record) return null;

  const pageRows = await getImportPages(orgId, importId, userId);
  const byNumber = new Map(pageRows.map((p) => [p.pageNumber, p]));

  const pages: ImportPageView[] = await Promise.all(
    record.sourceFileKeys.map(async (key, i) => {
      const pageNumber = i + 1;
      const row = byNumber.get(pageNumber);
      const mimeType = mimeTypeFromKey(key);
      return {
        pageNumber,
        filename: filenameFromKey(key),
        mimeType,
        storageKey: key,
        previewUrl: IMAGE_PREVIEWABLE.has(mimeType) ? await generateDownloadUrl(key) : null,
        status: !row ? 'pending' : row.failureCode ? 'failed' : 'done',
        failureMessage: row?.failureMessage ?? null,
      } satisfies ImportPageView;
    }),
  );

  return {
    id: record.id,
    status: record.status,
    originalName: record.originalName,
    pageCount: record.sourceFileKeys.length,
    pagesDone: pages.filter((p) => p.status === 'done').length,
    pagesFailed: pages.filter((p) => p.status === 'failed').length,
    failureCode: record.failureCode,
    failureMessage: record.failureMessage,
    createdTripId: record.createdTripId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    pages,
    summary: buildSummary(record),
  };
}

function buildSummary(record: ImportRecord): ImportSummaryView | null {
  const raw = (record.reviewedExtraction ?? record.rawExtraction) as CanonicalExtraction | null;
  if (!raw || !Array.isArray(raw.consignments)) return null;

  let totalPieces: number | null = null;
  for (const c of raw.consignments) {
    const pieces = c.totals?.pieces;
    if (typeof pieces === 'number') totalPieces = (totalPieces ?? 0) + pieces;
  }

  return {
    consignmentCount: raw.consignments.length,
    totalPieces,
    documentType: record.documentType,
    documentNumber: record.documentNumber,
    documentDate: record.documentDate ? record.documentDate.toISOString().slice(0, 10) : null,
    originName: raw.header?.originName ?? null,
    // Phase 3 resolves this to a real client. Until then it is only what the
    // document says, and it is labelled as such in the UI.
    clientNameOnDocument: raw.header?.originName ?? null,
    warnings: (raw.extractionWarnings ?? []).map((w) => ({
      code: w.code,
      message: w.message,
      pageNumbers: w.pageNumbers ?? [],
    })),
  };
}

export interface ImportListItem {
  id: string;
  status: ImportStatus;
  originalName: string | null;
  pageCount: number;
  consignmentCount: number | null;
  createdAt: string;
  createdTripId: string | null;
  failureMessage: string | null;
}

function toListItem(record: ImportRecord): ImportListItem {
  const raw = (record.reviewedExtraction ?? record.rawExtraction) as CanonicalExtraction | null;
  return {
    id: record.id,
    status: record.status,
    originalName: record.originalName,
    pageCount: record.sourceFileKeys.length,
    consignmentCount: Array.isArray(raw?.consignments) ? raw.consignments.length : null,
    createdAt: record.createdAt.toISOString(),
    createdTripId: record.createdTripId,
    failureMessage: record.failureMessage,
  };
}

export async function getResumableImports(
  orgId: string,
  userId?: string | null,
): Promise<ImportListItem[]> {
  const rows = await listResumableImports(orgId, userId);
  return rows.map(toListItem);
}

export async function getRecentImports(
  orgId: string,
  userId?: string | null,
): Promise<ImportListItem[]> {
  const rows = await listRecentImports(orgId, userId);
  return rows.map(toListItem);
}
