/**
 * Client and contract resolution, and the summary card behind it.
 *
 * Spec: docs/specs/DocumentImport_TechnicalSpec_v1.md Sections 4.1 and 4.2.
 *
 * THE WHOLE VIEW IS COMPUTED ON READ. Nothing in `ImportResolutionView` is
 * stored. The import row holds four ids — `client_id`, `contract_id`,
 * `route_template_id`, `document_profile_id` — and everything else here
 * (candidates, scores, matched text, whether a row may collapse) is derived
 * from those ids plus the extraction plus the live client and contract tables,
 * every time it is asked for. Three consequences, all deliberate:
 *
 *  1. The "why" affordance shows a score for the two strings actually in front
 *     of the user, not one frozen at confirmation time against a client name
 *     that may since have been renamed. The phase's stated drift risk is "a
 *     hardcoded confidence score behind the why affordance"; there is nowhere
 *     in this module for a constant to hide, because there is no score column.
 *  2. Wizard state survives anything. Creating a client mid-flow is a POST and
 *     a re-read of the same row — there is no client-side wizard state to lose,
 *     so a navigation, a reload, a killed tab, or picking the import back up on
 *     the other surface all land in the same place.
 *  3. A client deactivated between two reads stops being auto-selectable
 *     immediately, without a migration or a stale-cache story.
 *
 * NOT IN THIS PHASE: facility resolution (Section 7) and route-template
 * matching (Section 8). The template row is a visible stub — see `templateSlot`
 * at the bottom, which says so in the payload rather than only in the UI.
 */

import type { CanonicalExtraction } from '@drivecommand/validation';
import { Prisma, type PrismaClient } from '@/generated/prisma';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';
import { logger } from '@/lib/logger';
import { createClient, DuplicateClientError, type ClientCreateInput } from '@/lib/carrier/clients';
import { createContract } from '@/lib/carrier/contracts';
import { isOneTimeContract } from '@/lib/carrier/one-time-contract';
import { RATE_TYPES } from '@/lib/carrier/rate-types';
import {
  bestClientMatch,
  CANDIDATE_FLOOR,
  EXACT_MATCH,
  scoreNameMatch,
  type MatchedField,
} from './matching';
import {
  findProfileByAlias,
  getProfile,
  listProfilesForType,
  pinContract,
  recordClientConfirmation,
  UNKNOWN_DOCUMENT_TYPE,
  type DocumentProfileRecord,
} from './profiles';
import {
  clientProvenanceOf,
  contractProvenanceOf,
  provenanceOf,
  stamp,
  type ClientProvenance,
  type ClientProvenanceVia,
  type ContractProvenance,
  type ContractProvenanceVia,
  type ProvenanceInput,
  type ResolutionProvenance,
} from './provenance';
import { resolveStopCounts } from './facility-lookup';
import { getImportRecord, parseDocumentDate, type ImportRecord } from './persistence';
import { isDedupeViolation } from './hashing';
import { normaliseMoney } from './money';

// ---------------------------------------------------------------------------
// View types — mirrored verbatim in packages/api-client/src/owner-imports.ts
// ---------------------------------------------------------------------------

/**
 * How a resolved value came to be resolved. This is the machine-readable half
 * of the "why"; `WhyView.detail` is the sentence a human reads.
 */
export type ResolvedVia =
  /** Exactly one active client whose name matches the document exactly. */
  | 'EXACT_MATCH'
  /** A name saved on this client's document profile from a past confirmation. */
  | 'PROFILE_ALIAS'
  /** The client has exactly one active contract. */
  | 'ONLY_ACTIVE_CONTRACT'
  /** The client's document profile pins this contract for this document type. */
  | 'PROFILE_PIN'
  /** A human picked it. No score — a choice is not a guess. */
  | 'CHOSEN'
  /** A human created it during this import. */
  | 'CREATED';

// ---------------------------------------------------------------------------
// Provenance — stored at write time, not inferred at read time
// ---------------------------------------------------------------------------
//
// The vocabulary, the shapes and the parsing moved to `provenance.ts` when the
// facility ladder arrived: the read-only stop view and these mutations both
// need it, and neither may import the other. Re-exported here because callers
// and tests already import these names from this module, and a move is not a
// reason to break them.

export type {
  ClientProvenance,
  ClientProvenanceVia,
  ContractProvenance,
  ContractProvenanceVia,
  ProvenanceInput,
  ResolutionProvenance,
  SlotProvenance,
  StopProvenance,
  StopProvenanceVia,
} from './provenance';

export interface WhyView {
  via: ResolvedVia;
  /** The candidate-side text that matched, exactly as stored. */
  matchedText: string | null;
  /** The text on the document that it was matched against. */
  documentText: string | null;
  /** 0..1. Null when there was no comparison — a chosen value is not scored. */
  score: number | null;
  /** One plain sentence. Small, secondary, never noisy (spec 4.2). */
  detail: string;
}

export interface ClientOption {
  id: string;
  name: string;
  dbaName: string | null;
  city: string | null;
  state: string | null;
  /** Contracts that could be selected for this client right now. */
  activeContractCount: number;
  /** 0..1 against the document name, or null when listed by a typed query. */
  score: number | null;
  matchedText: string | null;
  matchedField: MatchedField | null;
}

export interface ContractOption {
  id: string;
  contractNumber: string;
  contractName: string | null;
  contractType: string;
  rateType: string;
  /** Decimal serialised as a string. Never a float (spec Section 15). */
  baseRate: string | null;
  effectiveDate: string | null;
  expirationDate: string | null;
  /**
   * Effective for exactly one day and typed `spot` — i.e. an agreement for one
   * trip, not a standing one. Derived from the contract's own term, not from a
   * naming convention. See `isOneTimeContract`.
   */
  isOneTime: boolean;
}

export type SlotState = 'RESOLVED' | 'UNRESOLVED' | 'AWAITING_CLIENT' | 'STUB';

export interface ClientSlotView {
  state: Extract<SlotState, 'RESOLVED' | 'UNRESOLVED'>;
  value: ClientOption | null;
  why: WhyView | null;
  /** What the document printed. Pre-typed into the picker (item 1). */
  documentText: string | null;
  /** Ranked, floored, capped. Empty is a legitimate answer. */
  candidates: ClientOption[];
  /** Create-new, pre-filled from extraction. Never an empty form (constraint). */
  createPrefill: ClientPrefill;
}

/** Everything extraction knows about the shipper, shaped for the create form. */
export interface ClientPrefill {
  name: string;
  primaryContact: string | null;
  phone: string | null;
  email: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
}

export interface SpotOffer {
  /** The rate as printed, Decimal-safe string. Null when the document had none. */
  totalRate: string | null;
  currency: string;
  /** effective and expiration are both this date — one trip, not a term. */
  effectiveDate: string;
  /** What the contract will be called, shown before it is created. */
  proposedName: string;
  /** Why this is being offered, in one sentence. */
  detail: string;
}

