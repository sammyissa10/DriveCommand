/**
 * Document profiles — per tenant + client + document type.
 *
 * Spec: docs/specs/DocumentImport_TechnicalSpec_v1.md Section 6 ("extraction
 * hints · column mapping · commit strategy · default end stop") and Section 4.2,
 * where the phase prompt names "a pinned document profile" as a second way for
 * client and contract to collapse.
 *
 * WHAT A PINNED PROFILE ACTUALLY IS, since the phrase could mean several things.
 * The row is keyed `(orgId, clientId, documentType)` — so it cannot be looked up
 * before the client is known, and it cannot itself *be* the lookup. What makes
 * it work as one is the alias list: every time a human confirms "this document
 * belongs to Dealer Tire", the name as printed on the document is recorded on
 * that client's profile. The next document that prints the same name resolves
 * against the alias and collapses, with "matched a name saved on this client"
 * as the reason. That is the same shape as `FacilityExternalReference` one level
 * up — confirm once, resolve silently forever (spec Section 1.5) — and it needs
 * no schema change, because `extraction_hints` is JSON and exists for exactly
 * this.
 *
 * `pinnedContractId` is a real column and is used literally: confirming a
 * contract pins it, and the next import of the same document type from that
 * client collapses the contract row too.
 *
 * Every function takes an already-tenant-scoped client. None of them call
 * `getTenantPrisma()` — that reads the `x-tenant-id` header, which does not
 * exist on `/api/mobile/*` (DEC-11).
 */

import type { PrismaClient } from '@/generated/prisma';
import { normaliseName } from './matching';

/** Fallback key for a document whose type could not be determined. */
export const UNKNOWN_DOCUMENT_TYPE = 'UNKNOWN';

export interface DocumentProfileRecord {
  id: string;
  clientId: string;
  documentType: string;
  pinnedContractId: string | null;
  /** Names this client's documents have printed, as confirmed by a human. */
  originNames: string[];
}

const PROFILE_SELECT = {
  id: true,
  clientId: true,
  documentType: true,
  pinnedContractId: true,
  extractionHints: true,
} as const;

/** Hints are free-form JSON; only the alias list is read here. */
function toRecord(row: {
  id: string;
  clientId: string;
  documentType: string;
  pinnedContractId: string | null;
  extractionHints: unknown;
}): DocumentProfileRecord {
  const hints = (row.extractionHints ?? {}) as Record<string, unknown>;
  const raw = hints.originNames;
  const originNames = Array.isArray(raw) ? raw.filter((n): n is string => typeof n === 'string') : [];
  return {
    id: row.id,
    clientId: row.clientId,
    documentType: row.documentType,
    pinnedContractId: row.pinnedContractId,
    originNames,
  };
}

/** Every profile for this document type in the tenant, aliases included. */
export async function listProfilesForType(
  db: PrismaClient,
  orgId: string,
  documentType: string,
): Promise<DocumentProfileRecord[]> {
  const rows = await db.documentProfile.findMany({
    where: { orgId, documentType, deletedAt: null },
    select: PROFILE_SELECT,
  });
  return rows.map(toRecord);
}

export async function getProfile(
  db: PrismaClient,
  orgId: string,
  clientId: string,
  documentType: string,
): Promise<DocumentProfileRecord | null> {
  const row = await db.documentProfile.findFirst({
    where: { orgId, clientId, documentType, deletedAt: null },
    select: PROFILE_SELECT,
  });
  return row ? toRecord(row) : null;
}

/**
 * The profile whose alias list contains this exact document name, if one does.
 *
 * "Exact" is exact after normalisation — the same normalisation the client
 * matcher uses, so an alias saved as "DEALER TIRE, LLC" still answers for
 * "Dealer Tire LLC". Nothing fuzzy resolves here: a profile hit auto-selects,
 * and a fuzzy auto-select is how a document silently lands on the wrong client.
 */
export function findProfileByAlias(
  profiles: DocumentProfileRecord[],
  documentName: string | null | undefined,
): { profile: DocumentProfileRecord; matchedText: string } | null {
  if (!documentName || !documentName.trim()) return null;
  const target = normaliseName(documentName);
  if (!target) return null;

  for (const profile of profiles) {
    for (const alias of profile.originNames) {
      if (normaliseName(alias) === target) return { profile, matchedText: alias };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** Cap on the alias list, so a client that receives many one-off spellings
 *  cannot grow an unbounded JSON blob. Oldest confirmations fall off first. */
const MAX_ALIASES = 25;

/**
 * Record that a human confirmed this client for a document printing this name.
 *
 * Idempotent: re-confirming the same pairing rewrites the same row and does not
 * duplicate the alias. The alias is stored **as printed**, not normalised — the
 * "why" affordance shows it to a human, and "DEALER TIRE, LLC" is evidence in a
 * way that "dealer tire" is not.
 */
export async function recordClientConfirmation(
  db: PrismaClient,
  orgId: string,
  userId: string,
  input: { clientId: string; documentType: string; originName: string | null },
): Promise<DocumentProfileRecord> {
  const documentType = input.documentType || UNKNOWN_DOCUMENT_TYPE;
  const existing = await getProfile(db, orgId, input.clientId, documentType);

  const aliases = [...(existing?.originNames ?? [])];
  const printed = input.originName?.trim();
  if (printed) {
    const target = normaliseName(printed);
    const already = aliases.some((a) => normaliseName(a) === target);
    if (!already && target) {
      aliases.push(printed);
      while (aliases.length > MAX_ALIASES) aliases.shift();
    }
  }

  const row = await db.documentProfile.upsert({
    where: {
      orgId_clientId_documentType: { orgId, clientId: input.clientId, documentType },
    },
    create: {
      orgId,
      clientId: input.clientId,
      documentType,
      extractionHints: { originNames: aliases },
      createdById: userId,
      updatedById: userId,
    },
    update: {
      extractionHints: { originNames: aliases },
      updatedById: userId,
      // A profile that was soft-deleted and is being confirmed again is alive.
      deletedAt: null,
    },
    select: PROFILE_SELECT,
  });

  return toRecord(row);
}

/**
 * Pin a contract to this client's profile for this document type.
 *
 * `null` unpins, which is what happens when the pinned contract is the one the
 * user has just moved away from.
 */
export async function pinContract(
  db: PrismaClient,
  orgId: string,
  userId: string,
  input: { clientId: string; documentType: string; contractId: string | null },
): Promise<void> {
  const documentType = input.documentType || UNKNOWN_DOCUMENT_TYPE;
  await db.documentProfile.upsert({
    where: {
      orgId_clientId_documentType: { orgId, clientId: input.clientId, documentType },
    },
    create: {
      orgId,
      clientId: input.clientId,
      documentType,
      pinnedContractId: input.contractId,
      extractionHints: { originNames: [] },
      createdById: userId,
      updatedById: userId,
    },
    update: {
      pinnedContractId: input.contractId,
      updatedById: userId,
      deletedAt: null,
    },
  });
}
