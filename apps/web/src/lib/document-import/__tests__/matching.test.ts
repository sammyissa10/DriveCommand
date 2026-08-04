/**
 * The phase's stated drift risk is "a hardcoded confidence score behind the why
 * affordance". These tests are what makes that visible: they assert that the
 * score varies with its inputs, that it is exactly 1 only on an exact match,
 * and that two different documents against the same client list produce
 * different numbers (verify check 5).
 */

import { describe, expect, it } from 'vitest';
import {
  bestClientMatch,
  CANDIDATE_FLOOR,
  EXACT_MATCH,
  normaliseName,
  scoreNameMatch,
} from '../matching';

describe('normaliseName', () => {
  it('lowercases and strips punctuation', () => {
    expect(normaliseName('Dealer Tire, Inc.')).toBe('dealer tire');
    expect(normaliseName('RUSS  DARROW   NISSAN')).toBe('russ darrow nissan');
  });

  it('turns & into and, so "R & L" and "R and L" converge', () => {
    expect(normaliseName('R & L Carriers')).toBe(normaliseName('R and L Carriers'));
  });

  it('drops trailing legal suffixes only', () => {
    expect(normaliseName('Boucher Kia LLC')).toBe('boucher kia');
    expect(normaliseName('Hall Ford Co')).toBe('hall ford');
    // Not a trailing token — must survive.
    expect(normaliseName('Cody Inc Supply')).toBe('cody inc supply');
  });

  it('never strips a name down to nothing', () => {
    expect(normaliseName('LLC')).toBe('llc');
    expect(normaliseName('   ')).toBe('');
    expect(normaliseName('!!!')).toBe('');
  });
});

describe('scoreNameMatch', () => {
  it('returns exactly 1 for an exact match after normalisation', () => {
    expect(scoreNameMatch('Dealer Tire LLC', 'Dealer Tire')).toBe(EXACT_MATCH);
    expect(scoreNameMatch('dealer  tire,  inc', 'Dealer Tire')).toBe(EXACT_MATCH);
  });

  it('NEVER returns 1 for a near miss — the auto-select test depends on it', () => {
    // These are the pairs that would silently put a document on the wrong
    // dealership if a fuzzy score could reach the exact-match threshold.
    const nearMisses: Array<[string, string]> = [
      ['Russ Darrow Nissan', 'Russ Darrow Kia'],
      ['Boucher Kia of Greenfield', 'Boucher Kia'],
      ['Hall Ford Lincoln', 'Hall Ford'],
      ['Dealer Tire', 'Dealer Tires'],
    ];
    for (const [a, b] of nearMisses) {
      const score = scoreNameMatch(a, b);
      expect(score).toBeLessThan(EXACT_MATCH);
      expect(score).toBeGreaterThan(0);
    }
  });

  it('produces DIFFERENT real numbers for different pairs (verify check 5)', () => {
    const client = 'Russ Darrow Nissan';
    const scores = [
      scoreNameMatch('Russ Darrow Nissan of Milwaukee', client),
      scoreNameMatch('Russ Darrow Kia', client),
      scoreNameMatch('Wilde Honda', client),
      scoreNameMatch('Boucher Kia', client),
    ];

    // Not a constant: every value distinct.
    expect(new Set(scores).size).toBe(scores.length);
    // And ordered the way a human would order them.
    expect(scores[0]).toBeGreaterThan(scores[1]);
    expect(scores[1]).toBeGreaterThan(scores[2]);
  });

  it('ranks a closer name above a more distant one', () => {
    const doc = 'Wilde Honda';
    expect(scoreNameMatch(doc, 'Wilde Honda of Waukesha')).toBeGreaterThan(
      scoreNameMatch(doc, 'Wilde Toyota'),
    );
  });

  it('scores an unrelated name below the candidate floor', () => {
    expect(scoreNameMatch('Dealer Tire', 'Zephyr Logistics')).toBeLessThan(CANDIDATE_FLOOR);
  });

  it('is symmetric and deterministic', () => {
    expect(scoreNameMatch('Hall Ford', 'Hall Ford Lincoln')).toBe(
      scoreNameMatch('Hall Ford Lincoln', 'Hall Ford'),
    );
    const once = scoreNameMatch('Boucher Kia', 'Boucher Nissan');
    expect(scoreNameMatch('Boucher Kia', 'Boucher Nissan')).toBe(once);
  });

  it('returns 0 when either side is empty', () => {
    expect(scoreNameMatch('', 'Dealer Tire')).toBe(0);
    expect(scoreNameMatch('Dealer Tire', '   ')).toBe(0);
  });

  it('stays within 0..1', () => {
    const pairs = [
      ['a', 'a very long company name indeed'],
      ['Dealer Tire', 'Dealer Tire'],
      ['x', 'y'],
    ];
    for (const [a, b] of pairs) {
      const score = scoreNameMatch(a, b);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });
});

describe('bestClientMatch', () => {
  it('reports which field won, not just the number', () => {
    const match = bestClientMatch('GLS Freight', {
      name: 'Great Lakes Steel',
      dbaName: 'GLS Freight',
    });
    expect(match.matchedField).toBe('dbaName');
    expect(match.matchedText).toBe('GLS Freight');
    expect(match.score).toBe(EXACT_MATCH);
  });

  it('lets a learned alias win over the registered name', () => {
    const match = bestClientMatch('DEALER TIRE, LLC', {
      name: 'Dealer Tire Distribution',
      aliases: ['DEALER TIRE, LLC'],
    });
    expect(match.matchedField).toBe('alias');
    expect(match.score).toBe(EXACT_MATCH);
  });

  it('falls back to the name with a real fuzzy score when nothing matches exactly', () => {
    const match = bestClientMatch('Russ Darrow Nissan Milwaukee', {
      name: 'Russ Darrow Nissan',
      dbaName: null,
      aliases: [],
    });
    expect(match.matchedField).toBe('name');
    expect(match.score).toBeGreaterThan(CANDIDATE_FLOOR);
    expect(match.score).toBeLessThan(EXACT_MATCH);
  });

  it('scores 0 against a client when the document named nothing comparable', () => {
    const match = bestClientMatch('Zzzz', { name: 'Dealer Tire' });
    expect(match.score).toBeLessThan(CANDIDATE_FLOOR);
  });
});
