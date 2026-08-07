/**
 * The read-only half of facility resolution: load, decide, describe.
 *
 * Spec Section 7. This module answers "what tier is each stop on, and why", and
 * it **writes nothing**. Every write in this phase lives in
 * `facility-resolution.ts`, at a mutation boundary, exactly as
 * `ensureClientCommitted` does for the client — the lesson of quick-508 was that
 * a GET which quietly commits is a GET nobody can reason about, and the lesson
 * of quick-509 was that a view which merely *displays* a resolution must say so
 * rather than imply a save. `StopSlotView.persisted` is that distinction, on the
 * payload, where no surface can lose it.
 *
 * It is also deliberately upstream of `resolution.ts`: the client/contract
 * mutations return `ImportResolutionView`, whose stop counts come from here, and
 * the facility mutations need `ensureClientCommitted` from there. Splitting the
 * loads and the decision out of the writes is what keeps that a straight line
 * rather than a cycle.
 *
 * TENANT SCOPING IS EXPLICIT AND NOT OPTIONAL. `CarrierFacility` and
 * `FacilityExternalReference` are both in `EXEMPT_MODELS` (they use `orgId`, not
 * `tenantId`), so the RLS extension injects nothing for them and every `where`
 * below carries `orgId` itself.
 */

import type { CanonicalExtraction, CanonicalConsignment } from '@drivecommand/validation';
import type { PrismaClient } from '@/generated/prisma';

import { formatNormalised, normaliseAddress } from './address';
import {
  autoLinkTarget,
  facilityAddress,
  normaliseSourceCode,
  resolveFacilityTier,
  type FacilityPrefill,
  type FacilityProposal,
  type FacilityTier,
  type LadderContext,
  type LadderFacility,
  type LadderVerdict,
} from './facility-ladder';
import { stopFingerprint, stopProvenanceOf, type StopProvenance, type StopProvenanceVia } from './provenance';
import type { ImportRecord } from './persistence';

// ---------------------------------------------------------------------------
// View types — mirrored verbatim in packages/api-client/src/owner-imports.ts
// ---------------------------------------------------------------------------

/**
 * How a stop's facility came to be its facility.
 *
 * The same four values as `StopProvenanceVia`, and that is not an oversight.
 * For the client slot the render vocabulary and the storage vocabulary were
 * separated because a stored `MANUAL` had to render differently from a computed
 * `EXACT_MATCH`; here the four rungs of the ladder answer both questions with
 * the same word. What the view adds is `persisted`, which says whether the link
 * has been written yet — a T1 verdict on screen and a T1 record in the row are
 * the same decision at two different moments, not two different decisions.
 */
export type StopResolvedVia = StopProvenanceVia;

export interface StopWhyView {
  via: StopResolvedVia;
  /** The facility-side text that matched — the code, or the stored address. */
  matchedText: string | null;
  /** What the document said. */
  documentText: string | null;
  /** 0..1. `1` means exact. Null when nothing was matched at all. */
  score: number | null;
  /** One plain sentence (spec 4.2). */
  detail: string;
}

export interface StopFacilityView {
  id: string;
  name: string;
  /** One line, normalised, for display. */
  address: string;
  facilityType: string;
}

export type StopSlotState =
  /** T1, T2, or a link a person already confirmed. Nothing to do. */
  | 'LINKED'
  /** T3 — candidates above the threshold. A human must tap. */
  | 'PROPOSED'
  /** T4 — nothing matched. A human must tap a pre-filled create form. */
  | 'NEW';

export interface StopSlotView {
  /** Index into `extraction.consignments`. The key everything else uses. */
  index: number;
  documentName: string;
  documentAddress: string;
  sourceCode: string | null;

  tier: FacilityTier;
  state: StopSlotState;

  facility: StopFacilityView | null;
  why: StopWhyView | null;

  /**
   * T3 candidates, with score and differing fields. Empty on every other state.
   * A candidate is never a decision — see `facility-ladder.ts`.
   */
  proposals: FacilityProposal[];
  /** The pre-filled create form. Present on T3 ("none of these") and T4. */
  prefill: FacilityPrefill | null;

  /**
   * True when the ladder will not proceed without a person. The hard rule, on
   * the payload: no surface can render a T3 or T4 stop as settled.
   */
  requiresHumanTap: boolean;

