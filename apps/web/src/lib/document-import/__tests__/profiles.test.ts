/**
 * The alias lookup — the "pinned document profile" collapse condition.
 *
 * Only the pure half is tested here; the upsert path needs a database and is
 * exercised through the routes. What matters at this level is that a profile
 * hit is EXACT after normalisation and never fuzzy: a fuzzy auto-select is
 * precisely how a document silently lands on the wrong client.
 */

import { describe, expect, it } from 'vitest';
import { findProfileByAlias, type DocumentProfileRecord } from '../profiles';

const profile = (over: Partial<DocumentProfileRecord>): DocumentProfileRecord => ({
  id: 'p1',
  clientId: 'c1',
  documentType: 'MANIFEST',
  pinnedContractId: null,
  originNames: [],
  ...over,
});

describe('findProfileByAlias', () => {
  it('matches an alias exactly after normalisation', () => {
    const profiles = [profile({ originNames: ['DEALER TIRE, LLC'] })];
    const hit = findProfileByAlias(profiles, 'Dealer Tire LLC');
    expect(hit?.profile.clientId).toBe('c1');
    // The alias is returned AS SAVED — the "why" affordance shows it to a
    // human, and "DEALER TIRE, LLC" is evidence in a way "dealer tire" is not.
    expect(hit?.matchedText).toBe('DEALER TIRE, LLC');
  });

  it('does NOT match a near miss', () => {
    const profiles = [profile({ originNames: ['Russ Darrow Nissan'] })];
    expect(findProfileByAlias(profiles, 'Russ Darrow Kia')).toBeNull();
    expect(findProfileByAlias(profiles, 'Russ Darrow')).toBeNull();
  });

  it('returns the first profile carrying the alias', () => {
    const profiles = [
      profile({ id: 'p1', clientId: 'c1', originNames: ['Other Co'] }),
      profile({ id: 'p2', clientId: 'c2', originNames: ['Wilde Honda'] }),
    ];
    expect(findProfileByAlias(profiles, 'Wilde Honda')?.profile.clientId).toBe('c2');
  });

  it('is null when the document named nothing', () => {
    const profiles = [profile({ originNames: ['Wilde Honda'] })];
    expect(findProfileByAlias(profiles, null)).toBeNull();
    expect(findProfileByAlias(profiles, undefined)).toBeNull();
    expect(findProfileByAlias(profiles, '   ')).toBeNull();
  });

  it('is null when no profile has any alias yet', () => {
    expect(findProfileByAlias([profile({})], 'Wilde Honda')).toBeNull();
    expect(findProfileByAlias([], 'Wilde Honda')).toBeNull();
  });

  it('ignores an alias that normalises to nothing', () => {
    const profiles = [profile({ originNames: ['!!!'] })];
    expect(findProfileByAlias(profiles, '???')).toBeNull();
  });
});
