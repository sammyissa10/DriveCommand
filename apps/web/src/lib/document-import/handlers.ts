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
import {
  assignClient,
  assignContract,
  createAndAssignClient,
  createAndAssignContract,
  resolveImportById,
  setDocumentDate,
  ResolutionError,
} from './resolution';
import {
  confirmStopFacility,
  createStopFacility,
  getStopResolution,
} from './facility-resolution';
import type { ClientCreateInput } from '@/lib/carrier/clients';
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

// ---------------------------------------------------------------------------
// Resolution — client, contract, summary card (Phase 3)
// ---------------------------------------------------------------------------

/**
 * A `ResolutionError` carries a code that maps to a status; anything else is a
 * 500. Kept in one place so both surfaces answer identically — the same reason
 * this whole module exists.
 */
const RESOLUTION_STATUS: Record<ResolutionError['code'], number> = {
  NOT_FOUND: 404,
  BAD_STATUS: 409,
  INVALID_CLIENT: 400,
  INVALID_CONTRACT: 400,
  INVALID_DATE: 400,
  NO_CLIENT: 400,
  NO_RATE: 400,
  DUPLICATE_CLIENT: 409,
  DUPLICATE_DOCUMENT: 409,
  INVALID_FACILITY: 400,
  INVALID_STOP: 400,
};

async function resolutionCall(
  what: string,
  context: Record<string, unknown>,
  run: () => Promise<unknown>,
): Promise<HandlerResult> {
  try {
    return ok(await run());
  } catch (e) {
    if (e instanceof ResolutionError) {
      return err(e.message, RESOLUTION_STATUS[e.code], { reason: e.code });
    }
    logger.error(`[document-import] ${what} failed`, e, context);
    return err('Something went wrong. Try again.', 500);
  }
}

/**
 * GET the resolution view on its own.
 *
 * `handleGetImport` already embeds it, so this exists for the one case that
 * needs a second read: the client picker searching as the user types. Passing
 * the query through the server keeps the picker honest for a tenant with more
 * clients than a single payload should carry.
 */
export async function handleGetResolution(
  orgId: string,
  userId: string,
  importId: string,
  clientQuery: string | null,
): Promise<HandlerResult> {
  const view = await resolveImportById(orgId, userId, importId, { clientQuery });
  if (!view) return err('Import not found.', 404);
  return ok(view);
}

/** PATCH — select an existing client or contract, or correct the document date. */
export async function handleSetResolution(
  orgId: string,
  userId: string,
  importId: string,
  body: { clientId?: unknown; contractId?: unknown; documentDate?: unknown },
): Promise<HandlerResult> {
  const clientId = typeof body.clientId === 'string' ? body.clientId : null;
  const contractId = typeof body.contractId === 'string' ? body.contractId : null;
  const hasDate = 'documentDate' in body;
  const documentDate =
    typeof body.documentDate === 'string' && body.documentDate.trim()
      ? body.documentDate.trim()
      : null;

  const asked = [clientId, contractId, hasDate ? 'date' : null].filter(Boolean).length;
  if (asked === 0) return err('Send clientId, contractId, or documentDate.', 400);
  // One decision per request. Sending several would hide which one failed, and
  // the card never asks for two at once anyway.
  if (asked > 1) return err('Change one thing per request.', 400);

  return resolutionCall('set resolution', { orgId, importId }, () => {
    // This endpoint is only ever reached by a person tapping a candidate in the
    // picker, so both decisions are MANUAL by construction.
    if (clientId) return assignClient(orgId, userId, importId, clientId, { via: 'MANUAL' });
    if (contractId) return assignContract(orgId, userId, importId, contractId, { via: 'MANUAL' });
    return setDocumentDate(orgId, userId, importId, documentDate);
  });
}

/** POST — create a client from the pre-filled form and select it. */
export async function handleCreateResolutionClient(
  orgId: string,
  userId: string,
  importId: string,
  body: Record<string, unknown>,
): Promise<HandlerResult> {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return err('A client name is required.', 400);

  const str = (key: string): string | undefined => {
    const v = body[key];
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
  };

  const input: ClientCreateInput = {
    name,
    primaryContact: str('primaryContact'),
    phone: str('phone'),
    email: str('email'),
    addressLine1: str('addressLine1'),
    addressLine2: str('addressLine2'),
    city: str('city'),
    state: str('state'),
    zip: str('zip'),
    country: str('country'),
  };

  return resolutionCall('create client', { orgId, importId }, () =>
    createAndAssignClient(orgId, userId, importId, input),
  );
}

