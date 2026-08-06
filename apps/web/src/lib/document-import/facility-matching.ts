/**
 * Fuzzy address scoring — tier 3 of the facility resolution ladder.
 *
 * Spec Section 7: "fuzzy score above threshold -> PROPOSE, human taps, show
 * score + diffs", scored on "name + street no + postcode".
 *
 * WHAT THIS IS FOR, AND WHAT IT IS NOT FOR. Nothing in this module links a stop
 * to a facility on a number produced here. T1 links on an external reference and
 * T2 links on normalised equality; a score only decides whether a candidate is
 * worth putting in front of a person, and whether that person is shown a
 * "link this" or a "create this". `1` is returned only for an address that
 * normalises equal, exactly as `matching.ts` reserves `1` for an exact client
 * name — a near miss is capped below it rather than rounded up to it, so no
 * caller can accidentally write `score === 1` and get a fuzzy link.
 *
 * The other half of the phase's stated drift risk is "fuzzy scoring implemented
 * as string equality, which makes T3 unreachable". The fixture is the guard:
 * eight of its thirty pairs must score at or above the threshold *while not
 * normalising equal*, which a string comparison cannot do.
 *
 * Pure and deterministic. No Prisma, no network, no clock.
 */

import {
  normaliseAddress,
  normalisedAddressesEqual,
  unitsCompatible,
  type AddressInput,
  type NormalisedAddress,
} from './address';
import {
  FACILITY_COMPONENT_UNKNOWN,
  FACILITY_SCORE_PENALTIES,
  FACILITY_SCORE_WEIGHTS,
} from './facility-constants';

// ---------------------------------------------------------------------------
// Similarity primitives
// ---------------------------------------------------------------------------

function bigrams(value: string): string[] {
  const padded = ` ${value} `;
  const out: string[] = [];
  for (let i = 0; i < padded.length - 1; i++) out.push(padded.slice(i, i + 2));
  return out;
}

/** Sørensen–Dice over character bigrams. Survives a misspelling; survives reordering. */
function dice(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aGrams = bigrams(a);
  const bGrams = bigrams(b);
  const counts = new Map<string, number>();
  for (const g of aGrams) counts.set(g, (counts.get(g) ?? 0) + 1);
  let shared = 0;
  for (const g of bGrams) {
    const n = counts.get(g) ?? 0;
    if (n > 0) {
      counts.set(g, n - 1);
      shared++;
    }
  }
  return (2 * shared) / (aGrams.length + bGrams.length);
}

/** Shared tokens as a fraction of the shorter side — the "token overlap" term. */
function containment(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let shared = 0;
  for (const t of setA) if (setB.has(t)) shared++;
  return shared / Math.min(setA.size, setB.size);
}

/**
 * How alike two street names are.
 *
 * Token overlap alone cannot see `Centennial` against `Centenial` — one token
 * each, nothing shared, zero. Character similarity alone ranks
 * `Indianapolis Blvd` against `Indiana Ave` far too high. The blend is what the
 * client-name scorer already uses (`matching.ts`), for the same reason.
 */
function nameSimilarity(a: NormalisedAddress, b: NormalisedAddress): number {
  if (!a.core && !b.core) return a.poBox && b.poBox ? (a.poBox === b.poBox ? 1 : 0) : 0;
  return 0.65 * dice(a.core, b.core) + 0.35 * containment(a.nameTokens, b.nameTokens);
}

// ---------------------------------------------------------------------------
// Conflicts
// ---------------------------------------------------------------------------

export type AddressConflict =
  | 'UNIT'
  | 'DIRECTIONAL'
  | 'STATE'
  | 'PO_BOX'
  | 'NUMBERED_STREET';

const CONFLICT_LABEL: Record<AddressConflict, string> = {
  UNIT: 'Different unit or dock',
  DIRECTIONAL: 'Different directional',
  STATE: 'Different state',
  PO_BOX: 'One is a PO box',
  NUMBERED_STREET: 'Different numbered street',
};

export function conflictLabel(conflict: AddressConflict): string {
  return CONFLICT_LABEL[conflict];
}

/** A street name that is nothing but a number — `95th`, `47th`. An identifier. */
function isNumberedStreet(a: NormalisedAddress): boolean {
  return a.nameTokens.length === 1 && /^\d+$/.test(a.nameTokens[0]);
}

function conflictsBetween(a: NormalisedAddress, b: NormalisedAddress): AddressConflict[] {
  const out: AddressConflict[] = [];

  if (!unitsCompatible(a, b)) out.push('UNIT');
  if (a.directional && b.directional && a.directional !== b.directional) out.push('DIRECTIONAL');
  if (a.state && b.state && a.state !== b.state) out.push('STATE');

  const boxes = Number(Boolean(a.poBox)) + Number(Boolean(b.poBox));
  if (boxes === 1 || (boxes === 2 && a.poBox !== b.poBox)) out.push('PO_BOX');

  if (isNumberedStreet(a) && isNumberedStreet(b) && a.core !== b.core) out.push('NUMBERED_STREET');

  return out;
}

// ---------------------------------------------------------------------------
// The score
// ---------------------------------------------------------------------------

export interface AddressScoreComponents {
  street: number;
  number: number;
  postal: number;
  locality: number;
}

export interface AddressScore {
  /** 0..1. Exactly 1 only when the two addresses normalise equal. */
  score: number;
  exact: boolean;
  components: AddressScoreComponents;
  conflicts: AddressConflict[];
  /**
   * Field-level differences, in plain words — the "show differing fields" half
   * of what spec Section 7 requires a T3 proposal to display.
   */
  differences: string[];
}