/**
 * The offer to create this client's first contract, without leaving the import.
 *
 * WHY IT EXISTS. A client created inline a moment earlier has no contracts by
 * definition, so "no active contract" is the *default* state for every new
 * client rather than an edge case. Before this offer, that state rendered a
 * sentence and no action — the step told the user to go and add a contract
 * somewhere else, which is a dead end and breaks the rule that an unresolved
 * step presents an explicit choice (spec 4.2).
 *
 * WHAT IT CARRIES. The client, and nothing else. Everything a contract could be
 * pre-filled with — a rate, a term, a start date — is absent because no
 * manifest states the terms of a standing agreement, and putting numbers on a
 * contract that no document supports is worse than leaving them for the
 * contract's own page. The rate confirmation, which *does* carry a rate, is
 * served by `spotOffer` instead and never by this.
 */
export interface ContractCreateOffer {
  /** Whose contract this will be. Fixed by the client row — not a field. */
  clientName: string;
  /** Why this is being offered, in one sentence. */
  detail: string;
}

export interface ContractSlotView {
  state: Extract<SlotState, 'RESOLVED' | 'UNRESOLVED' | 'AWAITING_CLIENT'>;
  value: ContractOption | null;
  why: WhyView | null;
  candidates: ContractOption[];
  /** Non-null only for a rate confirmation with an unresolved contract (item 3). */
  spotOffer: SpotOffer | null;
  /** Non-null when there is nothing to pick, so there is something to create. */
  createOffer: ContractCreateOffer | null;
  /** Set when the row cannot be decided yet, e.g. no client. */
  blockedReason: string | null;
}

export interface TemplateSlotView {
  state: Extract<SlotState, 'STUB'>;
  /** Stated in the payload, not only in the UI, so no surface can imply more. */
  note: string;
}

export interface StopCountView {
  total: number;
  /** Linked to an existing facility — silently (T1/T2) or by a person (T3). */
  matched: number;
  /** Created from this document by a person (T4). */
  created: number;
  /** "11 matched · 1 new", as spec 4.1 draws it. */
  note: string;
}

export interface ImportResolutionView {
  client: ClientSlotView;
  contract: ContractSlotView;
  template: TemplateSlotView;
  documentDate: string | null;
  stops: StopCountView;
  /**
   * True when every decision this phase owns is settled. Not "ready to commit"
   * — that is Phase 8 and needs facilities, a template decision, and a driver.
   */
  resolved: boolean;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Most candidates a picker is given without the user typing. */
const MAX_CANDIDATES = 8;

const CLIENT_SELECT = {
  id: true,
  name: true,
  dbaName: true,
  city: true,
  state: true,
} as const;

const CONTRACT_SELECT = {
  id: true,
  contractNumber: true,
  contractName: true,
  contractType: true,
  rateType: true,
  baseRate: true,
  effectiveDate: true,
  expirationDate: true,
} as const;

/** `YYYY-MM-DD`, or null. Dates are date-only columns; never timezone-shifted. */
function isoDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/** Decimal → string. Money never becomes a float on the way out (Section 15). */
function decimalString(value: Prisma.Decimal | null | undefined): string | null {
  return value != null ? value.toString() : null;
}

function toContractOption(row: {
  id: string;
  contractNumber: string;
  contractName: string | null;
  contractType: string;
  rateType: string;
  baseRate: Prisma.Decimal | null;
  effectiveDate: Date | null;
  expirationDate: Date | null;
}): ContractOption {
  return {
    id: row.id,
    contractNumber: row.contractNumber,
    contractName: row.contractName,
    contractType: row.contractType,
    rateType: row.rateType,
    baseRate: decimalString(row.baseRate),
    effectiveDate: isoDate(row.effectiveDate),
    expirationDate: isoDate(row.expirationDate),
    isOneTime: isOneTimeContract(row),
  };
}

/** The extraction the review screen is working from. */
function extractionOf(record: ImportRecord): CanonicalExtraction | null {
  const raw = (record.reviewedExtraction ?? record.rawExtraction) as CanonicalExtraction | null;
  return raw && Array.isArray(raw.consignments) ? raw : null;
}

/** Spec Section 5: rate confirmations are the type that carries a flat rate. */
const RATE_CONFIRMATION = 'RATE_CONFIRMATION';

function documentTypeOf(record: ImportRecord): string {
  return record.documentType || UNKNOWN_DOCUMENT_TYPE;
}

/**
 * The party on the document that becomes the client — the counterparty who pays.
 *
 * WHICH BLOCK THAT IS DEPENDS ON THE DOCUMENT TYPE, and getting it wrong is not
 * a near miss. On a manifest the origin block is the shipper, and the shipper is
 * the customer. On a rate confirmation the origin block is the PICKUP FACILITY
 * — a warehouse that never sees an invoice — while the company hiring the
 * carrier is the broker on the letterhead. Reading `originName` for both put
 * "MIDWEST DISTRIBUTION CENTER" forward as the client of a load that "APEX
 * FREIGHT BROKERAGE LLC" was paying for, and never offered the broker at all.
 *
 * The origin block is still extracted and still correct — Phase 4 needs it as
 * the first stop. It is simply not the client on this document type.
 *
 * Falls back to the origin when a rate confirmation names no issuer, because a
 * candidate list built from the wrong name still beats an empty screen.
 */
function clientParty(
  extraction: CanonicalExtraction | null,
  documentType: string,
): { name: string | null; address: NonNullable<CanonicalExtraction['header']>['originAddress']; contact: NonNullable<CanonicalExtraction['header']>['originContact'] } {
  const header = extraction?.header;
  const issuerName = header?.issuerName?.trim() || null;

  if (documentType === RATE_CONFIRMATION && issuerName) {
    return {
      name: issuerName,
      address: header?.issuerAddress ?? null,
      contact: header?.issuerContact ?? null,
    };
  }

  return {
    name: header?.originName?.trim() || null,
    address: header?.originAddress ?? null,
    contact: header?.originContact ?? null,
  };
}

/** The document's own name for the client — the string everything scores against. */
function documentClientName(
  extraction: CanonicalExtraction | null,
  documentType: string,
): string | null {
  return clientParty(extraction, documentType).name;
}

/**
 * The document's date, preferring the column and falling back to the extraction.
 *
 * The column is written once, at the end of extraction, and is also part of the
 * dedupe key. The fallback exists because every import taken before the date
 * parser was fixed has a date in its extraction and NULL in its column — those
 * imports show the right date on the card immediately rather than only after
 * being re-read. Nothing is written here; the card's own date row is what
 * writes the column.
 */
function documentDateOf(record: ImportRecord, extraction: CanonicalExtraction | null): string | null {
  return isoDate(record.documentDate) ?? isoDate(parseDocumentDate(extraction?.header?.documentDate));
}

// ---------------------------------------------------------------------------
// Loading candidates
// ---------------------------------------------------------------------------

/**
 * Active, real, selectable clients.
 *
 * `isSample` is excluded: demo rows must never appear anywhere a user assigns a
 * real entity. `status: 'active'` is the spec's own word in "exact match to one
 * active client" — an inactive client is not a candidate and cannot auto-select.
 */
async function loadActiveClients(db: PrismaClient, orgId: string) {
  return db.carrierClient.findMany({
    where: { orgId, deletedAt: null, status: 'active', isSample: false },
    select: {
      ...CLIENT_SELECT,
      contracts: {
        where: { deletedAt: null, status: 'active' },
        select: { id: true, expirationDate: true },
      },
    },
    orderBy: { name: 'asc' },
  });
}

/**
 * Contracts that could be chosen for this client today.
 *
 * Expired-by-date is excluded even when `status` still says active — a contract
 * whose expiration has passed is not something a trip should be created under,
 * and leaving it in would let "exactly one active contract" auto-select a dead
 * agreement.
 */
async function loadActiveContracts(db: PrismaClient, orgId: string, clientId: string) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const rows = await db.carrierContract.findMany({
    where: {
      orgId,
      clientId,
      deletedAt: null,
      status: 'active',
      OR: [{ expirationDate: null }, { expirationDate: { gte: today } }],
    },
    select: CONTRACT_SELECT,
    orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
  });

