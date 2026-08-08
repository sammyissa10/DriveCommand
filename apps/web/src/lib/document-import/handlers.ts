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
import {
  bulkApplyStops,
  getStopReview,
  reorderStops,
  updateStop,
} from './stop-review-service';
import {
  applyTemplate,
  assignTemplate,
  clearTemplateDecision,
  declineTemplate,
  getTemplateOffer,
  getTemplateView,
  respondToTemplateOffer,
  saveImportAsRouteTemplate,
} from './template-service';
import type { BulkApplyInput, StopPatch } from './stop-review';
import type {
  CanonicalBulkAppliedField,
  CanonicalLineItem,
  CanonicalReference,
  CanonicalRequiredDocument,
  CanonicalStopType,
} from '@drivecommand/validation';
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
// Stop review (Phase 5, spec Section 10)
// ---------------------------------------------------------------------------

/**
 * THE VOCABULARIES THIS FILE IS ALLOWED TO ACCEPT.
 *
 * `stops.stop_type` carries a CHECK that admits exactly these five, verified
 * against production. A body carrying "dropoff" is answered 400 here rather than
 * stored in jsonb for a fortnight and then thrown as a 23514 by a commit nobody
 * can retry. Same rule as DEC-14 and the `receiver`/`shipper` rejection on the
 * facility create path: **read the constraint, validate at the boundary.**
 */
const STOP_TYPES: readonly string[] = ['pickup', 'delivery', 'fuel_stop', 'layover', 'relay_handoff'];
/** `stops` has `"bolRequired"`/`"podRequired"` (camelCase, verified) and no third column. */
const REQUIRED_DOCUMENTS: readonly string[] = ['BOL', 'POD'];
const REFERENCE_TYPES: readonly string[] = ['SHIPMENT', 'PRO', 'ORDER', 'PO', 'BOL', 'LOAD', 'SEAL', 'OTHER'];
const BULK_FIELDS: readonly string[] = ['notes', 'requiredDocuments', 'appointment', 'stopType', 'totals'];
const WEIGHT_UOMS: readonly string[] = ['LBS', 'KG'];

class BadRequest extends Error {}

function str(value: unknown, what: string): string {
  if (typeof value !== 'string') throw new BadRequest(`${what} must be text.`);
  return value;
}

/** A finite number, or null. Never NaN, never Infinity, never a coerced string. */
function nullableNumber(value: unknown, what: string): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BadRequest(`${what} must be a number, or null to clear it.`);
  }
  return value;
}

function oneOf<T extends string>(value: unknown, allowed: readonly string[], what: string): T {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new BadRequest(`"${String(value)}" is not a ${what} this system has.`);
  }
  return value as T;
}

function listOf<T extends string>(value: unknown, allowed: readonly string[], what: string): T[] {
  if (!Array.isArray(value)) throw new BadRequest(`${what} must be a list.`);
  return value.map((v) => oneOf<T>(v, allowed, what));
}

function parseAppointment(value: unknown): { earliest: string | null; latest: string | null; isFirm: boolean } | null {
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new BadRequest('The appointment window is malformed.');
  const v = value as Record<string, unknown>;
  const part = (key: string): string | null => {
    const raw = v[key];
    if (raw === null || raw === undefined || raw === '') return null;
    return str(raw, `The appointment ${key}`).trim() || null;
  };
  return { earliest: part('earliest'), latest: part('latest'), isFirm: v.isFirm === true };
}

function parseLineItems(value: unknown): CanonicalLineItem[] {
  if (!Array.isArray(value)) throw new BadRequest('Line items must be a list.');
  return value.map((raw, i) => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new BadRequest(`Line item ${i + 1} is malformed.`);
    }
    const item = raw as Record<string, unknown>;
    const text = (key: string): string | null => {
      const v = item[key];
      if (v === null || v === undefined || v === '') return null;
      return str(v, `Line item ${i + 1} ${key}`);
    };
    return {
      sku: text('sku'),
      description: text('description'),
      quantity: nullableNumber(item.quantity ?? null, `Line item ${i + 1} quantity`),
      uom: text('uom'),
      weight: nullableNumber(item.weight ?? null, `Line item ${i + 1} weight`),
      hazmat: item.hazmat === true,
    };
  });
}

function parseReferences(value: unknown): CanonicalReference[] {
  if (!Array.isArray(value)) throw new BadRequest('References must be a list.');
  const out: CanonicalReference[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new BadRequest('A reference is malformed.');
    }
    const ref = raw as Record<string, unknown>;
    const refValue = str(ref.value ?? '', 'A reference value').trim();
    // An empty reference is a row the user cleared rather than an error. Dropped
    // rather than rejected, so removing one is the same gesture as blanking it.
    if (!refValue) continue;
    out.push({ type: oneOf(ref.type, REFERENCE_TYPES, 'reference type'), value: refValue });
  }
  return out;
}