/** Do the two number sets intersect? See `NormalisedAddress.numbers`. */
function numberScore(a: NormalisedAddress, b: NormalisedAddress): number {
  if (a.numbers.length === 0 || b.numbers.length === 0) return FACILITY_COMPONENT_UNKNOWN;
  const set = new Set(a.numbers);
  return b.numbers.some((n) => set.has(n)) ? 1 : 0;
}

function localityScore(a: NormalisedAddress, b: NormalisedAddress): number {
  const parts: number[] = [];
  if (a.city && b.city) parts.push(a.city === b.city ? 1 : 0.65 * dice(a.city, b.city));
  if (a.state && b.state) parts.push(a.state === b.state ? 1 : 0);
  // Nothing comparable is not evidence of difference. Neutral, not zero — a
  // document that printed no city should not be punished for it.
  if (parts.length === 0) return 1;
  return parts.reduce((sum, p) => sum + p, 0) / parts.length;
}

function describeDifferences(a: NormalisedAddress, b: NormalisedAddress, conflicts: AddressConflict[]): string[] {
  const out: string[] = [];
  if (a.number && b.number && a.number !== b.number) out.push(`Street number ${a.number} vs ${b.number}`);
  if (a.core !== b.core) out.push(`Street ${a.core || '—'} vs ${b.core || '—'}`);
  if (a.suffix !== b.suffix) out.push(`Suffix ${a.suffix ?? '—'} vs ${b.suffix ?? '—'}`);
  if (a.directional !== b.directional) out.push(`Directional ${a.directional?.toUpperCase() ?? '—'} vs ${b.directional?.toUpperCase() ?? '—'}`);
  if ((a.unit ?? null) !== (b.unit ?? null)) out.push(`Unit ${a.unit ?? '—'} vs ${b.unit ?? '—'}`);
  if ((a.city ?? null) !== (b.city ?? null)) out.push(`City ${a.city ?? '—'} vs ${b.city ?? '—'}`);
  if ((a.state ?? null) !== (b.state ?? null)) out.push(`State ${a.state?.toUpperCase() ?? '—'} vs ${b.state?.toUpperCase() ?? '—'}`);
  if ((a.postal ?? null) !== (b.postal ?? null)) out.push(`Postcode ${a.postal ?? '—'} vs ${b.postal ?? '—'}`);
  for (const c of conflicts) out.push(conflictLabel(c));
  return out;
}

/**
 * Score two already-normalised addresses.
 *
 * The exact branch returns before any arithmetic runs, so `1` cannot be reached
 * by a sum that happens to total 1 — a missing directional against an otherwise
 * perfect match is capped at 0.99 and then penalised, and stays a proposal.
 */
export function scoreNormalisedAddresses(a: NormalisedAddress, b: NormalisedAddress): AddressScore {
  const conflicts = conflictsBetween(a, b);

  if (normalisedAddressesEqual(a, b)) {
    return {
      score: 1,
      exact: true,
      components: { street: 1, number: 1, postal: 1, locality: 1 },
      conflicts: [],
      differences: [],
    };
  }

  // Two addresses we could not read are not evidence of anything.
  if (a.empty || b.empty) {
    return {
      score: 0,
      exact: false,
      components: { street: 0, number: 0, postal: 0, locality: 0 },
      conflicts,
      differences: ['Address could not be read'],
    };
  }

  const components: AddressScoreComponents = {
    street: nameSimilarity(a, b),
    number: numberScore(a, b),
    postal: a.postal && b.postal ? (a.postal === b.postal ? 1 : 0) : FACILITY_COMPONENT_UNKNOWN,
    locality: localityScore(a, b),
  };

  let score =
    FACILITY_SCORE_WEIGHTS.street * components.street +
    FACILITY_SCORE_WEIGHTS.number * components.number +
    FACILITY_SCORE_WEIGHTS.postal * components.postal +
    FACILITY_SCORE_WEIGHTS.locality * components.locality;

  for (const conflict of conflicts) {
    if (conflict === 'UNIT') score -= FACILITY_SCORE_PENALTIES.unit;
    if (conflict === 'DIRECTIONAL') score -= FACILITY_SCORE_PENALTIES.directional;
    if (conflict === 'STATE') score -= FACILITY_SCORE_PENALTIES.state;
    if (conflict === 'PO_BOX') score -= FACILITY_SCORE_PENALTIES.poBox;
    if (conflict === 'NUMBERED_STREET') score -= FACILITY_SCORE_PENALTIES.numberedStreet;
  }

  // One side naming a directional the other omits is missing evidence, not a
  // contradiction — a small deduction, so it can still be proposed but never
  // mistaken for a certainty.
  if (Boolean(a.directional) !== Boolean(b.directional)) {
    score -= FACILITY_SCORE_PENALTIES.directionalMissing;
  }

  const bounded = Math.max(0, Math.min(Math.round(score * 1000) / 1000, 0.99));

  return {
    score: bounded,
    exact: false,
    components,
    conflicts,
    differences: describeDifferences(a, b, conflicts),
  };
}

/** The same, from whatever shape the caller is holding. */
export function scoreAddresses(
  a: AddressInput | string | null | undefined,
  b: AddressInput | string | null | undefined,
): AddressScore {
  return scoreNormalisedAddresses(normaliseAddress(a), normaliseAddress(b));
}
