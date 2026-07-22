/**
 * Pure helpers for the carrier client "contacts" relation (client_contacts).
 *
 * A client can have zero, one, or many contacts. When any exist, exactly one
 * must be flagged `isMain` (the DB enforces AT MOST one via a partial unique
 * index on `is_main = true`; this module enforces EXACTLY one when any
 * contacts exist).
 *
 * No DB access here — these are unit-testable in isolation (see
 * __tests__/client-contacts.test.ts).
 */

export interface ContactInput {
  id?: string;
  name: string;
  role?: string | null;
  phone?: string | null;
  email?: string | null;
  isMain: boolean;
}

/**
 * Returns the contact flagged `isMain`, else the first contact, else null.
 * Used by both display surfaces and the customer-email read path.
 */
export function getMainContact<T extends { isMain: boolean }>(contacts: T[]): T | null {
  if (!contacts || contacts.length === 0) return null;
  return contacts.find((c) => c.isMain) ?? contacts[0] ?? null;
}

/**
 * Normalizes a contacts array before persisting:
 * - Trims name/role/phone/email.
 * - Drops rows with an empty (or whitespace-only) name.
 * - Empty input (or all-dropped) returns [] — zero contacts is valid.
 * - If any contacts remain, enforces EXACTLY one `isMain`: keeps the first
 *   flagged main; if none (or more than one) are flagged, forces the first
 *   remaining contact to be main and clears the rest.
 */
export function normalizeContacts(contacts: ContactInput[]): ContactInput[] {
  const cleaned = (contacts ?? [])
    .map((c) => ({
      ...c,
      name: (c.name ?? '').trim(),
      role: c.role?.trim() || null,
      phone: c.phone?.trim() || null,
      email: c.email?.trim() || null,
    }))
    .filter((c) => c.name.length > 0);

  if (cleaned.length === 0) return [];

  const firstMainIndex = cleaned.findIndex((c) => c.isMain);
  const mainIndex = firstMainIndex !== -1 ? firstMainIndex : 0;

  return cleaned.map((c, i) => ({ ...c, isMain: i === mainIndex }));
}

/**
 * Mirrors the backfill migration's rule (20260722000005_backfill_client_contacts):
 * maps a client's legacy single-contact columns to a would-be `client_contacts`
 * row. Returns null when there's no legacy contact data (client stays at zero
 * contacts). `name` falls back to the company name when `primaryContact` is
 * blank (client_contacts.name is NOT NULL).
 */
export function mapLegacyPrimaryContact(client: {
  name: string;
  primaryContact?: string | null;
  email?: string | null;
  phone?: string | null;
}): ContactInput | null {
  const primaryContact = client.primaryContact?.trim() || '';
  const email = client.email?.trim() || '';
  const phone = client.phone?.trim() || '';

  if (!primaryContact && !email && !phone) return null;

  return {
    name: primaryContact || client.name,
    role: null,
    phone: phone || null,
    email: email || null,
    isMain: true,
  };
}
