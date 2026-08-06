/**
 * Import record persistence — the `document_imports` / `document_import_pages`
 * layer Phase 1 deliberately left out.
 *
 * Spec: docs/specs/DocumentImport_TechnicalSpec_v1.md Sections 6, 14.
 *
 * Everything here is tenant-scoped through `getTenantPrismaForOrg`, which sets
 * the RLS GUC and takes the org explicitly — the mobile surface has no
 * `x-tenant-id` header to read, so `getTenantPrisma()` would throw there.
 * `orgId` is still passed on every write as well: belt and braces, and
 * consistent with the carrier siblings.
 *
 * This is the only DB-aware module in the pipeline besides `cache.ts`. The
 * extraction service stays free of Prisma so it remains testable without a
 * database.
 */

import type { CanonicalExtraction } from '@drivecommand/validation';
import { Prisma } from '@/generated/prisma';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';
import { logger } from '@/lib/logger';
import { assertTenantKey } from '@/lib/storage/tenant-key';
import { assertTransition, type ImportStatus } from './lifecycle';
import { isDedupeViolation } from './hashing';
import { RAW_RESPONSE_LIMIT } from './extractor';
import type { ExtractionUsage, PageOutcome } from './service';

// ---------------------------------------------------------------------------
// Source files
// ---------------------------------------------------------------------------

/**
 * One staged source file, in the order the user arranged the thumbnails.
 *
 * `sourceFileKeys` on the row is a String[] and its ARRAY ORDER is the page
 * order — there is no separate ordinal column and there does not need to be.
 * That is deliberate: it makes "the reorder reached the extractor" structural
 * rather than something a later change can quietly break. Phase 2's stated
 * drift risk is exactly this, so it has one representation, not two.
 */
export interface StagedFile {
  storageKey: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

/** Keys are `tenant-{id}/imports/{fileId}-{original name}`. */
export function filenameFromKey(storageKey: string): string {
  const last = storageKey.split('/').pop() ?? storageKey;
  const dash = last.indexOf('-');
  return dash >= 0 ? last.slice(dash + 1) : last;
}

const EXTENSION_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
};

/**
 * MIME type from the key's extension.
 *
 * The row stores keys, not per-file MIME types, so the type is re-derived on
 * read. Safe because the upload endpoint only ever mints a key whose extension
 * matches the content type it approved.
 */
export function mimeTypeFromKey(storageKey: string): string {
  const ext = storageKey.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_TYPES[ext] ?? 'application/octet-stream';
}

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

