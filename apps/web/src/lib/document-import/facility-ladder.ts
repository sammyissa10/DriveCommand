/**
 * The four-tier facility resolution ladder, exactly as spec Section 7 draws it.
 *
 * ```
 *                  consignment
 *                       |
 *                       v
 *        +------------------------------+
 *   T1   | external ref matches         |--yes--> LINK, silent
 *        | (tenant, client, code)       |
 *        +--------------+---------------+
 *                       | no
 *        +--------------v---------------+
 *   T2   | normalised address matches   |--yes--> LINK, silent
 *        | within tenant                |    + backfill ext ref
 *        +--------------+---------------+
 *                       | no
 *        +--------------v---------------+
 *   T3   | fuzzy score above threshold  |--yes--> PROPOSE
 *        | name + street no + postcode  |    human taps
 *        +--------------+---------------+    show score + diffs
 *                       | no
 *        +--------------v---------------+
 *   T4   | nothing                      |-------> CREATE FORM
 *        +------------------------------+    human taps
 *                                            pre-filled
 * ```
 *
 * ---------------------------------------------------------------------------
 * THE HARD RULE, EXPRESSED IN THE TYPE
 * ---------------------------------------------------------------------------
 * "T3 and T4 never create without a human tap. A polluted facility table is
 * unrecoverable and destroys the value of the external reference table
 * permanently."
 *
 * So `autoLink` is not a boolean a caller sets — it is a property of the
 * verdict union, `true` only on the T1 and T2 members and `false` on the T3 and
 * T4 members, and `autoLinkTarget()` is the only way to get a facility id out of
 * a verdict without a human in the loop. There is no facility id on a T3 or T4
 * verdict to reach for: a proposal carries candidates, and a candidate is not a
 * decision. A caller that wants to link a proposed facility must go through
 * the mutation that takes a facility id from a request, which means a person
 * chose it.
 *
 * This file is PURE. It does no loading and no writing — the caller hands it
 * already-loaded, already-tenant-scoped candidates and gets a verdict back. That
 * is what lets the read-only view and the mutation boundary run the identical
 * decision, which is the property quick-508 and quick-510 were about: a card
 * that collapses a row the write path would not have committed is a card that
 * lies.
 */