  /**
   * True when the link is on the import row, false when it has only been
   * computed for this read.
   *
   * A silent T1 or T2 is displayed the moment it is derived and written when a
   * mutation next needs it (`ensureStopsCommitted`). Saying which is which here
   * is what stops this view from making the claim the Phase 3 footer had to have
   * removed — "the values above are saved" — when it could not know.
   */
  persisted: boolean;
}

export interface StopResolutionView {
  stops: StopSlotView[];
  total: number;
  /** Linked to an existing facility — silently or by a person. */
  matched: number;
  /** Facilities created from this document, by a person. */
  created: number;
  /** Still waiting on a human tap. */
  needsReview: number;
  /** "11 matched · 1 new", as spec 4.1 draws it. */
  note: string;
}

// ---------------------------------------------------------------------------
// Loads — every one tenant-scoped
// ---------------------------------------------------------------------------

const FACILITY_SELECT = {
  id: true,
  name: true,
  facilityType: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  zip: true,
} as const;

/**
 * Every facility in the tenant the ladder is allowed to match against.
 *
 * Two exclusions, both of which are correctness rather than tidiness:
 *
 *  - **Soft-deleted facilities.** `softDeleteFacility` marks a facility by
 *    prefixing its type with `inactive_` (there is no `deleted_at` and no
 *    `active` column on this table — audit finding B4, still open, and out of
 *    scope here because closing it needs DDL this phase may not write). A
 *    facility a dispatcher believes is gone must not be a silent T1 or T2 target,
 *    so it is filtered the same way `getFacility` and `updateFacility` already
 *    filter it.
 *  - **Driver residences.** Spec Section 9 makes this a hard requirement:
 *    a driver's home is visible only to that driver, the owner, and dispatchers
 *    with explicit permission — "not in the general picker, not suggested for
 *    other trips", enforced server-side and never as a UI hide. A consignee
 *    ladder is the general picker.
 *
 * Loaded whole rather than paged, for the same reason the client candidates are:
 * "does this address match exactly one facility" is not a question a page can
 * answer. Fine at carrier scale; if a tenant ever has tens of thousands of
 * facilities the fix is a stored normalised-address key with an index, not
 * paging.
 */
export async function loadFacilityCandidates(
  db: PrismaClient,
  orgId: string,
): Promise<LadderFacility[]> {
  const rows = await db.carrierFacility.findMany({
    where: {
      orgId,
      NOT: { facilityType: { startsWith: 'inactive_' } },
      isDriverResidence: false,
    },
    select: FACILITY_SELECT,
    orderBy: { name: 'asc' },
  });
  return rows as LadderFacility[];
}

/**
 * The confirmed `(tenant, client, code) -> facility` links for one client.
 *
 * This is the table the whole module is for. Day one, `43775` is a T4 and a
 * person confirms it; every day after, it is a T1 and nobody is asked.
 *
 * The null short-circuit is kept deliberately (quick-511 narrowed *what* is
 * passed in, not this). A tenant whose client genuinely cannot be resolved has
 * no key to look references up by — `client_id` is `NOT NULL` on the table — and
 * an empty map is the correct answer, not an error: the stop simply falls to T2
 * or T3 and a person decides, which is the ladder working.
 */