  return rows.map(toContractOption);
}

function countSelectableContracts(contracts: Array<{ expirationDate: Date | null }>): number {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return contracts.filter((c) => !c.expirationDate || c.expirationDate >= today).length;
}

// ---------------------------------------------------------------------------
// Client slot
// ---------------------------------------------------------------------------

type ClientRow = Awaited<ReturnType<typeof loadActiveClients>>[number];

function toClientOption(row: ClientRow, match: { score: number | null; matchedText: string | null; matchedField: MatchedField | null }): ClientOption {
  return {
    id: row.id,
    name: row.name,
    dbaName: row.dbaName,
    city: row.city,
    state: row.state,
    activeContractCount: countSelectableContracts(row.contracts),
    score: match.score,
    matchedText: match.matchedText,
    matchedField: match.matchedField,
  };
}

/**
 * Create-new, pre-filled from the party that is actually becoming the client —
 * so a broker is created with the broker's address rather than the warehouse's.
 */
function prefillFromExtraction(
  extraction: CanonicalExtraction | null,
  documentType: string,
): ClientPrefill {
  const party = clientParty(extraction, documentType);
  const address = party.address ?? {};
  const contact = party.contact ?? {};
  return {
    name: party.name ?? '',
    primaryContact: contact?.name?.trim() || null,
    phone: contact?.phone?.trim() || null,
    email: contact?.email?.trim() || null,
    addressLine1: address?.line1?.trim() || null,
    addressLine2: address?.line2?.trim() || null,
    city: address?.city?.trim() || null,
    state: address?.state?.trim() || null,
    zip: address?.postalCode?.trim() || null,
    country: address?.country?.trim() || null,
  };
}

function scoreLabel(score: number): string {
  return `${Math.round(score * 100)}%`;
}

type ScoredClient = { row: ClientRow; option: ClientOption };

/**
 * Every active client, scored against the name the document printed.
 *
 * Read-only, and deliberately separate from `buildClientSlot` so the commit
 * path (`ensureClientCommitted`) can reach the same scoring without reaching
 * the view assembly around it.
 */
async function scoreClients(
  db: PrismaClient,
  orgId: string,
  profiles: DocumentProfileRecord[],
  documentText: string | null,
): Promise<ScoredClient[]> {
  const rows = await loadActiveClients(db, orgId);
  const aliasesByClient = new Map<string, string[]>();
  for (const p of profiles) {
    aliasesByClient.set(p.clientId, [...(aliasesByClient.get(p.clientId) ?? []), ...p.originNames]);
  }

  return rows.map((row) => {
    const match = documentText
      ? bestClientMatch(documentText, {
          name: row.name,
          dbaName: row.dbaName,
          aliases: aliasesByClient.get(row.id) ?? [],
        })
      : null;
    return {
      row,
      option: toClientOption(row, {
        score: match ? match.score : null,
        matchedText: match ? match.matchedText : null,
        matchedField: match ? match.matchedField : null,
      }),
    };
  });
}

/** A client the system may select without being asked. */
interface DeterministicClient {
  clientId: string;
  option: ClientOption;
  why: WhyView;
}

/**
 * The two conditions under which the system selects a client on its own: a
 * learned alias, or exactly one exact match. Pure — it reads the scored list it
 * is handed and writes nothing.
 *
 * This is the single definition of "deterministic enough to collapse". The view
 * (`buildClientSlot`) and the commit (`ensureClientCommitted`) both call it, so
 * a card that shows a client collapsed and a mutation that persists that client
 * cannot drift apart — which is exactly how the client came to be displayed but
 * never saved.
 *
 * Note what is still absent: no fuzzy score, however high, resolves here.
 */
function resolveClientDeterministic(
  record: ImportRecord,
  profiles: DocumentProfileRecord[],
  scored: ScoredClient[],
  documentText: string | null,
): DeterministicClient | null {
  // ---- A learned alias ---------------------------------------------------
  const aliasHit = findProfileByAlias(profiles, documentText);
  if (aliasHit) {
    const match = scored.find((s) => s.row.id === aliasHit.profile.clientId);
    if (match) {
      return {
        clientId: match.row.id,
        option: match.option,
        why: {
          via: 'PROFILE_ALIAS',
          matchedText: aliasHit.matchedText,
          documentText,
          score: EXACT_MATCH,
          detail: `“${aliasHit.matchedText}” is saved on this client from a previous import of the same document type.`,
        },
      };
    }
  }

  // ---- Exactly one exact match ------------------------------------------
  if (documentText) {
    const exact = scored.filter((s) => s.option.score === EXACT_MATCH);
    if (exact.length === 1) {
      const only = exact[0];
      return {
        clientId: only.row.id,
        option: only.option,
        why: {
          via: 'EXACT_MATCH',
          matchedText: only.option.matchedText,
          documentText,
          score: EXACT_MATCH,
          detail: `“${documentText}” on the document matches “${only.option.matchedText}” exactly (${scoreLabel(EXACT_MATCH)}).`,
        },
      };
    }
    if (exact.length > 1) {
      logger.info('[document-import] ambiguous exact client match', {
        importId: record.id,
        documentText,
        matches: exact.length,
      });
    }
  }

  return null;
}

/**
 * The client "why" for a slot that is already committed, told from what was
 * recorded when it was committed.
 *
 * The null case is the legacy row — written before the column existed — and it
 * reproduces the previous copy exactly. That fallback is not a stopgap: for
 * every row written before quick-508 the only writer was the manual picker, so
 * "you picked this" was true then and remains true now.
 */
