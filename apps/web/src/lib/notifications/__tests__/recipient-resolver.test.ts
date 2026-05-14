/**
 * Vitest unit tests for recipient-resolver.ts
 *
 * All tests inject a mock PrismaClient so no real DB connection is required.
 * Focus: the new `external_email` rule type behaviour.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock base prisma module — prevents import-time DB connection side effects
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));

import { resolveRecipients } from '../recipient-resolver';
import type { DefaultRecipientRule } from '../types';

// ---------------------------------------------------------------------------
// Mock PrismaClient factory
// ---------------------------------------------------------------------------

/**
 * Returns a minimal mock PrismaClient stub covering the methods used by the resolver.
 */
function makeMockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    notificationSubscription: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    userNotificationPreference: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveRecipients — external_email rule type', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Test 1: External email with no existing User row → email-only recipient returned
  // -------------------------------------------------------------------------
  it('external_email with no existing User row returns email-only recipient (userId=null)', async () => {
    const db = makeMockPrisma();
    // No user found for this email
    (db.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const rules: DefaultRecipientRule[] = [
      { type: 'external_email', payloadKey: 'driverEmail' },
    ];

    const result = await resolveRecipients(
      db as unknown as Parameters<typeof resolveRecipients>[0],
      'tenant-1',
      'driver.invited',
      rules,
      { driverEmail: 'newdriver@example.com' },
    );

    expect(result).toHaveLength(1);
    expect(result[0].userId).toBeNull();
    expect(result[0].email).toBe('newdriver@example.com');
    expect(result[0].emailEnabled).toBe(true);
    expect(result[0].inAppEnabled).toBe(false);

    // userNotificationPreference should NOT have been queried (no userIds to look up)
    expect(db.userNotificationPreference.findMany).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 2: External email matching an EXISTING User row → user's preferences loaded
  // -------------------------------------------------------------------------
  it('external_email matching an existing User row promotes to User-backed recipient with prefs', async () => {
    const db = makeMockPrisma();

    // User exists with this email in the tenant
    (db.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'user-uuid-123',
      email: 'existing@example.com',
    });

    // No extra subscriptions
    (db.notificationSubscription.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    // User's pref: email on, in-app off
    (db.userNotificationPreference.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { userId: 'user-uuid-123', emailEnabled: true, inAppEnabled: false },
    ]);

    const rules: DefaultRecipientRule[] = [
      { type: 'external_email', payloadKey: 'driverEmail' },
    ];

    const result = await resolveRecipients(
      db as unknown as Parameters<typeof resolveRecipients>[0],
      'tenant-1',
      'driver.invited',
      rules,
      { driverEmail: 'existing@example.com' },
    );

    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe('user-uuid-123');
    expect(result[0].email).toBe('existing@example.com');
    expect(result[0].emailEnabled).toBe(true);
    expect(result[0].inAppEnabled).toBe(false); // from prefs
  });

  // -------------------------------------------------------------------------
  // Test 3: External email with empty/missing payload value → no recipients returned
  // -------------------------------------------------------------------------
  it('external_email with missing payload key returns empty array without calling user.findFirst', async () => {
    const db = makeMockPrisma();

    // If findFirst is called, the test should fail
    (db.user.findFirst as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('user.findFirst should not be called when payload key is missing');
    });

    const rules: DefaultRecipientRule[] = [
      { type: 'external_email', payloadKey: 'driverEmail' },
    ];

    const result = await resolveRecipients(
      db as unknown as Parameters<typeof resolveRecipients>[0],
      'tenant-1',
      'driver.invited',
      rules,
      {}, // No driverEmail key
    );

    expect(result).toHaveLength(0);
    expect(db.user.findFirst).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 4: Email casing normalization
  // -------------------------------------------------------------------------
  it('external_email normalizes email to lowercase', async () => {
    const db = makeMockPrisma();
    // No user found — external-email path
    (db.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const rules: DefaultRecipientRule[] = [
      { type: 'external_email', payloadKey: 'driverEmail' },
    ];

    const result = await resolveRecipients(
      db as unknown as Parameters<typeof resolveRecipients>[0],
      'tenant-1',
      'driver.invited',
      rules,
      { driverEmail: 'Mixed.Case@Example.COM' },
    );

    expect(result).toHaveLength(1);
    expect(result[0].email).toBe('mixed.case@example.com');
    expect(result[0].userId).toBeNull();

    // Verify findFirst was called with the lowercased email for the user lookup
    expect(db.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ email: 'mixed.case@example.com' }),
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Test 5: Deduplication — same email passed twice via two external_email rules
  // -------------------------------------------------------------------------
  it('two external_email rules with the same email are deduplicated', async () => {
    const db = makeMockPrisma();
    (db.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const rules: DefaultRecipientRule[] = [
      { type: 'external_email', payloadKey: 'emailA' },
      { type: 'external_email', payloadKey: 'emailB' },
    ];

    const result = await resolveRecipients(
      db as unknown as Parameters<typeof resolveRecipients>[0],
      'tenant-1',
      'driver.invited',
      rules,
      { emailA: 'same@example.com', emailB: 'same@example.com' },
    );

    // emailOnlyMap deduplicates by lowercase email key
    expect(result).toHaveLength(1);
    expect(result[0].email).toBe('same@example.com');
  });

  // -------------------------------------------------------------------------
  // Test 6: Existing rule types (role, tenant_owners, related) are unaffected
  // -------------------------------------------------------------------------
  it('role rule type still resolves User-backed recipients normally', async () => {
    const db = makeMockPrisma();

    (db.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'owner-uuid-1', email: 'owner@fleet.com' },
    ]);
    (db.notificationSubscription.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.userNotificationPreference.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const rules: DefaultRecipientRule[] = [{ type: 'role', role: 'OWNER' }];

    const result = await resolveRecipients(
      db as unknown as Parameters<typeof resolveRecipients>[0],
      'tenant-1',
      'load.assigned',
      rules,
      {},
    );

    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe('owner-uuid-1');
    expect(result[0].email).toBe('owner@fleet.com');
    expect(result[0].emailEnabled).toBe(true); // default (no pref row)
    expect(result[0].inAppEnabled).toBe(true); // default (no pref row)
  });
});
