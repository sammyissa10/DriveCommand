import { prisma } from '@/lib/db/prisma';
import { sendDriverInvitation } from '@/lib/email/send-driver-invitation';
import { getAppBaseUrl } from '@/lib/app-url';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ListCarrierDriversFilters {
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface CarrierDriverCreateInput {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  cdlNumber?: string;
  cdlState?: string;
  cdlClass?: string;
  cdlExpiry?: string | Date | null;
  homeTerminalId?: string;
  payModel?: string;
  payRate?: number | null;
  payPeriod?: string;
  userId?: string;
  notes?: string;
}

export type CarrierDriverUpdateInput = Partial<CarrierDriverCreateInput>;

export interface CreateCarrierDriverResult {
  driver: Awaited<ReturnType<typeof prisma.carrierDriver.create>>;
  emailSent: boolean;
  emailWarning?: string;
}

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

export async function listCarrierDrivers(orgId: string, filters: ListCarrierDriversFilters = {}) {
  const { status, search, page = 1, pageSize = 50 } = filters;
  const skip = (page - 1) * pageSize;

  const where = {
    orgId,
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' as const } },
            { lastName: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.carrierDriver.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { email: true } },
        homeTerminal: { select: { id: true, name: true } },
      },
    }),
    prisma.carrierDriver.count({ where }),
  ]);

  return { items, total };
}

export async function getCarrierDriver(orgId: string, id: string) {
  return prisma.carrierDriver.findFirst({
    where: { id, orgId },
    include: {
      user: { select: { email: true } },
      homeTerminal: { select: { id: true, name: true } },
      primaryDispatches: {
        select: {
          id: true,
          status: true,
          scheduledDeparture: true,
          actualMiles: true,
          plannedMiles: true,
          driverPayRecords: {
            select: {
              netPay: true,
            },
          },
        },
        orderBy: { scheduledDeparture: 'desc' },
      },
      coDispatches: {
        select: {
          id: true,
          status: true,
          scheduledDeparture: true,
          actualMiles: true,
          plannedMiles: true,
          driverPayRecords: {
            select: {
              netPay: true,
            },
          },
        },
        orderBy: { scheduledDeparture: 'desc' },
      },
    },
  });
}