/** Turn a `BadRequest` into a 400 and anything else into the resolution mapping. */
async function stopReviewCall(
  what: string,
  context: Record<string, unknown>,
  run: () => Promise<unknown>,
): Promise<HandlerResult> {
  try {
    return ok(await run());
  } catch (e) {
    if (e instanceof BadRequest) return err(e.message, 400);
    if (e instanceof ResolutionError) {
      return err(e.message, RESOLUTION_STATUS[e.code], { reason: e.code });
    }
    logger.error(`[document-import] ${what} failed`, e, context);
    return err('Something went wrong. Try again.', 500);
  }
}

/** GET the review screen. Read-only — nothing below this line writes. */
export async function handleGetStopReview(
  orgId: string,
  userId: string,
  importId: string,
): Promise<HandlerResult> {
  const view = await getStopReview(orgId, userId, importId);
  if (!view) return err('Import not found.', 404);
  return ok(view);
}

/**
 * PATCH — one dispatcher's edit to one stop.
 *
 * Only the keys actually present are applied, so a client sending three fields
 * cannot silently blank the other nine. `undefined` means "not mentioned" and
 * `null` means "clear it", and the two are kept distinct all the way down to
 * `applyStopPatch`.
 */
export async function handleUpdateStop(
  orgId: string,
  userId: string,
  importId: string,
  body: Record<string, unknown>,
): Promise<HandlerResult> {
  const stopIndex = typeof body.stopIndex === 'number' ? body.stopIndex : NaN;
  if (!Number.isInteger(stopIndex) || stopIndex < 0) return err('stopIndex is required.', 400);

  return stopReviewCall('update stop', { orgId, importId, stopIndex }, () => {
    const patch: StopPatch = {};

    if ('name' in body) {
      const name = str(body.name, 'The stop name').trim();
      if (!name) throw new BadRequest('A stop name is required.');
      patch.name = name;
    }
    if ('stopType' in body) {
      patch.stopType = body.stopType === null ? null : oneOf<CanonicalStopType>(body.stopType, STOP_TYPES, 'stop type');
    }
    if ('references' in body) patch.references = parseReferences(body.references);
    if ('lineItems' in body) patch.lineItems = parseLineItems(body.lineItems);
    if ('pieces' in body) patch.pieces = nullableNumber(body.pieces, 'Pieces');
    if ('weight' in body) patch.weight = nullableNumber(body.weight, 'Weight');
    if ('pallets' in body) patch.pallets = nullableNumber(body.pallets, 'Pallets');
    if ('weightUom' in body) {
      patch.weightUom = body.weightUom === null ? null : oneOf<'LBS' | 'KG'>(body.weightUom, WEIGHT_UOMS, 'weight unit');
    }
    if ('appointment' in body) patch.appointment = parseAppointment(body.appointment);
    if ('requiredDocuments' in body) {
      patch.requiredDocuments = listOf<CanonicalRequiredDocument>(
        body.requiredDocuments,
        REQUIRED_DOCUMENTS,
        'required document',
      );
    }
    if ('contact' in body) {
      const c = body.contact;
      patch.contact =
        c === null
          ? null
          : {
              name: (c as Record<string, unknown>)?.name ? str((c as Record<string, unknown>).name, 'The contact name').trim() || null : null,
              phone: (c as Record<string, unknown>)?.phone ? str((c as Record<string, unknown>).phone, 'The contact phone').trim() || null : null,
            };
    }
    if ('notes' in body) {
      patch.notes = body.notes === null ? null : str(body.notes, 'The note').trim() || null;
    }
    // Section 8's "one tap to keep" for a stop the template has and today's
    // document does not. A boolean and nothing else — anything non-boolean is a
    // 400 rather than a coerced truthiness, because "keep this stop" is not a
    // question a stray string should be able to answer.
    if ('skipped' in body) {
      if (typeof body.skipped !== 'boolean') throw new BadRequest('skipped must be true or false.');
      patch.skipped = body.skipped;
    }

    if (Object.keys(patch).length === 0) throw new BadRequest('Nothing to change.');
    return updateStop(orgId, userId, importId, stopIndex, patch);
  });
}

/**
 * POST — persist a new running order.
 *
 * The body is the WHOLE order as a permutation of the current indexes, not a
 * "move stop 3 to position 1" delta. A full permutation is idempotent, it cannot
 * be applied twice by a retry, and it is validated as a permutation server-side
 * — a delta from a stale client would reorder the wrong stop and look fine.
 */
export async function handleReorderStops(
  orgId: string,
  userId: string,
  importId: string,
  body: { order?: unknown },
): Promise<HandlerResult> {
  const order = body.order;
  if (!Array.isArray(order) || order.some((v) => typeof v !== 'number')) {
    return err('order must be the full list of stop positions.', 400);
  }
  return stopReviewCall('reorder stops', { orgId, importId }, () =>
    reorderStops(orgId, userId, importId, order as number[]),
  );
}

/**
 * POST — apply one field to a selection of stops.
 *
 * `stopIndexes` IS the selection. The server never intersects it with anything,
 * never pages it, and never asks what was on screen — which is what makes
 * "selected stops scrolled out of view must receive it" a property of the
 * protocol rather than of a component's carefulness.
 */
