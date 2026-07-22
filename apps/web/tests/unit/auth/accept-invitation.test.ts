import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ── Mocks ───────────────────────────────────────────────────────────────────
// A single tx stub is shared across every prisma.$transaction call in the route.
const tx = {
  $executeRaw: vi.fn().mockResolvedValue(undefined),
  driverInvitation: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
  user: { findFirst: vi.fn(), create: vi.fn() },
  carrierDriver: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
};

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $transaction: vi.fn(async (fn: any) => fn(tx)),
  },
  TX_OPTIONS: {},
}));

const createUser = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ auth: { admin: { createUser } } }),
}));

const signInWithPassword = vi.fn().mockResolvedValue({});
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({ auth: { signInWithPassword } })),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/rate-limit', () => ({
  authLimiter: {},
  applyRateLimit: vi.fn().mockResolvedValue(null), // never rate-limited in tests
}));

vi.mock('@/lib/onboarding/activation-tracker', () => ({
  recordActivationEvent: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from '@/app/api/auth/accept-invitation/route';

function makeReq(body: unknown): NextRequest {
  return {
    headers: { get: () => null },
    json: async () => body,
  } as unknown as NextRequest;
}

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

const PENDING_INVITE = {
  id: 'inv-1',
  tenantId: 'tenant-1',
  email: 'newdriver@example.com',
  firstName: 'New',
  lastName: 'Driver',
  licenseNumber: null,
  permissions: null,
  role: 'DRIVER',
  status: 'PENDING',
  expiresAt: FUTURE,
};

describe('POST /api/auth/accept-invitation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.$executeRaw.mockResolvedValue(undefined);
    tx.driverInvitation.update.mockResolvedValue({});
    tx.carrierDriver.updateMany.mockResolvedValue({ count: 0 });
  });

  it('accepts a fresh invitation and logs the driver into the portal', async () => {
    tx.driverInvitation.findUnique.mockResolvedValue(PENDING_INVITE);
    tx.user.findFirst.mockResolvedValue(null); // no existing tenant user
    createUser.mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null });
    tx.user.create.mockResolvedValue({ id: 'auth-1', role: 'DRIVER' });

    const res = await POST(makeReq({ invitationId: 'inv-1', password: 'supersecret' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.redirectUrl).toBe('/home');
    expect(createUser).toHaveBeenCalledOnce();
    expect(tx.user.create).toHaveBeenCalledOnce();
    expect(signInWithPassword).toHaveBeenCalledOnce();
  });

  it('re-accepting an already-used invitation returns a friendly 410', async () => {
    tx.driverInvitation.findUnique.mockResolvedValue({ ...PENDING_INVITE, status: 'ACCEPTED' });

    const res = await POST(makeReq({ invitationId: 'inv-1', password: 'supersecret' }));
    const body = await res.json();

    expect(res.status).toBe(410);
    expect(body.error).toMatch(/already been used or cancelled/i);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('returns a specific 409 when the email already has a Supabase auth identity', async () => {
    tx.driverInvitation.findUnique.mockResolvedValue(PENDING_INVITE);
    tx.user.findFirst.mockResolvedValue(null); // nothing in THIS tenant
    // auth.users.email is globally unique — createUser rejects an email that
    // already belongs to another account.
    createUser.mockResolvedValue({
      data: { user: null },
      error: { code: 'email_exists', status: 422, message: 'email address has already been registered' },
    });

    const res = await POST(makeReq({ invitationId: 'inv-1', password: 'supersecret' }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toMatch(/already associated with a DriveCommand account/i);
    // Must NOT be the generic message
    expect(body.error).not.toMatch(/An error occurred while creating your account/i);
    expect(tx.user.create).not.toHaveBeenCalled();
  });
});