function clientWhyFromProvenance(
  provenance: ClientProvenance | null,
  clientName: string,
  documentText: string | null,
): WhyView {
  const picked: WhyView = {
    via: 'CHOSEN',
    matchedText: clientName,
    documentText,
    score: null,
    detail: documentText
      ? `You picked this client for “${documentText}”.`
      : 'You picked this client.',
  };
  if (!provenance) return picked;

  switch (provenance.via) {
    case 'MANUAL':
      return picked;

    case 'MANUAL_CREATE':
      return {
        via: 'CREATED',
        matchedText: clientName,
        documentText,
        score: null,
        detail: documentText
          ? `You created this client during this import, from “${documentText}” on the document.`
          : 'You created this client during this import.',
      };

    case 'PROFILE_ALIAS':
      return {
        via: 'PROFILE_ALIAS',
        matchedText: provenance.matchedText,
        documentText,
        score: provenance.score,
        detail: provenance.matchedText
          ? `“${provenance.matchedText}” is saved on this client from a previous import of the same document type.`
          : 'A name saved on this client from a previous import of the same document type matched this document.',
      };

    case 'EXACT_MATCH':
      return {
        via: 'EXACT_MATCH',
        matchedText: provenance.matchedText,
        documentText,
        score: provenance.score,
        detail:
          documentText && provenance.matchedText
            ? `“${documentText}” on the document matches “${provenance.matchedText}” exactly (${scoreLabel(provenance.score ?? EXACT_MATCH)}).`
            : `The name on the document matched this client exactly (${scoreLabel(provenance.score ?? EXACT_MATCH)}).`,
      };
  }
}

/**
 * Build the client row.
 *
 * Collapse conditions, in the order they are tried, and nothing else collapses:
 *   1. A human already chose one on this import.
 *   2. A name saved on some client's document profile matches this document's
 *      name exactly (after normalisation).
 *   3. Exactly one active client matches the document name exactly.
 *
 * Note what is absent: no fuzzy score, however high, auto-selects. A 0.94 match
 * to the wrong dealership is the failure this whole module exists to prevent,
 * and the cost of not collapsing is one tap.
 */
async function buildClientSlot(
  db: PrismaClient,
  orgId: string,
  record: ImportRecord,
  extraction: CanonicalExtraction | null,
  profiles: DocumentProfileRecord[],
  query: string | null,
): Promise<ClientSlotView> {
  const documentType = documentTypeOf(record);
  const documentText = documentClientName(extraction, documentType);
  const createPrefill = prefillFromExtraction(extraction, documentType);

  const scored = await scoreClients(db, orgId, profiles, documentText);

  // ---- 1. Already chosen -------------------------------------------------
  if (record.clientId) {
    // Read directly rather than from the active list: the user may have chosen
    // a client that has since been deactivated, and silently dropping their
    // decision would be worse than showing it.
    const chosen = await db.carrierClient.findFirst({
      where: { id: record.clientId, orgId, deletedAt: null },
      select: { ...CLIENT_SELECT, contracts: { where: { deletedAt: null, status: 'active' }, select: { id: true, expirationDate: true } } },
    });
    if (chosen) {
      // The provenance, not the mere fact that an id is set, decides what this
      // row claims about who decided.
      const provenance = clientProvenanceOf(record);
      return {
        state: 'RESOLVED',
        value: toClientOption(chosen, {
          score: provenance?.score ?? null,
          matchedText: provenance?.matchedText ?? null,
          matchedField: null,
        }),
        why: clientWhyFromProvenance(provenance, chosen.name, documentText),
        documentText,
        candidates: rankCandidates(scored, query, documentText),
        createPrefill,
      };
    }
  }

  // ---- 2 & 3. A learned alias, then exactly one exact match --------------
  const deterministic = resolveClientDeterministic(record, profiles, scored, documentText);
  if (deterministic) {
    return {
      state: 'RESOLVED',
      value: deterministic.option,
      why: deterministic.why,
      documentText,
      candidates: rankCandidates(scored, query, documentText),
      createPrefill,
    };
  }

  return {
    state: 'UNRESOLVED',
    value: null,
    why: null,
    documentText,
    candidates: rankCandidates(scored, query, documentText),
    createPrefill,
  };
}

/**
 * The picker's list.
 *
 * With a typed query the ranking is against what was typed, and the floor is
 * dropped to a substring test — a user typing "dar" expects Russ Darrow, and a
 * three-letter fragment scores badly by any similarity measure. Without one it
 * is ranked against the document name and floored, so the picker opens on the
 * few plausible clients rather than the whole book.
 */
function rankCandidates(
  scored: Array<{ row: ClientRow; option: ClientOption }>,
  query: string | null,
  documentText: string | null,
): ClientOption[] {
  const typed = query?.trim();

  if (typed) {
    const needle = typed.toLowerCase();
    return scored
      .map(({ row, option }) => {
        const haystack = `${row.name} ${row.dbaName ?? ''}`.toLowerCase();
        const substring = haystack.includes(needle);
        const score = scoreNameMatch(typed, row.name);
        return { option: { ...option, score, matchedText: row.name, matchedField: 'name' as const }, substring, score };
      })
      .filter((c) => c.substring || c.score >= CANDIDATE_FLOOR)
      .sort((a, b) => {
        if (a.substring !== b.substring) return a.substring ? -1 : 1;
        return b.score - a.score;
      })
      .slice(0, MAX_CANDIDATES)
      .map((c) => c.option);
  }

  if (!documentText) {
    return scored.slice(0, MAX_CANDIDATES).map((s) => s.option);
  }

  return scored
    .filter((s) => (s.option.score ?? 0) >= CANDIDATE_FLOOR)
    .sort((a, b) => (b.option.score ?? 0) - (a.option.score ?? 0))
    .slice(0, MAX_CANDIDATES)
    .map((s) => s.option);
}

// ---------------------------------------------------------------------------
// Contract slot
// ---------------------------------------------------------------------------

/**
 * What a contract created from the import gets when the caller names no rate
 * type. It is the column's own default, so this changes nothing about the row
 * — it exists so the value is stated here rather than implied by the schema.
 */
const DEFAULT_RATE_TYPE = 'per_mile';

function spotContractName(record: ImportRecord, date: string): string {
  const number = record.documentNumber?.trim();
  return number ? `One-time — RC ${number} (${date})` : `One-time — rate confirmation (${date})`;
}

/** The document's date, or today when it printed none. */
function tripDate(record: ImportRecord, extraction: CanonicalExtraction | null): string {
  return documentDateOf(record, extraction) ?? new Date().toISOString().slice(0, 10);
}

/** A contract the system may select without being asked. */
interface DeterministicContract {
  contractId: string;
  option: ContractOption;
  why: WhyView;
}

/**
 * The two conditions under which the system selects a contract on its own: the
 * client's profile pins one for this document type, or the client has exactly
 * one active contract. Pure — it reads the candidate list it is handed.
 *
 * The client-side twin of this (`resolveClientDeterministic`) exists for the
 * same reason and should be read alongside it: the view and the commit must
 * agree on what "resolved without being asked" means, and the only way to
 * guarantee that is for both to call the same function.
 *
 * `loadActiveContracts` has already excluded contracts that are expired by date
 * even where `status` still says active, so "exactly one active contract" cannot
 * auto-select a dead agreement.
 */
