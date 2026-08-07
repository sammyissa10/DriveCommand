/**
 * The fixture is the specification.
 *
 * Thirty real Chicago-corridor address pairs, read **from disk** and pushed
 * through the real `normaliseAddress` and the real `scoreNormalisedAddresses`.
 * Nothing here reimplements either — a test that restates the algorithm proves
 * only that it was written down twice.
 *
 * Three verdicts, and each means a different thing about the ladder:
 *
 * ```
 *   SILENT    normalises equal          -> T2 may link with no human tap
 *   PROPOSE   does NOT normalise equal  -> T3 only, and a human must tap
 *             AND scores >= threshold
 *   NO_MATCH  never normalises equal    -> not offered at all; T4
 *             AND scores <  threshold
 * ```
 *
 * The NO_MATCH pairs are traps and they are the point. `2200 S Ashland` against
 * `2800 S Ashland` shares its street, its city and its postcode; `3300 N
 * Kimball` against `3300 W Kimball` differs in one letter; `Building A` against
 * `Building C` differs in nothing a key can see. Every one of them is a
 * different building that a dispatcher would have to un-merge by hand, and
 * facility merges are not reversible. Weakening a NO_MATCH pair to make the
 * suite pass is a failure of the task, not a fix.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { normaliseAddress, normalisedAddressesEqual, normalisesEqual } from '../address';
import { scoreNormalisedAddresses } from '../facility-matching';
import { FACILITY_FUZZY_THRESHOLD } from '../facility-constants';

// ---------------------------------------------------------------------------

interface FixturePair {
  id: number;
  class: string;
  a: string;
  b: string;
  expected: 'SILENT' | 'PROPOSE' | 'NO_MATCH';
}

const FIXTURE_PATH = path.join(__dirname, '..', '__fixtures__', 'facility-address-pairs.fixture.json');

const pairs: FixturePair[] = (
  JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as { pairs: FixturePair[] }
).pairs;

/** One pair, evaluated exactly the way the ladder evaluates a candidate. */
function evaluate(pair: FixturePair) {
  const a = normaliseAddress(pair.a);
  const b = normaliseAddress(pair.b);
  const equal = normalisedAddressesEqual(a, b);
  const { score, conflicts } = scoreNormalisedAddresses(a, b);
  const verdict = equal ? 'SILENT' : score >= FACILITY_FUZZY_THRESHOLD ? 'PROPOSE' : 'NO_MATCH';
  return { a, b, equal, score, conflicts, verdict };
}

// ---------------------------------------------------------------------------

