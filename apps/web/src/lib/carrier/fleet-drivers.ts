import { prisma } from '@/lib/db/prisma';

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

export async function createCarrierDriver(orgId: string, data: CarrierDriverCreateInput) {
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

  return prisma.carrierDriver.create({
    data: {
      ...rest,
      orgId,
      ...(userId ? { userId } : {}),
      ...(cdlExpiry ? { cdlExpiry: new Date(cdlExpiry) } : {}),
      ...(payRate != null ? { payRate } : {}),
    },
  });
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