function resolveContractDeterministic(
  profile: DocumentProfileRecord | null,
  candidates: ContractOption[],
  clientName: string,
  documentType: string,
): DeterministicContract | null {
  // ---- Pinned by the profile ---------------------------------------------
  if (profile?.pinnedContractId) {
    const pinned = candidates.find((c) => c.id === profile.pinnedContractId);
    if (pinned) {
      return {
        contractId: pinned.id,
        option: pinned,
        why: {
          via: 'PROFILE_PIN',
          matchedText: pinned.contractName ?? pinned.contractNumber,
          documentText: null,
          score: null,
          detail: `This contract is pinned to ${clientName} for ${documentType.replace(/_/g, ' ').toLowerCase()} documents.`,
        },
      };
    }
  }

  // ---- Exactly one active contract ---------------------------------------
  if (candidates.length === 1) {
    const only = candidates[0];
    return {
      contractId: only.id,
      option: only,
      why: {
        via: 'ONLY_ACTIVE_CONTRACT',
        matchedText: only.contractName ?? only.contractNumber,
        documentText: null,
        score: null,
        detail: `${clientName} has one active contract.`,
      },
    };
  }

  return null;
}

/**
 * The contract "why" for a slot that is already committed.
 *
 * The legacy fallback reads `isOneTime` off the contract itself, which is what
 * this branch did for every row before provenance existed. Note what that could
 * not distinguish: a one-time contract *created here* and a pre-existing
 * one-time contract a human picked off the list rendered the same sentence,
 * "created from this document", and for the second of those it was false.
 * A stored `MANUAL` now says the true thing instead.
 */
function contractWhyFromProvenance(
  provenance: ContractProvenance | null,
  option: ContractOption,
  clientName: string,
  documentType: string,
): WhyView {
  const name = option.contractName ?? option.contractNumber;
  const spotDetail = 'A one-time spot contract created from this document, effective for this trip only.';

  if (!provenance) {
    return {
      via: option.isOneTime && option.contractType === 'spot' ? 'CREATED' : 'CHOSEN',
      matchedText: name,
      documentText: null,
      score: null,
      detail: option.isOneTime ? spotDetail : 'You picked this contract.',
    };
  }

  switch (provenance.via) {
    case 'MANUAL':
      return {
        via: 'CHOSEN',
        matchedText: name,
        documentText: null,
        score: null,
        detail: 'You picked this contract.',
      };

    case 'CREATED_THIS_IMPORT':
      return {
        via: 'CREATED',
        matchedText: name,
        documentText: null,
        score: null,
        // The spot sentence says more than "created during this import" — that
        // its term is one trip — so it is kept where it applies.
        detail: option.isOneTime ? spotDetail : 'Created during this import.',
      };

    case 'PROFILE_PIN':
      return {
        via: 'PROFILE_PIN',
        matchedText: name,
        documentText: null,
        score: null,
        detail: `This contract is pinned to ${clientName} for ${documentType.replace(/_/g, ' ').toLowerCase()} documents.`,
      };

    case 'SINGLE_ACTIVE':
      return {
        via: 'ONLY_ACTIVE_CONTRACT',
        matchedText: name,
        documentText: null,
        score: null,
        detail: `${clientName} had one active contract.`,
      };
  }
}

async function buildContractSlot(
  db: PrismaClient,
  orgId: string,
  record: ImportRecord,
  extraction: CanonicalExtraction | null,
  clientSlot: ClientSlotView,
): Promise<ContractSlotView> {
  const clientId = clientSlot.value?.id ?? null;

  if (!clientId) {
    return {
      state: 'AWAITING_CLIENT',
      value: null,
      why: null,
      candidates: [],
      spotOffer: null,
      createOffer: null,
      blockedReason: 'Pick the client first — contracts belong to a client.',
    };
  }

  const documentType = documentTypeOf(record);
  const candidates = await loadActiveContracts(db, orgId, clientId);
  const profile = await getProfile(db, orgId, clientId, documentType);

  const offerSpot = (): SpotOffer | null => {
    if (record.documentType !== RATE_CONFIRMATION) return null;
    const date = tripDate(record, extraction);
    return {
      totalRate: extraction?.header?.totalRate?.trim() || null,
      currency: extraction?.header?.currency?.trim() || 'USD',
      effectiveDate: date,
      proposedName: spotContractName(record, date),
      detail:
        'A rate confirmation is an agreement for one trip. This creates a spot contract at the rate on the document, effective for that day only.',
    };
  };

  // ---- 1. Already chosen -------------------------------------------------
  if (record.contractId) {
    const chosen = await db.carrierContract.findFirst({
      where: { id: record.contractId, orgId, clientId, deletedAt: null },
      select: CONTRACT_SELECT,
    });
    if (chosen) {
      const option = toContractOption(chosen);
      return {
        state: 'RESOLVED',
        value: option,
        why: contractWhyFromProvenance(
          contractProvenanceOf(record),
          option,
          clientSlot.value?.name ?? 'This client',
          documentType,
        ),
        candidates,
        spotOffer: null,
        createOffer: null,
        blockedReason: null,
      };
    }
  }

  // ---- 2 & 3. Pinned by the profile, then exactly one active contract -----
  const deterministic = resolveContractDeterministic(
    profile,
    candidates,
    clientSlot.value?.name ?? 'This client',
    documentType,
  );
  if (deterministic) {
    return {
      state: 'RESOLVED',
      value: deterministic.option,
      why: deterministic.why,
      candidates,
      spotOffer: null,
      createOffer: null,
      blockedReason: null,
    };
  }

  const spotOffer = offerSpot();
  const clientName = clientSlot.value?.name ?? 'This client';

  return {
    state: 'UNRESOLVED',
    value: null,
    why: null,
    candidates,
    spotOffer,
    // Offered whenever there is no spot offer — an empty picker (where it is
    // the only way forward) AND a picker whose options are all wrong (where
    // the only alternative was to select a contract the load is not under).
    // The spot offer stays exclusive to rate confirmations per spec 4.2, so
    // this never competes with it.
    createOffer: spotOffer
      ? null
      : {
          clientName,
          // Deliberately does not restate "has no active contract" — the step
          // above says that once, and saying it twice was half the original
          // defect. This sentence is about the action, not the situation.
          detail:
            candidates.length === 0
              ? 'A trip is billed against a contract. Create one here and the import carries on with it — its rate and terms can be filled in on the contract afterwards.'
              : 'If none of these is the agreement this load moved under, create the one that is — its rate and terms can be filled in on the contract afterwards.',
        },
    // The row is no longer blocked in any case it can reach: it either has
    // contracts to choose from, a spot offer, or the create offer above.
    blockedReason: null,
  };
}

// ---------------------------------------------------------------------------
// Template slot — a stub, and it says so
// ---------------------------------------------------------------------------

/**
 * Phase 6 owns template matching (spec Section 8). This row exists in the card
 * because Section 4.1 draws it there, and leaving a hole would make the card
 * look like the finished article minus a feature rather than a card with one
 * row still to come. It never claims a value.
 */