export async function createCarrierDriver(
  orgId: string,
  data: CarrierDriverCreateInput
): Promise<CreateCarrierDriverResult> {
  const { userId, cdlExpiry, payRate, ...rest } = data;

  // If userId is provided, check for existing link
  if (userId) {
    const existing = await prisma.carrierDriver.findFirst({ where: { userId } });
    if (existing) {
      throw new Error('User already linked to a carrier driver');
    }
  }

  // Verify homeTerminalId belongs to this org (FK ownership check)
  if (data.homeTerminalId) {
    const facility = await prisma.carrierFacility.findFirst({
      where: { id: data.homeTerminalId, orgId },
    });
    if (!facility) {
      throw new Error('Invalid homeTerminalId: facility not found in this organization');
    }
  }

  const driver = await prisma.carrierDriver.create({
    data: {
      ...rest,
      orgId,
      ...(userId ? { userId } : {}),
      ...(cdlExpiry ? { cdlExpiry: new Date(cdlExpiry) } : {}),
      ...(payRate != null ? { payRate } : {}),
    },
  });

  // Link to existing User if one exists for this email in the same org
  if (data.email && !userId) {
    try {
      const existingUser = await prisma.user.findFirst({
        where: {
          email: data.email.toLowerCase().trim(),
          tenantId: orgId,
        },
      });
      if (existingUser) {
        await prisma.carrierDriver.update({
          where: { id: driver.id },
          data: { userId: existingUser.id },
        });
      }
    } catch (linkError) {
      logger.error('Failed to link existing user to carrier driver:', linkError);
      // Non-fatal — driver record still valid, can be linked later
    }
  }

  // Send invitation email if email is provided
  if (data.email) {
    try {
      // Cancel any existing PENDING invitations for the same email + org
      await prisma.driverInvitation.updateMany({
        where: { email: data.email, tenantId: orgId, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });

      // Create a DriverInvitation record
      const invitation = await prisma.driverInvitation.create({
        data: {
          tenantId: orgId,
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          licenseNumber: data.cdlNumber || null,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          status: 'PENDING',
        },
      });

      // Fetch tenant name for the invitation email
      let organizationName = 'your fleet';
      try {
        const tenant = await prisma.tenant.findUnique({
          where: { id: orgId },
          select: { name: true },
        });
        organizationName = tenant?.name || 'your fleet';
      } catch {
        // Fall back to generic name — non-critical
      }

      // Build the accept URL and send the invitation email
      const acceptUrl = `${getAppBaseUrl()}/accept-invitation?id=${invitation.id}`;

      try {
        await sendDriverInvitation(data.email, {
          firstName: data.firstName,
          lastName: data.lastName,
          organizationName,
          acceptUrl,
          expiresAt: invitation.expiresAt.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
        });
        return { driver, emailSent: true };
      } catch (emailError) {
        logger.error('Failed to send carrier driver invitation email:', emailError);
        return {
          driver,
          emailSent: false,
          emailWarning:
            'Driver created but invitation email failed to send. Please resend manually.',
        };
      }
    } catch (invitationError) {
      // DriverInvitation DB insert failed — driver record still created successfully
      logger.error('Failed to create carrier driver invitation record:', invitationError);
      return {
        driver,
        emailSent: false,
        emailWarning:
          'Driver created but invitation email failed to send. Please resend manually.',
      };
    }
  }

  return { driver, emailSent: false };
}

export async function deleteCarrierDriver(
  orgId: string,
  driverId: string
): Promise<{ deleted: true } | { error: string }> {
  const driver = await prisma.carrierDriver.findFirst({ where: { id: driverId, orgId } });
  if (!driver) return { error: 'Not found' };

  // Check for active dispatches
  const activeDispatchCount = await prisma.carrierDispatch.count({
    where: {
      OR: [{ primaryDriverId: driverId }, { coDriverId: driverId }],
      status: 'in_progress',
    },
  });
  if (activeDispatchCount > 0) {
    return {
      error: 'Cannot delete a driver with an active dispatch. Complete or cancel the dispatch first.',
    };
  }

  // Check for approved/paid pay records
  const lockedPayCount = await prisma.driverPayRecord.count({
    where: { driverId, status: { in: ['approved', 'paid'] } },
  });
  if (lockedPayCount > 0) {
    return { error: 'Cannot delete a driver with approved or paid pay records.' };
  }

  // Delete in correct order inside a transaction
  await prisma.$transaction(async (tx) => {
    // Delete all pay records (only pending/voided remain after safety checks)
    await tx.driverPayRecord.deleteMany({ where: { driverId } });

    // Delete carrier expenses linked to this driver
    await tx.carrierExpense.deleteMany({ where: { driverId } });

    // Delete invitations linked to this driver's email
    if (driver.email) {
      await tx.driverInvitation.deleteMany({
        where: { email: driver.email, tenantId: orgId },
      });
    }

    // Delete the carrier driver record
    await tx.carrierDriver.delete({ where: { id: driverId } });

    // Optionally clean up the linked user if exclusively owned by this org
    if (driver.userId) {
      const user = await tx.user.findUnique({ where: { id: driver.userId } });
      if (user && user.tenantId === orgId) {
        // Check no other CarrierDriver records reference this userId
        const otherDriverLinks = await tx.carrierDriver.count({
          where: { userId: driver.userId },
        });
        if (otherDriverLinks === 0) {
          await tx.user.delete({ where: { id: driver.userId } });
        }
      }
    }
  });

  return { deleted: true };
}

export async function resendCarrierDriverInvitation(
  orgId: string,
  driverId: string
): Promise<{ sent: true; email: string; warning?: string } | { error: string }> {
  const driver = await prisma.carrierDriver.findFirst({ where: { id: driverId, orgId } });
  if (!driver) return { error: 'Not found' };

  if (!driver.email) return { error: 'Driver has no email address on file.' };

  // Find the most recent invitation
  const latestInvitation = await prisma.driverInvitation.findFirst({
    where: { email: driver.email, tenantId: orgId },
    orderBy: { createdAt: 'desc' },
  });

  if (latestInvitation && latestInvitation.status === 'ACCEPTED') {
    return {
      error: 'This driver has already accepted their invitation and has an active account.',
    };
  }

  // Cancel any existing PENDING or EXPIRED invitations
  if (latestInvitation && ['PENDING', 'EXPIRED'].includes(latestInvitation.status)) {
    await prisma.driverInvitation.updateMany({
      where: { email: driver.email, tenantId: orgId, status: { in: ['PENDING', 'EXPIRED'] } },
      data: { status: 'CANCELLED' },
    });
  }

  // Create a new invitation record
  const invitation = await prisma.driverInvitation.create({
    data: {
      tenantId: orgId,
      email: driver.email,
      firstName: driver.firstName,
      lastName: driver.lastName,
      licenseNumber: driver.cdlNumber || null,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      status: 'PENDING',
    },
  });

  // Fetch tenant name for the email
  let organizationName = 'your fleet';
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: orgId },
      select: { name: true },
    });
    organizationName = tenant?.name || 'your fleet';
  } catch {
    // Fall back to generic name — non-critical
  }

  // Build the accept URL and send the invitation email
  const acceptUrl = `${getAppBaseUrl()}/accept-invitation?id=${invitation.id}`;

  try {
    await sendDriverInvitation(driver.email, {
      firstName: driver.firstName,
      lastName: driver.lastName,
      organizationName,
      acceptUrl,
      expiresAt: invitation.expiresAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    });
    return { sent: true, email: driver.email };
  } catch (emailError) {
    logger.error('Failed to send resend carrier driver invitation email:', emailError);
    return {
      sent: true,
      email: driver.email,
      warning: 'Invitation created but email failed to send',
    };
  }
}

