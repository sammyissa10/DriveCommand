/**
 * Route-template candidate selection and the summary-card slot — the READ half.
 * Spec Section 8, presentation per Sections 4.1 / 4.2.
 *
 * ---------------------------------------------------------------------------
 * NOTHING IN THIS FILE WRITES
 * ---------------------------------------------------------------------------
 * It loads, it scores, it describes, it returns. Every write in this phase is in
 * `template-service.ts`, exactly as `facility-lookup.ts` and
 * `facility-resolution.ts` are split in Phase 4 — and for the reason quick-508
 * established: a GET that quietly commits is a GET nobody can reason about, and
 * a view that writes cannot be called from a search-as-you-type endpoint.
 *
 * It also sits UPSTREAM of `resolution.ts` rather than importing it, so the
 * dependency stays a line rather than a cycle. That is why the effective client
 * arrives as a parameter: `resolveEffectiveClientId` lives in `resolution.ts`,
 * and quick-511 is the reason it must be the *effective* client and never
 * `record.clientId` — that column is null on every import whose client merely
 * auto-resolved, and scoping candidate templates by it would return an empty
 * list on precisely the day-two import this whole phase exists to serve.
 */

import type { PrismaClient } from '@/generated/prisma';
import type { CanonicalAddress } from '@drivecommand/validation';

import { normaliseAddress, formatNormalised } from './address';
import type { StopDecision } from './facility-lookup';
import type { ImportRecord } from './persistence';
import { templateProvenanceOf, type TemplateProvenanceVia } from './provenance';
import {
  bandFor,
  buildTemplateDiff,
  describeDiff,
  deterministicTemplate,
  facilitySetForImport,
  isTemplateInsertedStop,
  rankTemplates,
  templateFacilitySet,
  topCandidates,
  type ImportStopRef,
  type TemplateBand,
  type TemplateDiff,
  type TemplateScore,
  type TemplateStopRef,
} from './template-matching';
import { TEMPLATE_AUTO_APPLY_THRESHOLD, TEMPLATE_CANDIDATE_THRESHOLD } from './template-constants';

// ---------------------------------------------------------------------------
// View types — mirrored verbatim in packages/api-client/src/owner-imports.ts
// ---------------------------------------------------------------------------

export interface TemplateWhyView {
  via: TemplateProvenanceVia;
  /** 0..1. The number the card shows next to "why". */
  score: number | null;
  /** The template that matched. */
  matchedText: string | null;
  /** "6 of 8 stops in common" — the arithmetic, in words. */
  detail: string;
}

export interface TemplateCandidateView {
  id: string;
  name: string;
  score: number;
  /** Rounded for display once, server-side, so the two surfaces cannot round differently. */
  scorePercent: number;
  stopCount: number;
  /** True when this candidate came from the CLIENT rather than the contract. */
  widened: boolean;
  /** "6 matched · 2 new · 1 not on today's manifest". */
  diffNote: string;
  diff: TemplateDiff;
  /** True when the stop counts differ enough that the score was weighted down. */
  countMismatch: boolean;
  /** Auto-created from an import and not yet confirmed by a human (Section 8). */
  isSuggested: boolean;
}

export type TemplateSlotState =
  /** A template is selected — auto-collapsed at 0.75+, or picked by a person. */
  | 'RESOLVED'
  /** 0.45–0.75: up to three ranked candidates, each with a stop diff. */
  | 'CANDIDATES'
  /** Below 0.45, or nothing to compare: only "Continue without a template". */
  | 'NONE'
  /** A person chose to run without one. A decision, not an absence. */
  | 'DECLINED'
  /** Cannot be decided yet — no client, or no stops. */
  | 'BLOCKED';