function templateSlot(): TemplateSlotView {
  return {
    state: 'STUB',
    note: 'Route template matching arrives in a later phase. This trip will not be matched to a template yet.',
  };
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export interface ResolveOptions {
  /** What the user has typed into the client picker, if anything. */
  clientQuery?: string | null;
}

/** Build the whole resolution view for one import. */
export async function resolveImport(
  orgId: string,
  userId: string | null,
  record: ImportRecord,
  options: ResolveOptions = {},
): Promise<ImportResolutionView> {
  const db = await getTenantPrismaForOrg(orgId, userId);
  const extraction = extractionOf(record);
  const profiles = await listProfilesForType(db, orgId, documentTypeOf(record));

  const client = await buildClientSlot(
    db,
    orgId,
    record,
    extraction,
    profiles,
    options.clientQuery ?? null,
  );
  const contract = await buildContractSlot(db, orgId, record, extraction, client);

  // Phase 4 fills the "11 matched · 1 new" line spec 4.1 draws. These were null
  // rather than 0 while facility matching did not exist, because "0 matched"
  // would have been a claim nothing had checked; now something has checked, and
  // the numbers are real. Read-only — `resolveStopCounts` writes nothing.
  const stops = await resolveStopCounts(db, orgId, record);

  return {
    client,
    contract,
    template: templateSlot(),
    documentDate: documentDateOf(record, extraction),
    stops,
    resolved: client.state === 'RESOLVED' && contract.state === 'RESOLVED',
  };
}

/** `resolveImport` from an import id. Returns null when the import is gone. */
export async function resolveImportById(
  orgId: string,
  userId: string | null,
  importId: string,
  options: ResolveOptions = {},
): Promise<ImportResolutionView | null> {
  const record = await getImportRecord(orgId, importId, userId);
  if (!record) return null;
  return resolveImport(orgId, userId, record, options);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export class ResolutionError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'NOT_FOUND'
      | 'BAD_STATUS'
      | 'INVALID_CLIENT'
      | 'INVALID_CONTRACT'
      | 'INVALID_DATE'
      | 'NO_CLIENT'
      | 'NO_RATE'
      | 'DUPLICATE_CLIENT'
      | 'DUPLICATE_DOCUMENT'
      /** Phase 4 — the facility ladder shares this error type and its handler mapping. */
      | 'INVALID_FACILITY'
      | 'INVALID_STOP',
  ) {
    super(message);
    this.name = 'ResolutionError';
  }
}

/**
 * Statuses in which the client and contract may still be decided.
 *
 * COMMITTED is excluded because the trip exists and repointing the import at a
 * different client would make the audit trail lie about what was created.
 */
const EDITABLE: readonly string[] = ['NEEDS_REVIEW', 'READY'];

function assertEditable(record: ImportRecord): void {
  if (!EDITABLE.includes(record.status)) {
    throw new ResolutionError(
      `This import is ${record.status.replace(/_/g, ' ').toLowerCase()} and its client and contract can no longer be changed.`,
      'BAD_STATUS',
    );
  }
}

async function requireRecord(orgId: string, userId: string, importId: string): Promise<ImportRecord> {
  const record = await getImportRecord(orgId, importId, userId);
  if (!record) throw new ResolutionError('Import not found.', 'NOT_FOUND');
  return record;
}

/**
 * Point the import at a client, and teach the profile the name it printed.
 *
 * Changing the client clears the contract: a contract belongs to a client, so a
 * contract selected under the old one is not merely stale, it is wrong. That is
 * a deliberate loss of one confirmed value rather than a silently invalid pair.
 */
export async function assignClient(
  orgId: string,
  userId: string,
  importId: string,
  clientId: string,
  /**
   * How this assignment came about. Required, and required to be truthful — the
   * "why" affordance renders from it, and a wrong value here is not a cosmetic
   * bug but a false claim about who decided.
   */
  provenance: ProvenanceInput<ClientProvenanceVia>,
): Promise<ImportResolutionView> {
  const record = await requireRecord(orgId, userId, importId);
  assertEditable(record);

  const db = await getTenantPrismaForOrg(orgId, userId);
  const client = await db.carrierClient.findFirst({
    where: { id: clientId, orgId, deletedAt: null },
    select: { id: true },
  });
  if (!client) throw new ResolutionError('That client does not exist.', 'INVALID_CLIENT');

  const extraction = extractionOf(record);
  const documentType = documentTypeOf(record);

  // The confirmation is what makes the next document from this client collapse
  // without being asked. It is the entire value of the profile.
  const profile = await recordClientConfirmation(db, orgId, userId, {
    clientId,
    documentType,
    // The alias learned is the name that was matched against — the issuer on a
    // rate confirmation. Saving the pickup facility here would teach the
    // profile the wrong string and collapse the next import onto it.
    originName: documentClientName(extraction, documentType),
  });

  const changed = record.clientId !== clientId;

  // Merged in memory from the record already read above, then written in the
  // same statement — Prisma exposes no jsonb `||`, and a read-modify-write costs
  // nothing here because the read has already happened. The contract key is
  // carried across rather than overwritten, except when the client changes and
  // the contract is being cleared: its provenance describes a value that is
  // about to stop existing, and leaving it would outlive its subject.
  const nextProvenance: ResolutionProvenance = { ...provenanceOf(record) };
  nextProvenance.client = stamp(provenance, userId);
  if (changed) delete nextProvenance.contract;

  await db.documentImport.updateMany({
    where: { id: importId, orgId, deletedAt: null },
    data: {
      clientId,
      documentProfileId: profile.id,
      ...(changed ? { contractId: null } : {}),
      resolutionProvenance: nextProvenance as Prisma.InputJsonValue,
      updatedById: userId,
    },
  });

  const view = await resolveImportById(orgId, userId, importId);
  if (!view) throw new ResolutionError('Import not found.', 'NOT_FOUND');
  return view;
}

/**
 * Persist a client the system resolved on its own, at the moment it first
 * matters.
 *
 * The card collapses the client row whenever `buildClientSlot` resolves it, but
 * two of those three routes — a learned alias, a single exact match — resolve it
 * for display without anything being written: the view path is read-only and
 * stays that way. The contract mutations then read `record.clientId` from the
 * row and find nothing, and the user is told to pick a client that the header
 * directly above the button has already named.
 *
 * So the write happens here, on the way into a mutation that needs it, rather
 * than in the GET that displayed it. The resolution is re-run rather than
 * trusted from the request, because the client the server is about to commit
 * should be the one the server can still derive — not one a stale tab decided
 * some minutes ago. It re-runs the same `resolveClientDeterministic` the card
 * ran, so this commits precisely what was shown and never more: an ambiguous or
 * merely-fuzzy match returns the record untouched and the caller's guard fires
 * exactly as before.
 *
 * The write itself is delegated to `assignClient`, not reimplemented — that is
 * what keeps the learned alias, the profile pointer and the contract-clearing
 * rule identical to a human having picked the same client.
 */