export async function getLatestInvitationStatus(
  orgId: string,
  email: string
): Promise<string | null> {
  const invitation = await prisma.driverInvitation.findFirst({
    where: { email, tenantId: orgId },
    orderBy: { createdAt: 'desc' },
    select: { status: true },
  });
  return invitation?.status ?? null;
}

export async function updateCarrierDriver(
  orgId: string,
  id: string,
  data: CarrierDriverUpdateInput
) {
  const existing = await prisma.carrierDriver.findFirst({ where: { id, orgId } });
  if (!existing) return null;

  const { cdlExpiry, payRate, userId, ...rest } = data;

  // Verify userId belongs to this org when being set (FK ownership check)
  if (userId !== undefined && userId) {
    const user = await prisma.user.findFirst({
      where: { id: userId, tenantId: orgId },
    });
    if (!user) {
      throw new Error('Invalid userId: user not found in this organization');
    }
  }

  // Verify homeTerminalId belongs to this org when being set (FK ownership check)
  if (data.homeTerminalId !== undefined && data.homeTerminalId) {
    const facility = await prisma.carrierFacility.findFirst({
      where: { id: data.homeTerminalId, orgId },
    });
    if (!facility) {
      throw new Error('Invalid homeTerminalId: facility not found in this organization');
    }
  }

  return prisma.carrierDriver.update({
    where: { id },
    data: {
      ...rest,
      ...(cdlExpiry !== undefined ? { cdlExpiry: cdlExpiry ? new Date(cdlExpiry) : null } : {}),
      ...(payRate !== undefined ? { payRate } : {}),
      ...(userId !== undefined ? { userId: userId || null } : {}),
    },
  });
}
