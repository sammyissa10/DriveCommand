/**
 * Transport-neutral handlers for the import intake endpoints.
 *
 * The web routes authenticate with a session cookie and the mobile routes with
 * a Bearer token, but everything after "who is asking" is identical. Putting
 * the request→response mapping here means the two surfaces cannot drift: they
 * are ten-line adapters over the same functions, and a fix to one is a fix to
 * both.
 *
 * Returns plain `{ status, body }` — no NextResponse, no framework types — so
 * these are directly unit-testable.
 */

import {
  cancelImport,
  getRecentImports,
  getResumableImports,
  reshootPage,
  runExtraction,
  startImport,
  summariseImport,
  type StartImportMode,
} from './intake';
import { filenameFromKey, mimeTypeFromKey, type StagedFile } from './persistence';
import { TenantKeyError } from '@/lib/storage/tenant-key';
import { logger } from '@/lib/logger';

export interface HandlerResult {
  status: number;
  body: unknown;
}

const ok = (data: unknown, status = 200): HandlerResult => ({ status, body: { data } });
const err = (message: string, status: number, extra?: Record<string, unknown>): HandlerResult => ({
  status,
  body: { error: message, ...(extra ?? {}) },
});

function toStagedFiles(keys: unknown): StagedFile[] | null {
  if (!Array.isArray(keys) || keys.length === 0) return null;
  const out: StagedFile[] = [];
  for (const k of keys) {
    if (typeof k !== 'string' || !k) return null;
    out.push({
      storageKey: k,
      filename: filenameFromKey(k),
      mimeType: mimeTypeFromKey(k),
      sizeBytes: 0,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------

export async function handleCreateImport(
  orgId: string,
  userId: string,
  body: { storageKeys?: unknown; mode?: unknown },
): Promise<HandlerResult> {
  const files = toStagedFiles(body.storageKeys);
  if (!files) return err('storageKeys must be a non-empty array of storage keys.', 400);

  const mode: StartImportMode = body.mode === 'correction' ? 'correction' : 'new';

  try {
    // A storage key with a foreign tenant prefix throws TenantKeyError from the
    // persistence layer and is answered 403 below, not 500.
    const result = await startImport({ orgId, userId, files, mode });

    if (result.ok) return ok({ importId: result.importId }, 201);

    if (result.reason === 'DUPLICATE') {
      // 409, with both actions the spec requires: the caller can open the
      // existing import (and its trip, if it has one) or re-POST with
      // mode: 'correction'.
      return {
        status: 409,
        body: {
          error: result.message,
          reason: 'DUPLICATE',
          duplicate: result.duplicate,
          actions: ['open_existing', 'import_as_correction'],
        },
      };
    }

    return err(result.message, 400, { reason: result.reason });
  } catch (e) {
    if (e instanceof TenantKeyError) return err(e.message, 403);
    logger.error('[document-import] create failed', e, { orgId });
    return err('Could not start the import. Try again.', 500);
  }
}

export async function handleGetImport(
  orgId: string,
  userId: string,
  importId: string,
): Promise<HandlerResult> {
  const view = await summariseImport(orgId, importId, userId);
  if (!view) return err('Import not found.', 404);
  return ok(view);
}

export async function handleListImports(
  orgId: string,
  userId: string,
  scope: string | null,
): Promise<HandlerResult> {
  const items =
    scope === 'recent'
      ? await getRecentImports(orgId, userId)
      : await getResumableImports(orgId, userId);
  return ok({ items });
}

export async function handleExtract(
  orgId: string,
  userId: string,
  importId: string,
): Promise<HandlerResult> {
  try {
    const result = await runExtraction(orgId, userId, importId);
    const view = await summariseImport(orgId, importId, userId);
    // 200 either way: a document that could not be read is a legitimate answer
    // to "read this document", and the client needs the page-level detail in
    // the body to offer "re-shoot page 7". Only a broken request is a 4xx.
    return ok({ ...result, import: view });
  } catch (e) {
    if (e instanceof TenantKeyError) return err(e.message, 403);
    logger.error('[document-import] extract failed', e, { orgId, importId });
    return err('Could not read the document. Try again.', 500);
  }
}

export async function handleCancel(
  orgId: string,
  userId: string,
  importId: string,
): Promise<HandlerResult> {
  const result = await cancelImport(orgId, userId, importId);
  if (!result.ok) return err(result.message ?? 'Could not cancel.', 400);
  return ok({ cancelled: true });
}

export async function handleReshoot(
  orgId: string,
  userId: string,
  importId: string,
  body: { pageNumber?: unknown; storageKey?: unknown },
): Promise<HandlerResult> {
  const pageNumber = typeof body.pageNumber === 'number' ? body.pageNumber : NaN;
  const storageKey = typeof body.storageKey === 'string' ? body.storageKey : '';
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || !storageKey) {
    return err('pageNumber and storageKey are required.', 400);
  }

  try {
    const result = await reshootPage(orgId, userId, importId, pageNumber, {
      storageKey,
      filename: filenameFromKey(storageKey),
      mimeType: mimeTypeFromKey(storageKey),
      sizeBytes: 0,
    });
    if (!result.ok) return err(result.message ?? 'Could not replace that page.', 400);
    return ok({ replaced: pageNumber });
  } catch (e) {
    if (e instanceof TenantKeyError) return err(e.message, 403);
    logger.error('[document-import] reshoot failed', e, { orgId, importId, pageNumber });
    return err('Could not replace that page.', 500);
  }
}