export async function ensureClientCommitted(
  orgId: string,
  userId: string,
  record: ImportRecord,
): Promise<ImportRecord> {
  if (record.clientId) return record;

  const db = await getTenantPrismaForOrg(orgId, userId);
  const extraction = extractionOf(record);
  const documentType = documentTypeOf(record);
  const documentText = documentClientName(extraction, documentType);

  const profiles = await listProfilesForType(db, orgId, documentType);
  const scored = await scoreClients(db, orgId, profiles, documentText);

  const deterministic = resolveClientDeterministic(record, profiles, scored, documentText);
  if (!deterministic) return record;

  // The via is taken from the resolver's own verdict rather than restated here,
  // so what is stored is what actually decided — including the score and the
  // alias text, neither of which can be recovered from the client row later.
  await assignClient(orgId, userId, record.id, deterministic.clientId, {
    via: deterministic.why.via === 'PROFILE_ALIAS' ? 'PROFILE_ALIAS' : 'EXACT_MATCH',
    score: deterministic.why.score,
    matchedText: deterministic.why.matchedText,
  });

  logger.info('[document-import] committed auto-resolved client', {
    importId: record.id,
    clientId: deterministic.clientId,
    via: deterministic.why.via,
  });

  // Re-read rather than patch the object in hand: `assignClient` also writes
  // `documentProfileId` and may clear `contractId`, and the caller goes on to
  // use this record.
  const fresh = await getImportRecord(orgId, record.id, userId);
  return fresh ?? record;
}

/**
 * The contract half of `ensureClientCommitted`, and the same defect closed on
 * the other side of the card.
 *
 * `buildContractSlot` collapses the contract row when the client's profile pins
 * one or when the client has exactly one active contract, and neither of those
 * wrote anything: `contractId` stayed null while the card showed the row
 * resolved. That is precisely the shape of the client bug — an affordance
 * asserting a decision the database has no record of — and it is latent today
 * only because nothing outside the view reads `contractId` yet.
 *
 * **Phase 8: the atomic commit must call this** before it reads
 * `record.contractId`, exactly as the contract mutations call
 * `ensureClientCommitted` before reading `record.clientId`. Without it, a trip
 * created from an import whose contract was auto-resolved will commit with no
 * contract attached while the card that authorised it displayed one — and a
 * trip billed against nothing is the failure this whole module exists to
 * prevent. It is deliberately not called from anywhere yet: no current mutation
 * guards on `contractId`, and wiring it into one that does not need it would be
 * a write nobody asked for.
 *
 * The client is committed first because a contract belongs to a client — there
 * is nothing to resolve against until the client is real — which also makes one
 * call to this function sufficient to commit both slots.
 */
export async function ensureContractCommitted(
  orgId: string,
  userId: string,
  record: ImportRecord,
): Promise<ImportRecord> {
  if (record.contractId) return record;

  const committed = await ensureClientCommitted(orgId, userId, record);
  if (!committed.clientId) return committed;

  const db = await getTenantPrismaForOrg(orgId, userId);
  const documentType = documentTypeOf(committed);
  const candidates = await loadActiveContracts(db, orgId, committed.clientId);
  const profile = await getProfile(db, orgId, committed.clientId, documentType);

  // The client's name is only ever used to build `why.detail`, which this path
  // discards — only `via` and `matchedText` are persisted. Passing the generic
  // label avoids a query for a sentence nobody will read.
  const deterministic = resolveContractDeterministic(profile, candidates, 'This client', documentType);
  if (!deterministic) return committed;

  await assignContract(orgId, userId, committed.id, deterministic.contractId, {
    via: deterministic.why.via === 'PROFILE_PIN' ? 'PROFILE_PIN' : 'SINGLE_ACTIVE',
    matchedText: deterministic.why.matchedText,
  });

  logger.info('[document-import] committed auto-resolved contract', {
    importId: committed.id,
    contractId: deterministic.contractId,
    via: deterministic.why.via,
  });

  const fresh = await getImportRecord(orgId, committed.id, userId);
  return fresh ?? committed;
}

/**
 * Correct the document date.
 *
 * The card's date row needs a change affordance like every other row, and a
 * misread date is common enough to matter — spec 1.2 callout (3) is precisely
 * that a date can sit in a field labelled "Number". This writes the same column
 * `finishExtraction` writes, so it shares that function's hazard: the date is
 * part of the dedupe key, and correcting it can collide with another import of
 * the same document. That is reported rather than thrown as a 500.
 */
export async function setDocumentDate(
  orgId: string,
  userId: string,
  importId: string,
  /** `YYYY-MM-DD`, or null to clear it. */
  date: string | null,
): Promise<ImportResolutionView> {
  const record = await requireRecord(orgId, userId, importId);
  assertEditable(record);

  let parsed: Date | null = null;
  if (date) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
    if (!match) throw new ResolutionError('Use a date like 2026-07-27.', 'INVALID_DATE');
    parsed = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      throw new ResolutionError('That is not a real date.', 'INVALID_DATE');
    }
  }

  const db = await getTenantPrismaForOrg(orgId, userId);
  try {
    await db.documentImport.updateMany({
      where: { id: importId, orgId, deletedAt: null },
      data: { documentDate: parsed, updatedById: userId },
    });
  } catch (err) {
    if (isDedupeViolation(err)) {
      throw new ResolutionError(
        'Another import already covers this document number and date. Check whether it has been imported already.',
        'DUPLICATE_DOCUMENT',
      );
    }
    throw err;
  }

  const view = await resolveImportById(orgId, userId, importId);
  if (!view) throw new ResolutionError('Import not found.', 'NOT_FOUND');
  return view;
}

/** Point the import at a contract of its client, and pin it for next time. */
export async function assignContract(
  orgId: string,
  userId: string,
  importId: string,
  contractId: string,
  /** How this assignment came about. See the note on `assignClient`. */
  provenance: ProvenanceInput<ContractProvenanceVia>,
): Promise<ImportResolutionView> {
  let record = await requireRecord(orgId, userId, importId);
  assertEditable(record);
  record = await ensureClientCommitted(orgId, userId, record);
  if (!record.clientId) {
    throw new ResolutionError('Pick the client before the contract.', 'NO_CLIENT');
  }

  const db = await getTenantPrismaForOrg(orgId, userId);
  const contract = await db.carrierContract.findFirst({
    where: { id: contractId, orgId, clientId: record.clientId, deletedAt: null },
    select: { id: true },
  });
  if (!contract) {
    throw new ResolutionError('That contract does not belong to this client.', 'INVALID_CONTRACT');
  }

  // Same merge as `assignClient`, from the record read at the top of this
  // function — which, when `ensureClientCommitted` just ran, is the re-read that
  // already carries the client provenance it wrote.
  const nextProvenance: ResolutionProvenance = { ...provenanceOf(record) };
  nextProvenance.contract = stamp(provenance, userId);

  await db.documentImport.updateMany({
    where: { id: importId, orgId, deletedAt: null },
    data: {
      contractId,
      resolutionProvenance: nextProvenance as Prisma.InputJsonValue,
      updatedById: userId,
    },
  });

  await pinContract(db, orgId, userId, {
    clientId: record.clientId,
    documentType: documentTypeOf(record),
    contractId,
  });

  const view = await resolveImportById(orgId, userId, importId);
  if (!view) throw new ResolutionError('Import not found.', 'NOT_FOUND');
  return view;
}