export async function loadExternalReferences(
  db: PrismaClient,
  orgId: string,
  clientId: string | null,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!clientId) return out;

  const rows = await db.facilityExternalReference.findMany({
    where: { orgId, clientId },
    select: { sourceCode: true, facilityId: true },
  });

  for (const row of rows) {
    const code = normaliseSourceCode(row.sourceCode);
    if (code) out.set(code, row.facilityId);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Describing a decision
// ---------------------------------------------------------------------------

function consignmentsOf(record: ImportRecord): CanonicalConsignment[] {
  const raw = (record.reviewedExtraction ?? record.rawExtraction) as CanonicalExtraction | null;
  if (!raw || !Array.isArray(raw.consignments)) return [];
  return raw.consignments;
}

/** The identity of the consignment at an index, for the provenance fingerprint. */
export function fingerprintOf(consignment: CanonicalConsignment): string {
  return stopFingerprint({
    sourceCode: consignment.externalCode ?? null,
    name: consignment.name ?? '',
    addressKey: normaliseAddress(consignment.address ?? {}).key,
  });
}

function toFacilityView(facility: LadderFacility): StopFacilityView {
  return {
    id: facility.id,
    name: facility.name,
    address: formatNormalised(normaliseAddress(facilityAddress(facility))),
    facilityType: facility.facilityType,
  };
}

const DETAIL: Record<StopResolvedVia, (matchedText: string | null) => string> = {
  EXTERNAL_REF: (code) =>
    `Code ${code ?? 'on the document'} is saved on this client from a previous import.`,
  NORMALISED_ADDRESS: () =>
    'The address on the document is this facility once punctuation, abbreviations and the postcode are normalised.',
  MANUAL: () => 'You picked this facility.',
  MANUAL_CREATE: () => 'You created this facility from this document.',
};

function whyFor(via: StopResolvedVia, matchedText: string | null, documentText: string | null, score: number | null): StopWhyView {
  return { via, matchedText, documentText, score, detail: DETAIL[via](matchedText) };
}

/** The "why" for a decision already on the row. Rendered from what was stored. */
function whyFromProvenance(stored: StopProvenance, documentText: string): StopWhyView {
  return whyFor(stored.via, stored.matchedText ?? stored.sourceCode, documentText, stored.score);
}

/** The "why" for a decision computed on this read and not yet written. */
function whyFromVerdict(verdict: LadderVerdict): StopWhyView | null {
  if (verdict.tier === 'T1') {
    // 1 because a source code either matches or it does not. Nothing was
    // guessed, so "no score" would be misleading in the other direction.
    return whyFor('EXTERNAL_REF', verdict.sourceCode, verdict.documentText, 1);
  }
  if (verdict.tier === 'T2') {
    return whyFor('NORMALISED_ADDRESS', verdict.matchedText, verdict.documentText, 1);
  }
  return null;
}

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

/** One stop, with the ladder verdict that produced it. Used by the writers too. */
export interface StopDecision {
  slot: StopSlotView;
  verdict: LadderVerdict | null;
  fingerprint: string;
  consignment: CanonicalConsignment;
}

/**
 * Decide every stop on an import. Pure once the loads are done.
 *
 * A stored decision wins over a fresh one, but only if it is still about the
 * same consignment: `stopFingerprint` is compared, and a mismatch means stop
 * review reordered or rewrote the stop at that index, so the record is dropped
 * and the ladder runs again. Silently trusting the index would attach one
 * consignee's confirmed facility to another's freight.
 */
export function decideStops(record: ImportRecord, context: LadderContext): StopDecision[] {
  const consignments = consignmentsOf(record);
  const stored = stopProvenanceOf(record);
  const byId = new Map(context.candidates.map((f) => [f.id, f]));

  return consignments.map((consignment, index) => {
    const fingerprint = fingerprintOf(consignment);
    const documentAddress = formatNormalised(normaliseAddress(consignment.address ?? {}));
    const documentText = [consignment.name, documentAddress].filter(Boolean).join(' · ');

    const base = {
      index,
      documentName: consignment.name ?? '',
      documentAddress,
      sourceCode: consignment.externalCode?.trim() || null,
      proposals: [] as FacilityProposal[],
      prefill: null as FacilityPrefill | null,
    };

    // --- Already decided, and still about this consignment -------------------
    const record_ = stored[String(index)];
    const facility = record_ && record_.stopFingerprint === fingerprint ? byId.get(record_.facilityId) : undefined;
    if (record_ && facility) {
      return {
        slot: {
          ...base,
          // A stored link is what T1 and T2 were reaching for and what T3 and T4
          // end at. The tier it came from is in the via, not re-derived here.
          tier: record_.via === 'EXTERNAL_REF' ? 'T1' : record_.via === 'NORMALISED_ADDRESS' ? 'T2' : record_.via === 'MANUAL' ? 'T3' : 'T4',
          state: 'LINKED',
          facility: toFacilityView(facility),
          why: whyFromProvenance(record_, documentText),
          requiresHumanTap: false,
          persisted: true,
        },
        verdict: null,
        fingerprint,
        consignment,
      };
    }

    // --- Undecided: walk the ladder -----------------------------------------
    const verdict = resolveFacilityTier(
      {
        sourceCode: consignment.externalCode ?? null,
        name: consignment.name ?? '',
        address: consignment.address ?? {},
      },
      context,
    );

    const auto = autoLinkTarget(verdict);
    const target = auto ? byId.get(auto.facilityId) : undefined;

    const slot: StopSlotView = auto && target
      ? {
          ...base,
          tier: verdict.tier,
          state: 'LINKED',
          facility: toFacilityView(target),
          why: whyFromVerdict(verdict),
          requiresHumanTap: false,
          // Derived this read; written when a mutation next needs it.
          persisted: false,
        }
      : {
          ...base,
          tier: verdict.tier,
          state: verdict.tier === 'T3' ? 'PROPOSED' : 'NEW',
          facility: null,
          why: null,
          proposals: verdict.tier === 'T3' ? verdict.proposals : [],
          prefill: verdict.tier === 'T3' || verdict.tier === 'T4' ? verdict.prefill : null,
          // The hard rule, stated on the payload rather than left to a client.
          requiresHumanTap: true,
          persisted: false,
        };

    return { slot, verdict, fingerprint, consignment };
  });
}

function noteFor(view: Omit<StopResolutionView, 'note'>): string {
  if (view.total === 0) return 'No stops on this document yet.';
  const parts: string[] = [];
  if (view.matched) parts.push(`${view.matched} matched`);
  if (view.created) parts.push(`${view.created} created`);
  if (view.needsReview) parts.push(`${view.needsReview} need${view.needsReview === 1 ? 's' : ''} a look`);
  return parts.join(' · ');
}

export function summariseStops(decisions: StopDecision[]): StopResolutionView {
  const stops = decisions.map((d) => d.slot);
  const partial = {
    stops,
    total: stops.length,
    matched: stops.filter((s) => s.state === 'LINKED' && s.why?.via !== 'MANUAL_CREATE').length,
    created: stops.filter((s) => s.why?.via === 'MANUAL_CREATE').length,
    needsReview: stops.filter((s) => s.requiresHumanTap).length,
  };
  return { ...partial, note: noteFor(partial) };
}

/**
 * The whole stop-resolution view for one import.
 *
 * Read-only. It loads, it decides, it describes, and it returns — no branch of
 * it writes, and `facility-resolution.ts` is where every write lives.
 *
 * ---------------------------------------------------------------------------
 * WHY THE CLIENT IS A PARAMETER AND NOT `record.clientId` (quick-511)
 * ---------------------------------------------------------------------------
 * It used to read `record.clientId` directly, and that was the bug. External
 * references are keyed `(org_id, client_id, source_code)`, so with a null client
 * `loadExternalReferences` short-circuits to an empty map and **T1 can never
 * fire** — every learned code falls through to T2 and resolves on address
 * instead, which is silent and correct-looking and completely misattributes why.
 *
 * `record.clientId` is null in the ordinary case: a client that auto-resolved is
 * displayed as RESOLVED but only written when a mutation next needs it
 * (quick-508). So the *persisted* client is the wrong thing to scope by; the
 * **effective** client — persisted, else what the deterministic resolver says —
 * is the right thing, and it is the caller's job to supply because the resolver
 * lives in `resolution.ts` and importing it here would close a cycle.
 *
 * The commit path arrives at the same value from the other direction:
 * `ensureStopsCommitted` runs `ensureClientCommitted` (which sets `clientId`
 * from that same resolver) before building its context, so its effective client
 * is already persisted. The two contexts are therefore equal by construction,
 * not by coincidence — which is the identical-decision property this module
 * depends on.
 */
export async function resolveStops(
  db: PrismaClient,
  orgId: string,
  record: ImportRecord,
  /** The effective client — see the note above. Null only when truly unresolved. */
  effectiveClientId: string | null,
): Promise<StopResolutionView> {
  const [candidates, referencesByCode] = await Promise.all([
    loadFacilityCandidates(db, orgId),
    loadExternalReferences(db, orgId, effectiveClientId),
  ]);
  return summariseStops(decideStops(record, { candidates, referencesByCode }));
}

/** The counts alone, for the summary card's stop row. */
export async function resolveStopCounts(
  db: PrismaClient,
  orgId: string,
  record: ImportRecord,
  effectiveClientId: string | null,
): Promise<{ total: number; matched: number; created: number; note: string }> {
  const view = await resolveStops(db, orgId, record, effectiveClientId);
  return { total: view.total, matched: view.matched, created: view.created, note: view.note };
}
