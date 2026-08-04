/**
 * Name matching — the arithmetic behind the "why" affordance.
 *
 * Spec: docs/specs/DocumentImport_TechnicalSpec_v1.md Section 4.2 — "every
 * auto-resolved value has a small 'why' affordance showing the matched text and
 * score."
 *
 * THE SCORE IS COMPUTED, NEVER STORED. That is the whole point of this file
 * existing separately from the resolution logic. A score written into a column
 * at confirmation time would be a number about a comparison that happened once,
 * months ago, against a client name that may since have been edited; a score
 * computed on read is a statement about the two strings actually in front of
 * the user. It is also the only version that cannot be quietly replaced by a
 * constant — the phase's stated drift risk is "a hardcoded confidence score
 * behind the why affordance", and a pure function with tests is the answer to
 * it.
 *
 * No dependencies. Deterministic. Same inputs, same number, every time.
 */

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/**
 * Legal-form suffixes stripped before comparison.
 *
 * "Dealer Tire LLC" on the document and "Dealer Tire" in the client list are
 * the same company, and a dispatcher would be baffled to be asked which. These
 * are dropped only when they appear as a trailing token, so "Cody Inc Supply"
 * keeps its middle word.
 */
const LEGAL_SUFFIXES = new Set([
  'inc',
  'incorporated',
  'llc',
  'llp',
  'lp',
  'ltd',
  'limited',
  'co',
  'company',
  'corp',
  'corporation',
  'plc',
  'pllc',
  'gmbh',
  'sa',
  'nv',
  'bv',
  'pty',
]);

/**
 * Lowercase, de-punctuate, drop trailing legal forms, collapse whitespace.
 *
 * `&` becomes `and` before punctuation is stripped so "R & L" and "R and L"
 * converge rather than becoming "r l" and "r and l".
 */
export function normaliseName(raw: string): string {
  const base = raw
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  if (!base) return '';

  const tokens = base.split(' ');
  while (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  return tokens.join(' ');
}

// ---------------------------------------------------------------------------
// Similarity
// ---------------------------------------------------------------------------

/** Character bigrams of a normalised string, whitespace included as a boundary. */
function bigrams(value: string): string[] {
  const padded = ` ${value} `;
  const out: string[] = [];
  for (let i = 0; i < padded.length - 1; i++) out.push(padded.slice(i, i + 2));
  return out;
}

/**
 * Sørensen–Dice coefficient over character bigrams, 0..1.
 *
 * Chosen over edit distance because it is stable under word reordering
 * ("Nissan of Russ Darrow" vs "Russ Darrow Nissan" scores well) and does not
 * punish length differences as harshly, which matters when a document prints a
 * branch suffix the client list does not carry.
 */
function diceCoefficient(a: string, b: string): number {
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

/** Token overlap as a fraction of the shorter string's tokens, 0..1. */
function tokenContainment(a: string, b: string): number {
  const aTokens = new Set(a.split(' ').filter(Boolean));
  const bTokens = new Set(b.split(' ').filter(Boolean));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let shared = 0;
  for (const t of aTokens) if (bTokens.has(t)) shared++;
  return shared / Math.min(aTokens.size, bTokens.size);
}

/**
 * How alike two company names are, 0..1.
 *
 * **1.0 means, and only means, that the two normalised strings are identical.**
 * The spec's collapse rule for client is "exact match to one active client", so
 * the auto-select condition reads `score === EXACT_MATCH` and nothing else can
 * reach it — a near miss is capped below 1 rather than rounded up to it.
 *
 * Below that, the score blends bigram similarity with token containment. The
 * containment term is what stops "Russ Darrow Nissan" and "Russ Darrow Kia" —
 * which share most of their characters — from outranking a genuinely closer
 * candidate, and what lets a document name that is a strict superset of a
 * client name ("Boucher Kia of Greenfield" vs "Boucher Kia") rank high.
 */
export function scoreNameMatch(documentName: string, candidateName: string): number {
  const a = normaliseName(documentName);
  const b = normaliseName(candidateName);
  if (!a || !b) return 0;
  if (a === b) return EXACT_MATCH;

  const blended = 0.65 * diceCoefficient(a, b) + 0.35 * tokenContainment(a, b);

  // Anything that is not an exact normalised match stays strictly below 1.0, so
  // the auto-select test cannot be satisfied by a near miss.
  return Math.min(Math.round(blended * 1000) / 1000, 0.99);
}

/** The only score that means "exact". */
export const EXACT_MATCH = 1;

/**
 * Below this a candidate is not worth showing at all.
 *
 * Not an auto-select threshold — nothing auto-selects on a fuzzy score. This
 * only keeps the picker from listing every client in the tenant under a
 * meaningless 0.08.
 */
export const CANDIDATE_FLOOR = 0.3;

// ---------------------------------------------------------------------------
// Matching against a record with several comparable fields
// ---------------------------------------------------------------------------

export type MatchedField = 'name' | 'dbaName' | 'alias';

export interface NameMatch {
  score: number;
  /** The candidate-side string that produced the score — half the "why". */
  matchedText: string;
  matchedField: MatchedField;
}

export interface MatchableClient {
  name: string;
  dbaName?: string | null;
  /** Names this client's documents have carried before (learned, see profiles.ts). */
  aliases?: string[];
}

/**
 * Best score across a client's name, trading name, and learned aliases.
 *
 * Returns which field won, because "matched the trading name" and "matched a
 * name we have seen on this client's documents before" are different answers to
 * "why", and collapsing them to a number would throw away the useful half.
 */
export function bestClientMatch(documentName: string, client: MatchableClient): NameMatch {
  let best: NameMatch = { score: 0, matchedText: client.name, matchedField: 'name' };

  const consider = (text: string | null | undefined, field: MatchedField) => {
    if (!text || !text.trim()) return;
    const score = scoreNameMatch(documentName, text);
    if (score > best.score) best = { score, matchedText: text, matchedField: field };
  };

  consider(client.name, 'name');
  consider(client.dbaName, 'dbaName');
  for (const alias of client.aliases ?? []) consider(alias, 'alias');

  return best;
}
