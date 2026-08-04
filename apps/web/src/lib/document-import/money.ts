/**
 * Money on the way in from a document.
 *
 * Spec Section 15 and the canonical schema both say the same thing: an amount
 * stays a STRING through extraction and becomes a Decimal at persistence, never
 * a float. `1234.10` parsed as a JS number and written back is `1234.1`; a rate
 * of `0.1 + 0.2` is `0.30000000000000004`. Neither is acceptable on a column
 * that settles an invoice.
 *
 * This module is the string half — validation and normalisation, with no Prisma
 * import, so it can be unit-tested without a database and cannot accidentally
 * grow a `Number(...)` in the middle. The Decimal is constructed by the caller
 * from the string this returns.
 */

/**
 * A document amount as a plain decimal string, or null if it is not one.
 *
 * Accepts what a rate confirmation actually prints — `$2,400.00`, `2400`,
 * ` 2,400.50 ` — and rejects anything else outright rather than salvaging a
 * number from it. A rate the system half-understood is worse than a rate it
 * asked about: the picker's rate field is pre-filled and editable precisely so
 * that "could not read this" has somewhere to go.
 *
 * Negative amounts are rejected. A negative freight rate is not a thing, and
 * accepting one would create a contract that pays the customer.
 */
export function normaliseMoney(raw: string | number | null | undefined): string | null {
  if (raw == null) return null;

  const cleaned = String(raw).replace(/[$,\s]/g, '');
  if (!cleaned) return null;

  // Deliberately strict: digits, optionally a single decimal point and more
  // digits. No exponent, no sign, no currency letters — every one of those
  // would be a string somebody meant differently from how it would parse.
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;

  return cleaned;
}