export interface TemplateSlotView {
  state: TemplateSlotState;
  value: TemplateCandidateView | null;
  why: TemplateWhyView | null;
  candidates: TemplateCandidateView[];
  /**
   * Every candidate this import has, ranked, **uncapped** — the list behind
   * "Change" (quick-516).
   *
   * `candidates` is the middle band's presentation and is capped at three,
   * because that is what Section 8 asks a dispatcher to *choose between* when the
   * system has no answer. This is a different question: someone is looking at a
   * template the system already picked and saying "not that one". Capping their
   * options to the same three would hide the 0.50 route they are reaching for
   * behind the 0.80 they just rejected — which is exactly the state quick-516 was
   * filed about, where the only reachable answer was "no template at all".
   *
   * Filtered on `band`, never on a number, so the 0.45 line still lives in
   * `template-constants.ts` and nowhere else. Includes the currently selected
   * template when it scores, so the chooser can mark it rather than silently
   * omit it; the UI disables that row.
   *
   * Empty on `DECLINED` — see the early return in `buildTemplateSlot`. Nothing is
   * matched on a row where a person has already answered, and "Look again" is a
   * mutation that clears the answer rather than a read that ignores it.
   */
  alternatives: TemplateCandidateView[];
  /**
   * True when the CONTRACT had no templates and the search was widened to the
   * client's. Section 8 requires widened candidates to be visibly labelled, so
   * it is on the payload rather than left for a component to infer from a count.
   */
  widened: boolean;
  /**
   * True when the selection has been written to `document_imports.route_template_id`.
   * False means "derived on this read" — the same honest flag `StopSlotView`
   * carries, and for the same reason: an auto-collapsed value is displayed the
   * moment it is derived and written when a mutation next needs it (quick-508).
   */
  persisted: boolean;
  /** True once the template's order and standing fields were merged into the stops. */
  applied: boolean;
  /** Set when the row cannot be decided yet. */
  blockedReason: string | null;
  /** Both thresholds, so the UI can explain a band without restating a number. */
  thresholds: { autoApply: number; candidate: number };
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

const TEMPLATE_STOP_SELECT = {
  sequenceOrder: true,
  facilityId: true,
  stopType: true,
  contactName: true,
  contactPhone: true,
  apptWindowStartOffsetMin: true,
  apptWindowEndOffsetMin: true,
  bolRequired: true,
  podRequired: true,
  specialInstructions: true,
  facility: {
    select: {
      id: true,
      name: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      zip: true,
    },
  },
} as const;

export interface LoadedTemplate {
  id: string;
  templateName: string;
  clientId: string;
  contractId: string | null;
  scheduledDepartureTime: string | null;
  isSuggested: boolean;
  /** True when this template was found by widening from contract to client. */
  widened: boolean;
  stops: TemplateStopRef[];
}

/**
 * Candidate templates for one import.
 *
 * **Contract first, widened to the client only when the contract has none** —
 * Section 8's rule, and the order matters: a client with a Chicago contract and
 * a Milwaukee contract runs two different sets of docks, and offering the
 * Milwaukee templates against a Chicago manifest is how a dispatcher applies an
 * order for the wrong lane. Widening is a fallback for the empty case, never a
 * merge of the two.
 *
 * The widened flag rides on every row rather than only on the batch, because it
 * is a property of that candidate that the card has to render next to its name.
 *
 * Inactive templates are excluded. A template someone deactivated must not be a
 * silent 0.75 auto-collapse — the same exclusion, for the same reason, that
 * `loadFacilityCandidates` applies to soft-deleted facilities.
 */
export async function loadTemplateCandidates(
  db: PrismaClient,
  orgId: string,
  clientId: string | null,
  contractId: string | null,
): Promise<LoadedTemplate[]> {
  if (!clientId) return [];

  const base = {
    orgId,
    clientId,
    active: true,
  };

  const order = [
    // Most recently applied first. A tie in the score then breaks toward the
    // template the tenant actually runs, which is the better guess and, more
    // importantly, a STABLE one — see `rankTemplates`.
    { lastAppliedAt: 'desc' as const },
    { createdAt: 'desc' as const },
  ];

  if (contractId) {
    const onContract = await db.routeTemplate.findMany({
      where: { ...base, contractId },
      select: TEMPLATE_SELECT,
      orderBy: order,
    });
    if (onContract.length > 0) return onContract.map((t) => toLoadedTemplate(t, false));
  }

  const onClient = await db.routeTemplate.findMany({
    where: base,
    select: TEMPLATE_SELECT,
    orderBy: order,
  });
  // Widened only when we actually fell through from a contract that had none.
  return onClient.map((t) => toLoadedTemplate(t, Boolean(contractId)));
}

const TEMPLATE_SELECT = {
  id: true,
  templateName: true,
  clientId: true,
  contractId: true,
  scheduledDepartureTime: true,
  isSuggested: true,
  stops: { select: TEMPLATE_STOP_SELECT, orderBy: { sequenceOrder: 'asc' as const } },
} as const;

type TemplateRow = {
  id: string;
  templateName: string;
  clientId: string;
  contractId: string | null;
  scheduledDepartureTime: string | null;
  isSuggested: boolean;
  stops: {
    sequenceOrder: number;
    facilityId: string;
    stopType: string;
    contactName: string | null;
    contactPhone: string | null;
    apptWindowStartOffsetMin: number | null;
    apptWindowEndOffsetMin: number | null;
    bolRequired: boolean;
    podRequired: boolean;
    specialInstructions: string | null;
    facility: {
      id: string;
      name: string;
      addressLine1: string | null;
      addressLine2: string | null;
      city: string | null;
      state: string | null;
      zip: string | null;
    };
  }[];
};

function toLoadedTemplate(row: TemplateRow, widened: boolean): LoadedTemplate {
  return {
    id: row.id,
    templateName: row.templateName,
    clientId: row.clientId,
    contractId: row.contractId,
    scheduledDepartureTime: row.scheduledDepartureTime,
    isSuggested: row.isSuggested,
    widened,
    stops: row.stops.map((s) => ({
      sequenceOrder: s.sequenceOrder,
      facilityId: s.facilityId,
      facilityName: s.facility.name,
      facilityAddress: addressOf(s.facility),
      stopType: s.stopType,
      contactName: s.contactName,
      contactPhone: s.contactPhone,
      apptWindowStartOffsetMin: s.apptWindowStartOffsetMin,
      apptWindowEndOffsetMin: s.apptWindowEndOffsetMin,
      bolRequired: s.bolRequired,
      podRequired: s.podRequired,
      specialInstructions: s.specialInstructions,
    })),
  };
}

function addressOf(facility: {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}): CanonicalAddress {
  return {
    line1: facility.addressLine1,
    line2: facility.addressLine2,
    city: facility.city,
    state: facility.state,
    postalCode: facility.zip,
    country: null,
  };
}

/** One line, for a candidate row. Uses the shared normaliser, not a second one. */
export const facilityLine = (address: CanonicalAddress): string =>
  formatNormalised(normaliseAddress(address));

// ---------------------------------------------------------------------------
// The import's side of the comparison
// ---------------------------------------------------------------------------

/**
 * The import's stops, with the facility the ladder resolved for each.
 *
 * **This is the only bridge between names and ids in the matcher**, and it hands
 * the scorer ids. A stop the ladder has not settled carries `facilityId: null`
 * and `facilitySetForImport` turns it into a member that cannot match — see that
 * function for why an unresolved stop must count rather than vanish.
 *
 * `skipped` comes off the consignment, which is where stop review writes it and
 * where the merge writes it for a template stop that is not on today's manifest.
 * It is carried here rather than looked up later because this is the one place
 * that holds the decision and the consignment side by side (quick-517).
 */
export function importStopsFrom(decisions: readonly StopDecision[]): ImportStopRef[] {
  return decisions.map((d) => ({
    index: d.slot.index,
    facilityId: d.slot.facility?.id ?? null,
    name: d.slot.documentName || d.slot.facility?.name || '',
    skipped: Boolean(d.consignment?.skipped),
    // A ghost from a previous application — not part of the import, and dropped
    // by the next merge rather than promoted into it (quick-518). Decided by the
    // shared predicate so the diff, the merge and the preview cannot disagree
    // about which rows those are.
    templateInserted: d.consignment ? isTemplateInsertedStop(d.consignment) : false,
  }));
}

// ---------------------------------------------------------------------------
// The slot
// ---------------------------------------------------------------------------

const VIA_DETAIL: Record<TemplateProvenanceVia, string> = {
  AUTO_MATCH: 'The stops on this document match this saved route.',
  MANUAL: 'You picked this template.',
  NONE: 'You chose to run this trip without a template.',
  AUTO_CREATED: 'Created from this import, because this tenant creates templates automatically.',
  SAVED_FROM_IMPORT: 'You saved this trip as a template.',
};

function candidateView(
  template: LoadedTemplate,
  score: TemplateScore,
  diff: TemplateDiff,
): TemplateCandidateView {
  return {
    id: template.id,
    name: template.templateName,
    score: score.score,
    scorePercent: Math.round(score.score * 100),
    stopCount: template.stops.length,
    widened: template.widened,
    diffNote: describeDiff(diff),
    diff,
    countMismatch: score.countMismatch,
    isSuggested: template.isSuggested,
  };
}

export interface TemplateSlotInput {
  record: ImportRecord;
  decisions: readonly StopDecision[];
  templates: readonly LoadedTemplate[];
  /** Null when the client itself could not be resolved. */
  effectiveClientId: string | null;
}

/**
 * The summary card's Template row, and everything the three bands need.
 *
 * The three presentations of Section 8 are one `switch` on `bandFor`, so there
 * is no second place where "0.75" or "0.45" could be compared against — the
 * constants are imported by `bandFor` alone, and every caller asks it.
 *
 * Read-only. It computes what a mutation *would* commit; `ensureTemplateCommitted`
 * runs the same `deterministicTemplate` over the same inputs and writes it. The
 * card's answer and the row's value therefore cannot differ, which is the
 * property quick-508 had to be written to restore for the client.
 */
export function buildTemplateSlot(input: TemplateSlotInput): TemplateSlotView {
  const { record, decisions, templates, effectiveClientId } = input;
  const thresholds = { autoApply: TEMPLATE_AUTO_APPLY_THRESHOLD, candidate: TEMPLATE_CANDIDATE_THRESHOLD };
  const widened = templates.some((t) => t.widened);
  const stored = templateProvenanceOf(record);

  const empty = (state: TemplateSlotState, blockedReason: string | null = null): TemplateSlotView => ({
    state,
    value: null,
    why: null,
    candidates: [],
    alternatives: [],
    widened,
    persisted: false,
    applied: false,
    blockedReason,
    thresholds,
  });

  // ---- A decision already on the row wins over anything computed ------------
  // Same shape as `buildClientSlot`'s "already chosen" branch, and the same
  // reason: once a person (or a committed auto-match) has answered, re-deriving
  // would let a changed stop list quietly overrule them.
  if (stored?.via === 'NONE') {
    return {
      ...empty('DECLINED'),
      why: { via: 'NONE', score: null, matchedText: null, detail: VIA_DETAIL.NONE },
      persisted: true,
    };
  }

  const importStops = importStopsFrom(decisions);
  const importIds = facilitySetForImport(importStops);

  if (!effectiveClientId) {
    return empty('BLOCKED', 'Pick the client first — templates belong to a client.');
  }
  if (importStops.length === 0) {
    return empty('BLOCKED', 'No stops were read from this document, so there is nothing to match.');
  }

  const ranked = rankTemplates(
    importIds,
    templates.map((t) => ({ template: t, facilityIds: templateFacilitySet(t.stops) })),
  );

  // Everything a person could switch to, computed once and attached to every
  // state below (quick-516). Uncapped and filtered on the band the ranker already
  // decided, so this cannot become a second opinion about what "close enough to
  // offer" means.
  const alternatives = ranked
    .filter((r) => r.band !== 'NONE')
    .map((r) => candidateView(r.template, r.score, buildTemplateDiff(importStops, r.template.stops)));

  // ---- A template already selected on the row -------------------------------
  if (record.routeTemplateId) {
    const chosen = templates.find((t) => t.id === record.routeTemplateId);
    if (chosen) {
      const scored = ranked.find((r) => r.template.id === chosen.id)?.score;
      const diff = buildTemplateDiff(importStops, chosen.stops);
      return {
        state: 'RESOLVED',
        value: candidateView(chosen, scored ?? scoreless(importStops.length, chosen.stops.length), diff),
        why: {
          via: stored?.via ?? 'MANUAL',
          score: stored?.score ?? scored?.score ?? null,
          matchedText: stored?.templateName ?? chosen.templateName,
          detail: VIA_DETAIL[stored?.via ?? 'MANUAL'],
        },
        candidates: [],
        alternatives,
        widened,
        persisted: true,
        applied: Boolean(stored?.appliedAt),
        blockedReason: null,
        thresholds,
      };
    }
    // The row points at a template that is gone or deactivated. Fall through and
    // re-offer rather than render a name we cannot produce — a dangling id is
    // the template equivalent of Phase 4's dangling external reference.
  }

  const best = deterministicTemplate(ranked);

  // ---- >= 0.75 : collapse ---------------------------------------------------
  if (best) {
    const diff = buildTemplateDiff(importStops, best.template.stops);
    return {
      state: 'RESOLVED',
      value: candidateView(best.template, best.score, diff),
      why: {
        via: 'AUTO_MATCH',
        score: best.score.score,
        matchedText: best.template.templateName,
        // The arithmetic in words, so "why" shows the working and not just a
        // percentage. Section 4.2 asks for the matched text AND the score.
        detail: `${VIA_DETAIL.AUTO_MATCH} ${best.score.intersection} of ${best.score.union} facilities in common${
          best.score.countMismatch ? ', weighted down because the stop counts differ' : ''
        }.`,
      },
      candidates: [],
      alternatives,
      widened,
      // Derived on this read. Written when a mutation next needs it — the
      // quick-508 shape, stated on the payload rather than implied.
      persisted: false,
      applied: false,
      blockedReason: null,
      thresholds,
    };
  }

  // ---- 0.45 .. 0.75 : up to three, each with a stop diff --------------------
  const shortlist = topCandidates(ranked);
  if (shortlist.length > 0) {
    return {
      state: 'CANDIDATES',
      value: null,
      why: null,
      candidates: shortlist.map((c) =>
        candidateView(c.template, c.score, buildTemplateDiff(importStops, c.template.stops)),
      ),
      alternatives,
      widened,
      persisted: false,
      applied: false,
      blockedReason: null,
      thresholds,
    };
  }

  // ---- < 0.45 : nothing is offered ------------------------------------------
  // `alternatives` is empty here by construction — nothing cleared the band — and
  // is spread in rather than special-cased so the field is never absent.
  return { ...empty('NONE'), alternatives };
}

/**
 * A score for a template that is selected but was not in the ranking — which
 * happens only when the ranking was computed over a different candidate set.
 * Zeroed rather than invented: a number nobody computed must not be rendered as
 * one that was.
 */
function scoreless(importStopCount: number, templateStopCount: number): TemplateScore {
  return {
    score: 0,
    jaccard: 0,
    intersection: 0,
    union: 0,
    importStopCount,
    templateStopCount,
    countDifference: 0,
    countMismatch: false,
  };
}

/**
 * The single best score for a stop set against a tenant's existing templates.
 *
 * Section 8's auto-create guard: *"skip creation when the stop set already
 * scores above 0.75 against an existing template — near-duplicate templates are
 * worse than none."* Exported here rather than reimplemented in the service so
 * the guard and the card use the identical predicate, which is what stops the
 * guard drifting into "0.75 but computed slightly differently".
 */
export function bestExistingScore(
  importStops: readonly ImportStopRef[],
  templates: readonly LoadedTemplate[],
): { score: number; band: TemplateBand; templateId: string | null; templateName: string | null } {
  const ranked = rankTemplates(
    facilitySetForImport(importStops),
    templates.map((t) => ({ template: t, facilityIds: templateFacilitySet(t.stops) })),
  );
  const best = ranked[0];
  if (!best) return { score: 0, band: bandFor(0), templateId: null, templateName: null };
  return {
    score: best.score.score,
    band: best.band,
    templateId: best.template.id,
    templateName: best.template.templateName,
  };
}