import {
  formatNormalised,
  normaliseAddress,
  normalisedAddressesEqual,
  type AddressInput,
  type NormalisedAddress,
} from './address';
import {
  scoreNormalisedAddresses,
  type AddressConflict,
  type AddressScore,
} from './facility-matching';
import { normaliseName, scoreNameMatch, EXACT_MATCH } from './matching';
import {
  FACILITY_FUZZY_THRESHOLD,
  FACILITY_MAX_CANDIDATES,
  FACILITY_TYPE_FOR_ROLE,
} from './facility-constants';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** A facility row, reduced to what the ladder compares. Tenant scoping is the caller's job. */
export interface LadderFacility {
  id: string;
  name: string;
  facilityType: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

/** What the document said about one stop. */
export interface LadderStop {
  /** The consignee code as printed — "43775". The gold key. */
  sourceCode: string | null;
  name: string;
  address: AddressInput;
}

export interface LadderContext {
  /**
   * Confirmed `(tenant, client, sourceCode) -> facilityId` links, keyed by
   * normalised source code. Loaded once per import, not once per stop.
   */
  referencesByCode: Map<string, string>;
  /** Every facility the ladder is allowed to match against. Already filtered. */
  candidates: LadderFacility[];
}

// ---------------------------------------------------------------------------
// Verdicts
// ---------------------------------------------------------------------------

export type FacilityTier = 'T1' | 'T2' | 'T3' | 'T4';

export interface FacilityProposal {
  facilityId: string;
  name: string;
  /** The facility's address, as one line, for the candidate row. */
  address: string;
  /** 0..1, from the address scorer. Never used to link — only to rank and explain. */
  score: number;
  /** Plain-language field differences — spec Section 7's "show score + diffs". */
  differences: string[];
  conflicts: AddressConflict[];
  /** How alike the two names are. Evidence, never a gate. */
  nameScore: number;
}

/** Everything the T4 create form needs, taken from the document. */
export interface FacilityPrefill {
  name: string;
  facilityType: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  /** Echoed back so the confirmed create can write the external reference. */
  sourceCode: string | null;
}

interface VerdictBase {
  tier: FacilityTier;
  /** The document text the decision was made about — half of every "why". */
  documentText: string;
}

export type LadderVerdict =
  | (VerdictBase & {
      tier: 'T1';
      autoLink: true;
      facilityId: string;
      /** The code that resolved it. The matched text in the "why". */
      sourceCode: string;
    })
  | (VerdictBase & {
      tier: 'T2';
      autoLink: true;
      facilityId: string;
      /** The stored address that normalised equal. */
      matchedText: string;
      /**
       * The code to write into `facility_external_references` alongside the
       * link — this is the backfill that turns tomorrow's T2 into a T1.
       */
      backfillCode: string | null;
    })
  | (VerdictBase & {
      tier: 'T3';
      autoLink: false;
      requiresHumanTap: true;
      proposals: FacilityProposal[];
      /** Offered alongside the proposals, because "none of these" is a real answer. */
      prefill: FacilityPrefill;
    })
  | (VerdictBase & {
      tier: 'T4';
      autoLink: false;
      requiresHumanTap: true;
      prefill: FacilityPrefill;
    });

/**
 * The facility a verdict may be linked to with no human involvement, or null.
 *
 * The only sanctioned way to get a link target out of a verdict. It returns
 * null for T3 and T4 because those members carry no facility id at all — the
 * hard rule is enforced by the shape of the data, not by a check a future edit
 * could drop.
 */
export function autoLinkTarget(verdict: LadderVerdict): { facilityId: string; tier: 'T1' | 'T2' } | null {
  if (verdict.tier === 'T1' || verdict.tier === 'T2') {
    return { facilityId: verdict.facilityId, tier: verdict.tier };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Source codes are compared case- and punctuation-insensitively.
 *
 * "43775" and "43775 " and "#43775" are one code. This is the same string that
 * goes into `facility_external_references.source_code`, so the stored form and
 * the lookup form cannot drift.
 */
export function normaliseSourceCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return cleaned || null;
}

export function facilityAddress(facility: LadderFacility): AddressInput {
  return {
    line1: facility.addressLine1,
    line2: facility.addressLine2,
    city: facility.city,
    state: facility.state,
    postalCode: facility.zip,
  };
}

function prefillFrom(stop: LadderStop, facilityType: string): FacilityPrefill {
  const a = stop.address ?? {};
  return {
    name: stop.name,
    facilityType,
    addressLine1: a.line1 ?? null,
    addressLine2: a.line2 ?? null,
    city: a.city ?? null,
    state: a.state ?? null,
    zip: a.postalCode ?? null,
    sourceCode: stop.sourceCode ?? null,
  };
}

function toProposal(
  facility: LadderFacility,
  normalised: NormalisedAddress,
  score: AddressScore,
  documentName: string,
): FacilityProposal {
  return {
    facilityId: facility.id,
    name: facility.name,
    address: formatNormalised(normalised),
    score: score.score,
    differences: score.differences,
    conflicts: score.conflicts,
    nameScore: scoreNameMatch(documentName, facility.name),
  };
}

// ---------------------------------------------------------------------------
// The ladder
// ---------------------------------------------------------------------------

/**
 * Walk one consignment down the ladder.
 *
 * Order is the spec's and is not negotiable: a confirmed external reference
 * beats a good address every time, because the reference is a decision a human
 * already made about this exact code for this exact client, and the address on
 * today's document may simply be printed differently.
 */
export function resolveFacilityTier(stop: LadderStop, context: LadderContext): LadderVerdict {
  const documentText = [stop.name, formatNormalised(normaliseAddress(stop.address))]
    .filter(Boolean)
    .join(' · ');
  const code = normaliseSourceCode(stop.sourceCode);

  // --- T1 — exact match on external reference (tenant, client, code) --------
  if (code) {
    const facilityId = context.referencesByCode.get(code);
    // The reference is only honoured if the facility it points at is still a
    // live candidate. A soft-deleted or driver-residence facility is filtered
    // out upstream, and a dangling reference must not resurrect it.
    if (facilityId && context.candidates.some((c) => c.id === facilityId)) {
      return {
        tier: 'T1',
        autoLink: true,
        facilityId,
        sourceCode: stop.sourceCode!.trim(),
        documentText,
      };
    }
  }

  const documentAddress = normaliseAddress(stop.address);

  // --- T2 — exact match on normalised address within tenant ----------------
  const scored = context.candidates.map((facility) => {
    const normalised = normaliseAddress(facilityAddress(facility));
    return { facility, normalised, score: scoreNormalisedAddresses(documentAddress, normalised) };
  });

  const exact = scored.filter((s) => normalisedAddressesEqual(documentAddress, s.normalised));

  // Two facilities on one normalised address is not a match, it is a question.
  // Linking to whichever sorted first would silently pick one of two real
  // buildings, so ambiguity drops to T3 and a person decides.
  if (exact.length === 1) {
    return {
      tier: 'T2',
      autoLink: true,
      facilityId: exact[0].facility.id,
      matchedText: formatNormalised(exact[0].normalised),
      backfillCode: stop.sourceCode?.trim() || null,
      documentText,
    };
  }

  // --- T3 — fuzzy match above threshold ------------------------------------
  const gated = exact.length > 1
    ? exact
    : scored.filter((s) => s.score.score >= FACILITY_FUZZY_THRESHOLD);

  /**
   * One narrow admission beyond the address score: when the document printed no
   * usable address at all, a facility whose NAME matches exactly is offered.
   *
   * It cannot fire while there is address evidence, so it cannot rescue a
   * candidate the fixture says must not be offered — `2200 S Ashland` against
   * `2800 S Ashland` stays out of the list whatever the two are called. It
   * exists because the alternative for an unreadable address block is a T4
   * create form that produces a duplicate of a facility the tenant already has.
   * It is still a proposal, and it still needs a tap.
   */
  const byName = documentAddress.empty
    ? scored.filter((s) => scoreNameMatch(stop.name, s.facility.name) === EXACT_MATCH)
    : [];

  const pool = gated.length ? gated : byName;

  if (pool.length > 0) {
    const proposals = pool
      .map((s) => toProposal(s.facility, s.normalised, s.score, stop.name))
      .sort((a, b) => b.score - a.score || b.nameScore - a.nameScore || a.name.localeCompare(b.name))
      .slice(0, FACILITY_MAX_CANDIDATES);

    return {
      tier: 'T3',
      autoLink: false,
      requiresHumanTap: true,
      proposals,
      prefill: prefillFrom(stop, defaultFacilityType()),
      documentText,
    };
  }

  // --- T4 — nothing --------------------------------------------------------
  return {
    tier: 'T4',
    autoLink: false,
    requiresHumanTap: true,
    prefill: prefillFrom(stop, defaultFacilityType()),
    documentText,
  };
}

/**
 * The type a consignee-created facility takes.
 *
 * Read from the constants file rather than written here so the B1 / DEC-1
 * reasoning lives in one place: the spec's `receiver` does not exist in this
 * database and writing it throws a CHECK violation.
 */
function defaultFacilityType(): string {
  return FACILITY_TYPE_FOR_ROLE.consignee;
}

/** Re-exported so callers normalise facility names the one way. */
export { normaliseName };