export interface ImportRecord {
  id: string;
  orgId: string;
  status: ImportStatus;
  sourceFileKeys: string[];
  sourceMimeType: string | null;
  originalName: string | null;
  contentHash: string;
  documentNumber: string | null;
  documentDate: Date | null;
  documentType: string | null;
  /** Resolution (Phase 3). All four are written by `resolution.ts`, not here. */
  clientId: string | null;
  contractId: string | null;
  routeTemplateId: string | null;
  documentProfileId: string | null;
  /// How each of those slots came to be set. Shaped and parsed by `resolution.ts`
  /// (`ResolutionProvenance`); null on rows written before the column existed.
  resolutionProvenance: unknown;
  rawExtraction: unknown;
  reviewedExtraction: unknown;
  extractionWarnings: unknown;
  modelIdentifier: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  pageCount: number | null;
  cachedPages: number;
  failureCode: string | null;
  failureMessage: string | null;
  createdTripId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const IMPORT_SELECT = {
  id: true,
  orgId: true,
  status: true,
  sourceFileKeys: true,
  sourceMimeType: true,
  originalName: true,
  contentHash: true,
  documentNumber: true,
  documentDate: true,
  documentType: true,
  clientId: true,
  contractId: true,
  routeTemplateId: true,
  documentProfileId: true,
  resolutionProvenance: true,
  rawExtraction: true,
  reviewedExtraction: true,
  extractionWarnings: true,
  modelIdentifier: true,
  inputTokens: true,
  outputTokens: true,
  pageCount: true,
  cachedPages: true,
  failureCode: true,
  failureMessage: true,
  createdTripId: true,
  createdAt: true,
  updatedAt: true,
} as const;

export interface ImportPageRecord {
  pageNumber: number;
  pageHash: string;
  storageKey: string | null;
  wasCached: boolean;
  hasExtraction: boolean;
  failureCode: string | null;
  failureMessage: string | null;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getImportRecord(
  orgId: string,
  importId: string,
  userId?: string | null,
): Promise<ImportRecord | null> {
  const db = await getTenantPrismaForOrg(orgId, userId ?? null);
  const row = await db.documentImport.findFirst({
    where: { id: importId, orgId, deletedAt: null },
    select: IMPORT_SELECT,
  });
  return (row as ImportRecord | null) ?? null;
}

export async function getImportPages(
  orgId: string,
  importId: string,
  userId?: string | null,
): Promise<ImportPageRecord[]> {
  const db = await getTenantPrismaForOrg(orgId, userId ?? null);
  const rows = await db.documentImportPage.findMany({
    where: { orgId, importId },
    orderBy: { pageNumber: 'asc' },
    select: {
      pageNumber: true,
      pageHash: true,
      storageKey: true,
      wasCached: true,
      extraction: true,
      failureCode: true,
      failureMessage: true,
    },
  });

  return rows.map((r) => ({
    pageNumber: r.pageNumber,
    pageHash: r.pageHash,
    storageKey: r.storageKey,
    wasCached: r.wasCached,
    hasExtraction: r.extraction !== null && r.extraction !== undefined,
    failureCode: r.failureCode,
    failureMessage: r.failureMessage,
  }));
}

/**
 * The live duplicate for these bytes, if one exists.
 *
 * Matches on `contentHash` alone, which is STRICTER than the database index
 * (that also keys on document number and date). Deliberate: at upload time we
 * have not extracted yet, so we do not know the number or the date, and the
 * honest question at that moment is "have these exact bytes been here before".
 *
 * Cancelled imports are ignored — a run the user abandoned should not block
 * them from starting again with the same photos.
 */
export async function findActiveDuplicate(
  orgId: string,
  contentHash: string,
  userId?: string | null,
): Promise<ImportRecord | null> {
  const db = await getTenantPrismaForOrg(orgId, userId ?? null);
  const row = await db.documentImport.findFirst({
    where: {
      orgId,
      contentHash,
      deletedAt: null,
      status: { notIn: ['CANCELLED'] },
    },
    orderBy: { createdAt: 'desc' },
    select: IMPORT_SELECT,
  });
  return (row as ImportRecord | null) ?? null;
}

/**
 * Statuses the resume banner may offer.
 *
 * Spec Phase 2 item 8 names NEEDS_REVIEW. EXTRACTING and UPLOADED are here too,
 * because those are precisely the states a killed lambda or a backgrounded
 * phone leaves behind, and an import stuck at EXTRACTING with nothing offering
 * to resume it is the worst outcome of the whole flow.
 *
 * FAILED IS NOT HERE, and was. The banner says "pick up where you left off" and
 * sent people to a CSV that could not be parsed — there is nothing to pick up,
 * only a screen explaining that. A failed import is still reachable and still
 * re-shootable from "Choose recent", which lists everything and now carries a
 * dismiss on the failed rows; what it may not do is present itself as the
 * unfinished work waiting for you.
 */
export const RESUMABLE_STATUSES: readonly ImportStatus[] = [
  'UPLOADED',
  'EXTRACTING',
  'NEEDS_REVIEW',
];

/** Imports the user can pick up again. */
export async function listResumableImports(
  orgId: string,
  userId?: string | null,
  limit = 5,
): Promise<ImportRecord[]> {
  const db = await getTenantPrismaForOrg(orgId, userId ?? null);
  const rows = await db.documentImport.findMany({
    where: {
      orgId,
      deletedAt: null,
      status: { in: [...RESUMABLE_STATUSES] },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: IMPORT_SELECT,
  });
  return rows as ImportRecord[];
}

/** Backs "Choose recent" — everything, including what already became a trip. */
export async function listRecentImports(
  orgId: string,
  userId?: string | null,
  limit = 12,
): Promise<ImportRecord[]> {
  const db = await getTenantPrismaForOrg(orgId, userId ?? null);
  const rows = await db.documentImport.findMany({
    where: { orgId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: IMPORT_SELECT,
  });
  return rows as ImportRecord[];
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export class DuplicateImportError extends Error {
  constructor() {
    super('An import for this document already exists.');
    this.name = 'DuplicateImportError';
  }
}

export interface CreateImportInput {
  orgId: string;
  userId: string;
  files: StagedFile[];
  contentHash: string;
  documentType?: string | null;
  /**
   * What the user actually uploaded, when that differs from `files`.
   *
   * A PDF is split into one rendered PNG per page before it reaches here
   * (`materialise.ts`), so `files` is three pages while the user uploaded one
   * document called `manifest-3page.pdf`. Deriving the name and type from
   * `files` in that case would label the import `manifest-3page-p1.png`, which
   * is not a file the user has ever seen. Passed explicitly rather than guessed.
   */
  originalName?: string | null;
  sourceMimeType?: string | null;
}

/**
 * Insert the import row at UPLOADED.
 *
 * A concurrent insert of the same bytes is caught here as a dedupe violation
 * and re-thrown as `DuplicateImportError`, because only the database sees the
 * race — the pre-check in `findActiveDuplicate` cannot.
 */
export async function createImport(input: CreateImportInput): Promise<ImportRecord> {
  const { orgId, userId, files, contentHash, documentType } = input;
  for (const f of files) assertTenantKey(f.storageKey, orgId);

  const db = await getTenantPrismaForOrg(orgId, userId);

  try {
    const row = await db.documentImport.create({
      data: {
        orgId,
        status: 'UPLOADED',
        sourceFileKeys: files.map((f) => f.storageKey),
        sourceMimeType: input.sourceMimeType ?? dominantMimeType(files),
        originalName: input.originalName ?? files[0]?.filename ?? null,
        contentHash,
        documentType: documentType ?? null,
        pageCount: files.length,
        createdById: userId,
        updatedById: userId,
      },
      select: IMPORT_SELECT,
    });
    return row as ImportRecord;
  } catch (err) {
    if (isDedupeViolation(err)) throw new DuplicateImportError();
    throw err;
  }
}

/** The type shown in the UI when a staging set mixes photos and a PDF. */
function dominantMimeType(files: StagedFile[]): string | null {
  if (files.length === 0) return null;
  const distinct = new Set(files.map((f) => f.mimeType));
  return distinct.size === 1 ? files[0].mimeType : 'multipart/mixed';
}

/**
 * Soft-delete an import so a correction can take its place.
 *
 * The dedupe index is partial on `deleted_at IS NULL` precisely so this works
 * (01-SUMMARY.md: "Partial so a soft-deleted import never blocks 'import as a
 * correction'"). The row itself survives, so `Trip.sourceImportId` still points
 * at a real record and the audit trail for an already-committed trip is intact.
 */
export async function supersedeImport(
  orgId: string,
  userId: string,
  importId: string,
): Promise<void> {
  const db = await getTenantPrismaForOrg(orgId, userId);
  await db.documentImport.updateMany({
    where: { id: importId, orgId, deletedAt: null },
    data: { deletedAt: new Date(), deletedById: userId, updatedById: userId },
  });
}

/**
 * Guarded status write. Throws `IllegalImportTransitionError` on a bad edge.
 *
 * A no-op when already in the target state, which keeps a double-submitted
 * Cancel from throwing at the user. `assertTransition` rejects self-transitions
 * on purpose, so that case is handled here rather than by weakening the guard.
 */
export async function transitionImport(
  orgId: string,
  userId: string,
  importId: string,
  from: ImportStatus,
  to: ImportStatus,
  extra?: { failureCode?: string | null; failureMessage?: string | null },
): Promise<void> {
  if (from === to) return;
  assertTransition(from, to);

  const db = await getTenantPrismaForOrg(orgId, userId);
  await db.documentImport.updateMany({
    where: { id: importId, orgId, deletedAt: null, status: from },
    data: {
      status: to,
      updatedById: userId,
      failureCode: extra?.failureCode ?? null,
      failureMessage: extra?.failureMessage ?? null,
    },
  });
}

/**
 * Record one settled page, as it settles.
 *
 * This is the write that makes progress and resume real. It is upserted on
 * `(importId, pageNumber)` so a re-run overwrites the previous attempt for that
 * page rather than accumulating rows, and it is the same table `cache.ts` reads
 * — which is why re-running sixteen pages after re-shooting one bills for one.
 *
 * Phase 1 left `cache.put()` a no-op to avoid two writers racing for this row.
 * This is the single writer it was waiting for.
 */
export async function writePageOutcome(
  orgId: string,
  userId: string,
  importId: string,
  outcome: PageOutcome,
  extraction: unknown,
): Promise<void> {
  const db = await getTenantPrismaForOrg(orgId, userId);

  const extractionValue =
    extraction === undefined || extraction === null
      ? Prisma.DbNull
      : (extraction as Prisma.InputJsonValue);

  const data = {
    pageHash: outcome.pageHash,
    storageKey: outcome.storageKey ?? null,
    extraction: extractionValue,
    wasCached: outcome.wasCached,
    modelIdentifier: outcome.model ?? null,
    inputTokens: outcome.inputTokens,
    outputTokens: outcome.outputTokens,
    failureCode: outcome.failureCode ?? null,
    // Human-readable ONLY. This string is shown to a dispatcher; it never
    // carries model output.
    failureMessage: outcome.failureMessage ?? null,
    // The diagnostic. Separate column precisely so the user-facing message
    // above stays clean. The extractor already caps this at
    // RAW_RESPONSE_LIMIT; re-applied here so the column is bounded by this
    // function rather than by trust in its caller.
    rawResponse: outcome.rawResponse ? outcome.rawResponse.slice(0, RAW_RESPONSE_LIMIT) : null,
  };

  await db.documentImportPage.upsert({
    where: { importId_pageNumber: { importId, pageNumber: outcome.pageNumber } },
    create: { orgId, importId, pageNumber: outcome.pageNumber, ...data },
    update: data,
  });

  if (outcome.rawResponse) {
    logger.warn('[document-import] unparseable page response persisted', {
      importId,
      pageNumber: outcome.pageNumber,
      bytes: outcome.rawResponse.length,
    });
  }
}

export interface FinishExtractionInput {
  orgId: string;
  userId: string;
  importId: string;
  from: ImportStatus;
  extraction: CanonicalExtraction;
  usage: ExtractionUsage;
  /** The raw model reply, retained for audit (DEC-6). */
  rawExtraction?: unknown;
}

/**
 * Success path: store the extraction, the accounting, and move to NEEDS_REVIEW.
 *
 * `documentNumber` and `documentDate` are written here rather than at creation
 * because they come OUT of the document, not off the upload. That is also why
 * this write can trip the dedupe index in a race — caught and degraded rather
 * than failing an import that has already been paid for.
 */
export async function finishExtraction(input: FinishExtractionInput): Promise<void> {
  const { orgId, userId, importId, from, extraction, usage, rawExtraction } = input;
  assertTransition(from, 'NEEDS_REVIEW');

  const db = await getTenantPrismaForOrg(orgId, userId);

  const base = {
    status: 'NEEDS_REVIEW',
    rawExtraction: (rawExtraction ?? extraction) as Prisma.InputJsonValue,
    extractionWarnings: extraction.extractionWarnings as unknown as Prisma.InputJsonValue,
    documentType: extraction.documentType,
    modelIdentifier: usage.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costUsd: new Prisma.Decimal(usage.costUsd),
    pageCount: usage.pageCount,
    cachedPages: usage.cachedPages,
    failureCode: null,
    failureMessage: null,
    updatedById: userId,
  };

  const documentNumber = extraction.header.documentNumber?.trim() || null;
  const documentDate = parseDocumentDate(extraction.header.documentDate);

  try {
    await db.documentImport.updateMany({
      where: { id: importId, orgId, deletedAt: null },
      data: { ...base, documentNumber, documentDate },
    });
  } catch (err) {
    if (!isDedupeViolation(err)) throw err;
    // Another import already claims this (hash, number, date). The extraction
    // itself is fine and cost money — keep it, drop the two fields that
    // collided, and let the duplicate surface on the review screen.
    logger.warn('[document-import] dedupe collision on extraction result', { importId });
    await db.documentImport.updateMany({
      where: { id: importId, orgId, deletedAt: null },
      data: base,
    });
  }
}

/**
 * The document's date at UTC midnight, or null. Never a timezone-shifted date.
 *
 * WHY THIS ACCEPTS MORE THAN ISO. It used to accept `YYYY-MM-DD` and nothing
 * else, while the extraction prompt never asked for ISO — so the model returned
 * the date exactly as the page printed it ("07/27/26", "08/03/26"), this
 * returned null, and `document_date` stayed empty on every import ever run. The
 * prompt now demands ISO, but a model will still echo the printed form
 * sometimes, and the imports already in the table only carry the printed form.
 * Parsing here is the cheaper and more durable half of the fix.
 *
 * US freight convention: a slashed date is MONTH first. "03/08/26" is 8 March,
 * not 3 August. Every document this module has seen is a US carrier's.
 */
export function parseDocumentDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(raw);
  if (iso) return utcDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  // 7/27/26, 07-27-2026, 07.27.26 — the printed forms, month first.
  const us = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(raw);
  if (us) return utcDate(expandYear(Number(us[3])), Number(us[1]), Number(us[2]));

  return null;
}

/** Two-digit years: 00-79 is this century, 80-99 the last one. */
function expandYear(year: number): number {
  if (year >= 1000) return year;
  return year < 80 ? 2000 + year : 1900 + year;
}

/**
 * A real calendar date at UTC midnight, or null.
 *
 * Rejects what `new Date()` would silently roll over — "13/45/26" must not
 * become February 14th on a document nobody will re-read.
 */
function utcDate(year: number, month: number, day: number): Date | null {
  if (!Number.isInteger(year) || year < 1900 || year > 2999) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(d.getTime())) return null;
  // Rollover check: 31 February parses, and must not be accepted.
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d;
}

/** Failure path: record why, and move to FAILED. */
export async function failExtraction(
  orgId: string,
  userId: string,
  importId: string,
  from: ImportStatus,
  code: string,
  message: string,
  usage?: ExtractionUsage,
): Promise<void> {
  assertTransition(from, 'FAILED');
  const db = await getTenantPrismaForOrg(orgId, userId);
  await db.documentImport.updateMany({
    where: { id: importId, orgId, deletedAt: null },
    data: {
      status: 'FAILED',
      failureCode: code,
      failureMessage: message,
      updatedById: userId,
      ...(usage
        ? {
            modelIdentifier: usage.model,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            costUsd: new Prisma.Decimal(usage.costUsd),
            pageCount: usage.pageCount,
            cachedPages: usage.cachedPages,
          }
        : {}),
    },
  });
}

/**
 * Swap one source file for a re-shot replacement, in place.
 *
 * The array position IS the page number, so the replacement lands on the same
 * page and every other page keeps its number — which is what makes the cache
 * charge for one page rather than sixteen on the next run.
 */
export async function replaceSourceFile(
  orgId: string,
  userId: string,
  importId: string,
  pageNumber: number,
  file: StagedFile,
): Promise<string[]> {
  assertTenantKey(file.storageKey, orgId);
  const db = await getTenantPrismaForOrg(orgId, userId);

  const current = await db.documentImport.findFirst({
    where: { id: importId, orgId, deletedAt: null },
    select: { sourceFileKeys: true },
  });
  if (!current) throw new Error('Import not found.');

  const index = pageNumber - 1;
  if (index < 0 || index >= current.sourceFileKeys.length) {
    throw new Error(`This import has no page ${pageNumber}.`);
  }

  const next = [...current.sourceFileKeys];
  next[index] = file.storageKey;

  await db.documentImport.updateMany({
    where: { id: importId, orgId, deletedAt: null },
    data: { sourceFileKeys: next, updatedById: userId },
  });

  // Drop the stale page row so the counter does not show a page as done when
  // its bytes have just been replaced.
  await db.documentImportPage.deleteMany({ where: { orgId, importId, pageNumber } });

  return next;
}