/** POST — create a contract (spot or standing) and select it. */
export async function handleCreateResolutionContract(
  orgId: string,
  userId: string,
  importId: string,
  body: Record<string, unknown>,
): Promise<HandlerResult> {
  const spot = body.spot !== false; // the offered path, unless explicitly not
  const baseRate =
    typeof body.baseRate === 'string'
      ? body.baseRate
      : typeof body.baseRate === 'number'
        ? // Accepted because a JSON client may send a number, but it is turned
          // straight back into a string and only ever becomes a Prisma.Decimal.
          String(body.baseRate)
        : null;

  return resolutionCall('create contract', { orgId, importId }, () =>
    createAndAssignContract(orgId, userId, importId, {
      spot,
      baseRate,
      rateType: typeof body.rateType === 'string' ? body.rateType : undefined,
      contractName: typeof body.contractName === 'string' ? body.contractName : undefined,
      effectiveDate: typeof body.effectiveDate === 'string' ? body.effectiveDate : undefined,
      expirationDate: typeof body.expirationDate === 'string' ? body.expirationDate : undefined,
      notes: typeof body.notes === 'string' ? body.notes : undefined,
    }),
  );
}

// ---------------------------------------------------------------------------
// Facility resolution — the stop ladder (Phase 4)
// ---------------------------------------------------------------------------

/** GET the stop ladder. Read-only: nothing below this line writes. */
export async function handleGetStopResolution(
  orgId: string,
  userId: string,
  importId: string,
): Promise<HandlerResult> {
  const view = await getStopResolution(orgId, userId, importId);
  if (!view) return err('Import not found.', 404);
  return ok(view);
}

/**
 * POST — a person tapped a proposed facility, or re-picked a resolved one.
 *
 * The T3 exit. There is deliberately no PATCH that takes a tier or a score: the
 * only thing a client may assert is *which facility a person chose*, and the
 * server recomputes everything else.
 */
export async function handleConfirmStopFacility(
  orgId: string,
  userId: string,
  importId: string,
  body: { stopIndex?: unknown; facilityId?: unknown },
): Promise<HandlerResult> {
  const stopIndex = typeof body.stopIndex === 'number' ? body.stopIndex : NaN;
  const facilityId = typeof body.facilityId === 'string' ? body.facilityId.trim() : '';
  if (!Number.isInteger(stopIndex) || stopIndex < 0) return err('stopIndex is required.', 400);
  if (!facilityId) return err('facilityId is required.', 400);

  return resolutionCall('confirm stop facility', { orgId, importId, stopIndex }, () =>
    confirmStopFacility(orgId, userId, importId, stopIndex, facilityId),
  );
}

/**
 * POST — a person tapped "create" on the pre-filled form.
 *
 * The T4 exit, and the only route in the module that can bring a facility into
 * existence. It requires an explicit body with a name, which is what makes
 * "never without a human tap" a property of the transport and not only of the
 * service layer.
 */
export async function handleCreateStopFacility(
  orgId: string,
  userId: string,
  importId: string,
  body: Record<string, unknown>,
): Promise<HandlerResult> {
  const stopIndex = typeof body.stopIndex === 'number' ? body.stopIndex : NaN;
  if (!Number.isInteger(stopIndex) || stopIndex < 0) return err('stopIndex is required.', 400);

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return err('A facility name is required.', 400);

  const str = (key: string): string | undefined => {
    const v = body[key];
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
  };

  return resolutionCall('create stop facility', { orgId, importId, stopIndex }, () =>
    createStopFacility(orgId, userId, importId, stopIndex, {
      name,
      facilityType: str('facilityType'),
      addressLine1: str('addressLine1'),
      addressLine2: str('addressLine2'),
      city: str('city'),
      state: str('state'),
      zip: str('zip'),
      country: str('country'),
      contactName: str('contactName'),
      contactPhone: str('contactPhone'),
    }),
  );
}

// ---------------------------------------------------------------------------

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
