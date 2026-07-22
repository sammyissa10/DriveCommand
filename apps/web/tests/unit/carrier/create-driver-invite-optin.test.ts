import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────
const tenantPrisma = {
  carrierDriver: {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
  },
  driverInvitation: {
    updateMany: vi.fn().mockResolvedValue({}),
    create: vi.fn(),
  },
  carrierFacility: { findFirst: vi.fn() },
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

import { createCarrierDriver } from '@/lib/carrier/fleet-drivers';
import { sendDriverInvitation } from '@/lib/email/send-driver-invitation';
import { prisma } from '@/lib/db/prisma';

const DRIVER = { id: 'd1', email: 'driver@example.com' };

describe('createCarrierDriver — default-on portal invite (sendInvite gate)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tenantPrisma.carrierDriver.create.mockResolvedValue(DRIVER);
    tenantPrisma.driverInvitation.updateMany.mockResolvedValue({});
    tenantPrisma.driverInvitation.create.mockResolvedValue({
      id: 'inv-1',
      expiresAt: new Date('2026-08-01T00:00:00Z'),
    });
    // No existing User to link to.
    (prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  });

  it('Test A: sendInvite=false → no invitation created, no email sent', async () => {
    const result = await createCarrierDriver('org-1', {
      firstName: 'A',
      lastName: 'B',
      email: 'driver@example.com',
      sendInvite: false,
    });

    expect(sendDriverInvitation).not.toHaveBeenCalled();
    expect(tenantPrisma.driverInvitation.create).not.toHaveBeenCalled();
    expect(result).toEqual({ driver: DRIVER, emailSent: false });
  });

  it('Test B: sendInvite omitted → default on, invitation created and email sent once', async () => {
    (prisma.tenant.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ name: 'Acme' });

    const result = await createCarrierDriver('org-1', {
      firstName: 'A',
      lastName: 'B',
      email: 'driver@example.com',
    });

    expect(tenantPrisma.driverInvitation.create).toHaveBeenCalledTimes(1);
    expect(sendDriverInvitation).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ driver: DRIVER, emailSent: true });
  });

  it('Test C: sendInvite=true → invitation created and email sent once', async () => {
    (prisma.tenant.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ name: 'Acme' });

    const result = await createCarrierDriver('org-1', {
      firstName: 'A',
      lastName: 'B',
      email: 'driver@example.com',
      sendInvite: true,
    });

    expect(tenantPrisma.driverInvitation.create).toHaveBeenCalledTimes(1);
    expect(sendDriverInvitation).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ driver: DRIVER, emailSent: true });
  });
});