export async function handleBulkApplyStops(
  orgId: string,
  userId: string,
  importId: string,
  body: Record<string, unknown>,
): Promise<HandlerResult> {
  const raw = body.stopIndexes;
  if (!Array.isArray(raw) || raw.length === 0 || raw.some((v) => typeof v !== 'number')) {
    return err('stopIndexes must be the list of selected stops.', 400);
  }

  return stopReviewCall('bulk apply', { orgId, importId }, () => {
    const input: BulkApplyInput = {};

    if ('notes' in body) input.notes = str(body.notes, 'The note').trim();
    if ('requiredDocuments' in body) {
      input.requiredDocuments = listOf<CanonicalRequiredDocument>(
        body.requiredDocuments,
        REQUIRED_DOCUMENTS,
        'required document',
      );
    }
    if ('appointment' in body) {
      const appointment = parseAppointment(body.appointment);
      if (!appointment) throw new BadRequest('Give the window a start or an end.');
      input.appointment = appointment;
    }
    if ('stopType' in body) input.stopType = oneOf<CanonicalStopType>(body.stopType, STOP_TYPES, 'stop type');
    if (body.copyQuantitiesFromAbove === true) input.copyQuantitiesFromAbove = true;
    if ('clear' in body) input.clear = listOf<CanonicalBulkAppliedField>(body.clear, BULK_FIELDS, 'field');

    return bulkApplyStops(orgId, userId, importId, raw as number[], input);
  });
}

// ---------------------------------------------------------------------------
// Route template matching (spec Section 8)
// ---------------------------------------------------------------------------

/** GET the template row. Read-only — see `template-lookup.ts`. */
export async function handleGetTemplate(
  orgId: string,
  userId: string,
  importId: string,
): Promise<HandlerResult> {
  const view = await getTemplateView(orgId, userId, importId);
  if (!view) return err('Import not found.', 404);
  return ok(view);
}

/**
 * POST — decide the template.
 *
 * Four actions on one route because they are four answers to one question, and a
 * client that can express "this one", "none", "apply it" and "ask me again"
 * against the same resource cannot get into a state where it has picked one thing
 * on one endpoint and declined on another.
 *
 * `reset` is here rather than on a route of its own for that reason, and because
 * it is unambiguously a write: it clears the stored decision so matching can run
 * again (quick-516). The control it serves — "Look again" — used to call the GET,
 * which re-read the decision instead of clearing it.
 *
 * `templateId` is validated against the candidate set server-side
 * (`assignTemplate`), never trusted — a template belonging to another client is
 * a 400, not a silently applied cross-client order.
 */
export async function handleSetTemplate(
  orgId: string,
  userId: string,
  importId: string,
  body: Record<string, unknown>,
): Promise<HandlerResult> {
  const action = body.action;

  if (action === 'decline') {
    return stopReviewCall('decline template', { orgId, importId }, () =>
      declineTemplate(orgId, userId, importId),
    );
  }

  if (action === 'reset') {
    return stopReviewCall('clear template decision', { orgId, importId }, () =>
      clearTemplateDecision(orgId, userId, importId),
    );
  }

  if (action === 'apply') {
    return stopReviewCall('apply template', { orgId, importId }, () =>
      applyTemplate(orgId, userId, importId),
    );
  }

  if (action === 'select') {
    const templateId = typeof body.templateId === 'string' ? body.templateId.trim() : '';
    if (!templateId) return err('templateId is required.', 400);
    return stopReviewCall('select template', { orgId, importId }, () =>
      assignTemplate(orgId, userId, importId, templateId),
    );
  }

  return err("action must be one of 'select', 'apply', 'decline' or 'reset'.", 400);
}

/**
 * GET / POST the post-commit template offer (spec Section 8, items 5 and 7).
 *
 * GET is the offer as recorded; POST is the answer. Both are no-ops on an import
 * that has not been committed, because there is no success screen before there
 * is a commit — Phase 8 owns that, and this route is what it will light up.
 */
export async function handleGetTemplateOffer(
  orgId: string,
  userId: string,
  importId: string,
): Promise<HandlerResult> {
  const view = await getTemplateOffer(orgId, userId, importId);
  if (!view) return err('Import not found.', 404);
  return ok(view);
}

export async function handleTemplateOfferResponse(
  orgId: string,
  userId: string,
  importId: string,
  body: Record<string, unknown>,
): Promise<HandlerResult> {
  const action = body.action;

  // "Save as route template" — the one-tap offer shown when the tenant setting
  // is off. A different action from answering the update offer, because it
  // creates a template rather than answering a question about one.
  if (action === 'save') {
    return stopReviewCall('save import as template', { orgId, importId }, () =>
      saveImportAsRouteTemplate(orgId, userId, importId),
    );
  }

  if (action === 'update' || action === 'dismiss') {
    return stopReviewCall('answer template offer', { orgId, importId }, () =>
      respondToTemplateOffer(orgId, userId, importId, action === 'update' ? 'UPDATED' : 'DISMISSED'),
    );
  }

  return err("action must be one of 'save', 'update' or 'dismiss'.", 400);
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