/**
 * Create a client from the extracted details and select it.
 *
 * The caller sends the pre-filled form back, edited or not — the server does not
 * re-derive it, because the user may have corrected a misread street number and
 * silently overwriting that would be worse than any convenience.
 */
export async function createAndAssignClient(
  orgId: string,
  userId: string,
  importId: string,
  input: ClientCreateInput,
): Promise<ImportResolutionView> {
  const record = await requireRecord(orgId, userId, importId);
  assertEditable(record);

  if (!input.name || !input.name.trim()) {
    throw new ResolutionError('A client name is required.', 'INVALID_CLIENT');
  }

  const db = await getTenantPrismaForOrg(orgId, userId);

  let created;
  try {
    // The existing creation path, with its per-org unique-name rule and contact
    // normalisation. Passing `db` is what lets the mobile surface use it at all
    // — see the note on `createClient` (DEC-11).
    created = await createClient(orgId, input, db);
  } catch (err) {
    if (err instanceof DuplicateClientError) {
      throw new ResolutionError(
        `A client called “${input.name.trim()}” already exists. Pick it from the list instead.`,
        'DUPLICATE_CLIENT',
      );
    }
    throw err;
  }

  return assignClient(orgId, userId, importId, created.id, { via: 'MANUAL_CREATE' });
}

export interface CreateContractInput {
  /** True for the one-time spot contract offered on a rate confirmation. */
  spot: boolean;
  /** Decimal-safe string. Required when `spot` is true. */
  baseRate?: string | null;
  rateType?: string;
  contractName?: string;
  effectiveDate?: string;
  expirationDate?: string;
  notes?: string;
}

/**
 * Document amount → `Prisma.Decimal`, or null.
 *
 * Two steps on purpose. `normaliseMoney` is pure and tested (`money.ts`); the
 * Decimal is built from the string it returns. At no point does the value pass
 * through `Number`, which is the whole requirement — the column is
 * `Decimal(10,4)` and a float would have already lost the value before it got
 * there (spec Section 15, verify check 6).
 */
function parseMoney(raw: string | null | undefined): Prisma.Decimal | null {
  const cleaned = normaliseMoney(raw);
  if (!cleaned) return null;
  try {
    return new Prisma.Decimal(cleaned);
  } catch {
    return null;
  }
}

/**
 * Create a contract for this import's client and select it.
 *
 * Two paths. The plain one — `spot: false`, behind `contract.createOffer` — is
 * an ordinary standing contract for a client that has none: nothing on it but a
 * name and the client, because nothing else is on the document. The rate type
 * is checked against `RATE_TYPES` rather than passed through, since the column
 * carries a CHECK constraint and an unknown value would surface as a 500 from
 * Postgres rather than as the sentence below.
 *
 * The spot path is item 3 in full: typed `spot`, a flat rate taken from the
 * document, effective and expiring on the same day so its term is one trip, the
 * source document attached to it, and a name that says "One-time" before
 * anything else. Nothing about it can be mistaken for a standing agreement —
 * `isOneTimeContract` reads its term, not its name, so the label survives a
 * rename.
 */
export async function createAndAssignContract(
  orgId: string,
  userId: string,
  importId: string,
  input: CreateContractInput,
): Promise<ImportResolutionView> {
  let record = await requireRecord(orgId, userId, importId);
  assertEditable(record);
  record = await ensureClientCommitted(orgId, userId, record);
  if (!record.clientId) {
    throw new ResolutionError('Pick the client before the contract.', 'NO_CLIENT');
  }

  const db = await getTenantPrismaForOrg(orgId, userId);
  const extraction = extractionOf(record);

  const rate = parseMoney(input.baseRate ?? extraction?.header?.totalRate ?? null);
  if (input.spot && !rate) {
    throw new ResolutionError(
      'A rate is needed for a one-time contract. Enter the amount from the document.',
      'NO_RATE',
    );
  }

  const rateType = input.rateType?.trim() || DEFAULT_RATE_TYPE;
  if (!input.spot && !(RATE_TYPES as readonly string[]).includes(rateType)) {
    throw new ResolutionError(`“${rateType}” is not a rate type this system uses.`, 'INVALID_CONTRACT');
  }

  const date = input.effectiveDate ?? tripDate(record, extraction);

  const created = await createContract(
    orgId,
    record.clientId,
    input.spot
      ? {
          contractType: 'spot',
          contractName: input.contractName?.trim() || spotContractName(record, date),
          rateType: 'flat',
          // `createContract` hands this straight to a Decimal(10,4) column.
          // A Decimal stringifies without precision loss; a float would not.
          baseRate: rate!.toString(),
          effectiveDate: date,
          // Same day. This IS "effective for that trip only", and it is what
          // `isOneTimeContract` reads.
          expirationDate: date,
          status: 'active',
          notes:
            input.notes?.trim() ||
            `Created from an imported rate confirmation${record.documentNumber ? ` (${record.documentNumber})` : ''}. One-time agreement for this trip only — not a standing contract.`,
        }
      : {
          contractType: 'contract',
          contractName: input.contractName?.trim() || undefined,
          rateType,
          ...(rate ? { baseRate: rate.toString() } : {}),
          ...(input.effectiveDate ? { effectiveDate: input.effectiveDate } : {}),
          ...(input.expirationDate ? { expirationDate: input.expirationDate } : {}),
          status: 'active',
          ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
        },
    db,
  );

  if (input.spot) {
    await attachSourceDocument(db, orgId, userId, record, created.id);
  }

  return assignContract(orgId, userId, importId, created.id, { via: 'CREATED_THIS_IMPORT' });
}

/**
 * Attach the imported document to the contract it produced.
 *
 * Item 3 requires the source document on the spot contract, and the reason is
 * practical rather than tidy: a one-time contract's only justification is the
 * piece of paper that created it, and a rate nobody can trace back to a
 * document is a rate nobody can defend in a billing dispute.
 *
 * `carrier_documents` has no `orgId` — it is scoped through its parent — so the
 * contract having been created under this org is what scopes this row.
 * A failure here is logged and swallowed: the contract is created and selected,
 * and losing that work over a missing attachment would be the worse trade.
 */
async function attachSourceDocument(
  db: PrismaClient,
  orgId: string,
  userId: string,
  record: ImportRecord,
  contractId: string,
): Promise<void> {
  const key = record.sourceFileKeys[0];
  if (!key) return;

  try {
    await db.carrierDocument.create({
      data: {
        parentType: 'contract',
        parentId: contractId,
        contractId,
        clientId: record.clientId,
        documentType: 'rate_confirmation',
        fileUrl: key,
        filename: record.originalName ?? 'rate-confirmation',
        uploadedBy: userId,
        notes: `Imported document ${record.id}`,
      },
    });
  } catch (err) {
    logger.warn('[document-import] could not attach source document to spot contract', {
      importId: record.id,
      contractId,
      orgId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