describe('facility address fixture', () => {
  /**
   * Fixture integrity, as a floor rather than an exact count.
   *
   * What this is actually protecting against is a pair going missing — a
   * truncated file, a renumbering, a trap quietly dropped to make a run green.
   * Contiguous ids from 1 catch all three. An exact `toHaveLength(n)` caught them
   * too, but it also failed every time a pair was legitimately ADDED, which taxes
   * the one thing this fixture wants to encourage. The floor ratchets: it only
   * moves when someone deliberately raises it, and until then it cannot be
   * satisfied by deleting anything.
   */
  const FIXTURE_FLOOR = 31;

  it('reads a complete, contiguously numbered fixture from disk', () => {
    expect(pairs.length).toBeGreaterThanOrEqual(FIXTURE_FLOOR);
    expect(pairs.map((p) => p.id)).toEqual(pairs.map((_, i) => i + 1));
    expect(new Set(pairs.map((p) => p.expected))).toEqual(new Set(['SILENT', 'PROPOSE', 'NO_MATCH']));
  });

  const silent = pairs.filter((p) => p.expected === 'SILENT');
  const propose = pairs.filter((p) => p.expected === 'PROPOSE');
  const noMatch = pairs.filter((p) => p.expected === 'NO_MATCH');

  describe('SILENT — normalises equal, T2 silent link is legal', () => {
    it.each(silent.map((p) => [p.id, p.class, p] as const))(
      'pair %i · %s',
      (_id, _class, pair) => {
        const { equal, score, a, b } = evaluate(pair);
        expect(
          equal,
          `keys differ:\n  a ${a.key}\n  b ${b.key}`,
        ).toBe(true);
        // Equality is the only route to 1. If this ever drops below 1 the exact
        // branch has been bypassed and T2 is scoring rather than matching.
        expect(score).toBe(1);
      },
    );
  });

  describe('PROPOSE — not equal, at or above threshold, T3 proposal only', () => {
    it.each(propose.map((p) => [p.id, p.class, p] as const))(
      'pair %i · %s',
      (_id, _class, pair) => {
        const { equal, score } = evaluate(pair);
        expect(equal, 'must NOT normalise equal — a silent link here is a wrong link').toBe(false);
        expect(score, `scored ${score}, threshold ${FACILITY_FUZZY_THRESHOLD}`)
          .toBeGreaterThanOrEqual(FACILITY_FUZZY_THRESHOLD);
        // And it is still a proposal, never a certainty.
        expect(score).toBeLessThan(1);
      },
    );
  });

  describe('NO_MATCH — never equal, below threshold, never offered', () => {
    it.each(noMatch.map((p) => [p.id, p.class, p] as const))(
      'pair %i · %s',
      (_id, _class, pair) => {
        const { equal, score } = evaluate(pair);
        expect(equal, 'a silent link between two different buildings').toBe(false);
        expect(score, `scored ${score}, threshold ${FACILITY_FUZZY_THRESHOLD}`)
          .toBeLessThan(FACILITY_FUZZY_THRESHOLD);
      },
    );
  });

  it('every pair reaches its expected verdict, reported by id', () => {
    const rows = pairs.map((pair) => {
      const { verdict, score, equal } = evaluate(pair);
      return {
        id: pair.id,
        expected: pair.expected,
        actual: verdict,
        score: score.toFixed(3),
        equal,
        class: pair.class,
      };
    });

    const width = Math.max(...rows.map((r) => r.class.length));
    const lines = rows.map(
      (r) =>
        `  ${String(r.id).padStart(2)}  ${r.class.padEnd(width)}  ` +
        `${r.expected.padEnd(8)} -> ${r.actual.padEnd(8)}  score ${r.score}  ` +
        `${r.expected === r.actual ? 'PASS' : 'FAIL'}`,
    );
    // eslint-disable-next-line no-console -- the per-pair report the phase asks for
    console.log(`\nPer-pair fixture results (threshold ${FACILITY_FUZZY_THRESHOLD}):\n${lines.join('\n')}\n`);

    const failed = rows.filter((r) => r.expected !== r.actual);
    expect(failed, `${failed.length} pair(s) reached the wrong verdict`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The normaliser's own behaviour, stated field by field
// ---------------------------------------------------------------------------

describe('normaliseAddress', () => {
  it('splits the unit out of line1 and out of line2 identically', () => {
    const inLine1 = normaliseAddress({
      line1: '9800 Industrial Dr Ste 200',
      city: 'Bridgeview',
      state: 'IL',
      postalCode: '60455',
    });
    const inLine2 = normaliseAddress({
      line1: '9800 Industrial Dr',
      line2: 'Suite 200',
      city: 'Bridgeview',
      state: 'IL',
      postalCode: '60455',
    });
    expect(inLine1.unit).toBe('200');
    expect(inLine2.unit).toBe('200');
    expect(inLine1.key).toBe(inLine2.key);
  });

  it('keeps the unit out of the key, and unit compatibility out of key equality', () => {
    const bare = normaliseAddress('2701 Busse Rd, Elk Grove Village, IL 60007');
    const u100 = normaliseAddress('2701 Busse Rd Unit 100, Elk Grove Village, IL 60007');
    const u400 = normaliseAddress('2701 Busse Rd Unit 400, Elk Grove Village, IL 60007');

    expect(u100.key).toBe(u400.key); // the key alone cannot separate two tenants
    expect(normalisedAddressesEqual(bare, u100)).toBe(true); // absent on one side is compatible
    expect(normalisedAddressesEqual(u100, u400)).toBe(false); // which is why the predicate asks
  });

  it('treats a missing postcode as missing rather than as a mismatch', () => {
    const withZip = normaliseAddress('1600 Torrence Ave, Lansing, IL 60438');
    const without = normaliseAddress('1600 Torrence Ave, Lansing, IL');
    expect(normalisedAddressesEqual(withZip, without)).toBe(false);
    expect(scoreNormalisedAddresses(withZip, without).score)
      .toBeGreaterThanOrEqual(FACILITY_FUZZY_THRESHOLD);
  });

  it('never matches an address it could not read', () => {
    expect(normalisesEqual('', '')).toBe(false);
    expect(normalisesEqual(null, null)).toBe(false);
    expect(normalisesEqual({}, {})).toBe(false);
    expect(normalisesEqual('   ,  , ', '   ,  , ')).toBe(false);
    expect(scoreNormalisedAddresses(normaliseAddress(''), normaliseAddress('')).score).toBe(0);
  });

  it('reduces ordinals so 47th Street and 47 Street are one street', () => {
    expect(normaliseAddress('4501 W 47th St, Chicago, IL 60632').core).toBe('47');
    expect(normaliseAddress('4501 W 47 Street, Chicago, IL 60632').core).toBe('47');
  });

  it('does not mistake a street named North for a directional', () => {
    const a = normaliseAddress('1200 North Ave, Chicago, IL 60622');
    expect(a.directional).toBeNull();
    expect(a.core).toBe('north');
  });

  it('is idempotent — normalising a formatted address changes nothing', () => {
    for (const raw of pairs.map((p) => p.a)) {
      const once = normaliseAddress(raw);
      expect(normaliseAddress(once.key.split('|').join(' ')).empty).toBe(false);
    }
  });
});
