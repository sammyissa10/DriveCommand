/**
 * The "One-time" label in the client's contract list.
 *
 * Item 3 requires a spot contract created from a rate confirmation to be
 * "clearly labelled ... so it is never mistaken for a standing agreement".
 * These tests fix what the label is derived FROM: the contract's own term, not
 * its name and not its provenance.
 */

import { describe, expect, it } from 'vitest';
import { isOneTimeContract } from '../one-time-contract';

describe('isOneTimeContract', () => {
  it('is true for a spot contract effective and expiring on the same day', () => {
    expect(
      isOneTimeContract({
        contractType: 'spot',
        effectiveDate: '2026-07-27',
        expirationDate: '2026-07-27',
      }),
    ).toBe(true);
  });

  it('accepts Date objects and full ISO timestamps alike', () => {
    const day = new Date('2026-07-27T00:00:00.000Z');
    expect(
      isOneTimeContract({ contractType: 'spot', effectiveDate: day, expirationDate: day }),
    ).toBe(true);
    expect(
      isOneTimeContract({
        contractType: 'spot',
        effectiveDate: '2026-07-27T00:00:00.000Z',
        expirationDate: '2026-07-27T00:00:00.000Z',
      }),
    ).toBe(true);
  });

  it('is false for a spot contract with a real term', () => {
    expect(
      isOneTimeContract({
        contractType: 'spot',
        effectiveDate: '2026-07-01',
        expirationDate: '2026-12-31',
      }),
    ).toBe(false);
  });

  it('is false for a spot contract with no end date — that is a standing arrangement', () => {
    expect(
      isOneTimeContract({
        contractType: 'spot',
        effectiveDate: '2026-07-27',
        expirationDate: null,
      }),
    ).toBe(false);
  });

  it('is false for a one-day contract that is not typed spot', () => {
    expect(
      isOneTimeContract({
        contractType: 'dedicated',
        effectiveDate: '2026-07-27',
        expirationDate: '2026-07-27',
      }),
    ).toBe(false);
  });

  it('is false when the type is missing', () => {
    expect(
      isOneTimeContract({
        contractType: null,
        effectiveDate: '2026-07-27',
        expirationDate: '2026-07-27',
      }),
    ).toBe(false);
  });

  it('does not depend on the name — a renamed one-time contract keeps its label', () => {
    // There is no name in the input at all. That is the point: the label cannot
    // be lost by an edit to `contractName`.
    const renamed = {
      contractType: 'spot',
      effectiveDate: '2026-07-27',
      expirationDate: '2026-07-27',
    };
    expect(isOneTimeContract(renamed)).toBe(true);
  });

  it('is false on an unparseable date rather than guessing', () => {
    expect(
      isOneTimeContract({
        contractType: 'spot',
        effectiveDate: 'sometime',
        expirationDate: 'sometime',
      }),
    ).toBe(false);
  });
});
