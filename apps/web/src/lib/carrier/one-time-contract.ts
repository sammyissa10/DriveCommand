/**
 * "Is this contract an agreement for one trip, or a standing one?"
 *
 * Phase 3 of the document-import module creates a spot contract from a rate
 * confirmation, and the requirement is that it be "clearly labelled in the
 * client's contract list so it is never mistaken for a standing agreement".
 * This is the test behind that label.
 *
 * IT READS THE TERM, NOT THE NAME. A contract typed `spot` whose effective and
 * expiration dates are the same day is, as a matter of what was agreed, a
 * one-time contract — so the label survives someone renaming the row, survives
 * the import record being deleted, and applies equally to a one-day contract a
 * human typed in by hand, which is correct. The alternative — a naming
 * convention, or "was it created by an import" — would label the wrong thing:
 * the first breaks on an edit, and the second is about provenance rather than
 * about the agreement.
 *
 * No dependencies, no Prisma types, so both server and client components can
 * import it. Accepts `Date` or `YYYY-MM-DD` because the API serialises dates and
 * the database does not.
 */

function dayOf(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    // Tolerates a full ISO timestamp as well as a plain date.
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
    return match ? match[1] : null;
  }
  return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
}

export function isOneTimeContract(contract: {
  contractType: string | null;
  effectiveDate: Date | string | null;
  expirationDate: Date | string | null;
}): boolean {
  if (contract.contractType !== 'spot') return false;
  const from = dayOf(contract.effectiveDate);
  const to = dayOf(contract.expirationDate);
  return Boolean(from && to && from === to);
}

/** The word shown next to such a contract, in one place so it cannot drift. */
export const ONE_TIME_LABEL = 'One-time';
