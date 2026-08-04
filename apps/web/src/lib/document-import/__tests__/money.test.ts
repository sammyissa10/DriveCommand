/**
 * Verify check 6: "Spot contract rate in DB — Decimal, not float."
 *
 * The Decimal itself is constructed in `resolution.ts` and cannot be unit
 * tested without the generated Prisma client, but the value handed to it comes
 * from here — and this is the step at which a float would be introduced. These
 * tests fix the contract that `normaliseMoney` returns a STRING, unrounded and
 * unparsed, or nothing at all.
 */

import { describe, expect, it } from 'vitest';
import { normaliseMoney } from '../money';

describe('normaliseMoney', () => {
  it('returns a string, never a number', () => {
    const value = normaliseMoney('2400.00');
    expect(typeof value).toBe('string');
    expect(value).toBe('2400.00');
  });

  it('preserves trailing zeros — 2400.10 does not become 2400.1', () => {
    // This is the exact loss a float would cause, and on an invoice it is the
    // difference between a rate that reconciles and one that does not.
    expect(normaliseMoney('2400.10')).toBe('2400.10');
    expect(normaliseMoney('1000.00')).toBe('1000.00');
  });

  it('preserves precision a float cannot hold', () => {
    expect(normaliseMoney('0.1')).toBe('0.1');
    expect(normaliseMoney('12345678.1234')).toBe('12345678.1234');
  });

  it('accepts what a rate confirmation actually prints', () => {
    expect(normaliseMoney('$2,400.00')).toBe('2400.00');
    expect(normaliseMoney(' 2,400.50 ')).toBe('2400.50');
    expect(normaliseMoney('2400')).toBe('2400');
  });

  it('rejects rather than salvages', () => {
    expect(normaliseMoney('two thousand')).toBeNull();
    expect(normaliseMoney('2400 USD')).toBeNull();
    expect(normaliseMoney('1.2.3')).toBeNull();
    expect(normaliseMoney('1e5')).toBeNull();
    expect(normaliseMoney('')).toBeNull();
    expect(normaliseMoney(null)).toBeNull();
    expect(normaliseMoney(undefined)).toBeNull();
  });

  it('rejects a negative rate — a contract that pays the customer is not a thing', () => {
    expect(normaliseMoney('-100')).toBeNull();
    expect(normaliseMoney('-$1,200.00')).toBeNull();
  });

  it('accepts a number input but hands back a string', () => {
    // A JSON client may send a number; it is turned straight back into a string
    // and only ever becomes a Prisma.Decimal from there.
    expect(normaliseMoney(2400)).toBe('2400');
    expect(typeof normaliseMoney(2400)).toBe('string');
  });
});
