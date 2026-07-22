import { describe, it, expect } from 'vitest';
import {
  getMainContact,
  normalizeContacts,
  mapLegacyPrimaryContact,
  type ContactInput,
} from '@/lib/carrier/client-contacts';

describe('mapLegacyPrimaryContact (backfill mapping)', () => {
  it('maps a client with primaryContact/email/phone to an isMain contact', () => {
    const result = mapLegacyPrimaryContact({
      name: 'Acme Freight',
      primaryContact: 'Jane Doe',
      email: 'jane@acme.com',
      phone: '555-1234',
    });
    expect(result).toEqual({
      name: 'Jane Doe',
      role: null,
      phone: '555-1234',
      email: 'jane@acme.com',
      isMain: true,
    });
  });

  it('falls back to the company name when primaryContact is blank/undefined', () => {
    const blank = mapLegacyPrimaryContact({
      name: 'Great Lakes Steel',
      primaryContact: '   ',
      email: 'billing@gls.com',
      phone: null,
    });
    expect(blank).toEqual({
      name: 'Great Lakes Steel',
      role: null,
      phone: null,
      email: 'billing@gls.com',
      isMain: true,
    });

    const undefinedContact = mapLegacyPrimaryContact({
      name: 'Great Lakes Steel',
      phone: '555-9999',
    });
    expect(undefinedContact).toEqual({
      name: 'Great Lakes Steel',
      role: null,
      phone: '555-9999',
      email: null,
      isMain: true,
    });
  });

  it('returns null when there is no legacy contact data (client stays at zero contacts)', () => {
    const result = mapLegacyPrimaryContact({
      name: 'Empty Client',
      primaryContact: null,
      email: null,
      phone: null,
    });
    expect(result).toBeNull();
  });
});

describe('normalizeContacts (exactly-one-main constraint)', () => {
  it('keeps exactly one main — the first flagged — when multiple rows claim isMain', () => {
    const input: ContactInput[] = [
      { name: 'Alice', isMain: true },
      { name: 'Bob', isMain: true },
      { name: 'Carol', isMain: true },
    ];
    const result = normalizeContacts(input);
    expect(result.filter((c) => c.isMain)).toHaveLength(1);
    expect(result.find((c) => c.isMain)?.name).toBe('Alice');
  });

  it('forces the first contact to be main when none are flagged', () => {
    const input: ContactInput[] = [
      { name: 'Alice', isMain: false },
      { name: 'Bob', isMain: false },
    ];
    const result = normalizeContacts(input);
    expect(result.filter((c) => c.isMain)).toHaveLength(1);
    expect(result.find((c) => c.isMain)?.name).toBe('Alice');
  });

  it('returns [] for empty input — zero contacts is allowed, no main', () => {
    expect(normalizeContacts([])).toEqual([]);
  });

  it('drops rows with an empty or whitespace-only name', () => {
    const input: ContactInput[] = [
      { name: '   ', isMain: true },
      { name: 'Bob', isMain: false },
    ];
    const result = normalizeContacts(input);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Bob');
    expect(result[0].isMain).toBe(true);
  });
});

describe('getMainContact (read path)', () => {
  it('returns the isMain contact when present — its email is what a caller like the customer-email path would use', () => {
    const contacts = [
      { name: 'Bob', email: 'bob@acme.com', isMain: false },
      { name: 'Alice', email: 'alice@acme.com', isMain: true },
    ];
    const main = getMainContact(contacts);
    expect(main?.email).toBe('alice@acme.com');
  });

  it('falls back to the first contact when none are flagged main', () => {
    const contacts = [
      { name: 'Bob', email: 'bob@acme.com', isMain: false },
      { name: 'Alice', email: 'alice@acme.com', isMain: false },
    ];
    const main = getMainContact(contacts);
    expect(main?.email).toBe('bob@acme.com');
  });

  it('returns null for an empty list', () => {
    expect(getMainContact([])).toBeNull();
  });
});
