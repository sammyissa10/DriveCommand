import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────
const tenantPrisma = {
  carrierDriver: { findFirst: vi.fn(), update: vi.fn().mockResolvedValue({}) },
  driverInvitation: { findFirst: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
};

vi.mock('@/lib/context/tenant-context', () => ({
  getTenantPrisma: vi.fn(async () => tenantPrisma),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: { tenant: { findUnique: vi.fn() }, user: { findFirst: vi.fn() } },
  TX_OPTIONS: {},
}));

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/email/send-driver-invitation', () => ({ sendDriverInvitation: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/app-url', () => ({ getAppBaseUrl: () => 'https://drivecommand.app' }));

import { resendCarrierDriverInvitation } from '@/lib/carrier/fleet-drivers';
import { sendDriverInvitation } from '@/lib/email/send-driver-invitation';

describe('resendCarrierDriverInvitation — admin portal-access provisioning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tenantPrisma.carrierDriver.update.mockResolvedValue({});
  });

  it('is idempotent: a driver that already has a linked login returns alreadyProvisioned (no error)', async () => {
    tenantPrisma.carrierDriver.findFirst.mockResolvedValue({
      id: 'd1',
      orgId: 'org-1',
      email: 'driver@example.com',
      userId: 'user-1', // already linked → portal access already granted
    });

    const result = await resendCarrierDriverInvitation('org-1', 'd1');

    expect(result).toEqual({ alreadyProvisioned: true, email: 'driver@example.com' });
    expect('error' in result).toBe(false);
    expect(sendDriverInvitation).not.toHaveBeenCalled();
  });

  it('self-heals a mislinked driver whose invitation is ACCEPTED but userId is unset', async () => {
    tenantPrisma.carrierDriver.findFirst.mockResolvedValue({
      id: 'd2',
      orgId: 'org-1',
      email: 'accepted@example.com',
      userId: null, // link was never written
    });
    tenantPrisma.driverInvitation.findFirst.mockResolvedValue({
      id: 'inv-2',
      status: 'ACCEPTED',
      userId: 'user-2',
    });

    const result = await resendCarrierDriverInvitation('org-1', 'd2');

    expect(result).toEqual({ alreadyProvisioned: true, email: 'accepted@example.com' });
    // The carrier_drivers row is healed to point at the accepted login.
    expect(tenantPrisma.carrierDriver.update).toHaveBeenCalledWith({
      where: { id: 'd2' },
      data: { userId: 'user-2' },
    });
    expect(sendDriverInvitation).not.toHaveBeenCalled();
  });
});
