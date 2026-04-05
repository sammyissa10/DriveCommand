import { prisma } from '@/lib/db/prisma';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ListCarrierTrucksFilters {
  status?: string;
  truckType?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface CarrierTruckCreateInput {
  unitNumber: string;
  vin?: string;
  year?: number | null;
  make?: string;
  model?: string;
  truckType?: string;
  grossWeightLbs?: number | null;
  payloadCapacityLbs?: number | null;
  currentOdometerMiles?: number | null;
  licensePlate?: string;
  licenseState?: string;
  registrationExpiry?: string | Date | null;
  licenseExpiry?: string | Date | null;
  insuranceExpiry?: string | Date | null;
  status?: string;
  notes?: string;
}

export type CarrierTruckUpdateInput = Partial<CarrierTruckCreateInput>;

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

export async function listCarrierTrucks(orgId: string, filters: ListCarrierTrucksFilters = {}) {
  const { status, truckType, search, page = 1, pageSize = 50 } = filters;
  const skip = (page - 1) * pageSize;

  const where = {
    orgId,
    ...(status ? { status } : {}),
    ...(truckType ? { truckType } : {}),
    ...(search
      ? {
          OR: [
            { unitNumber: { contains: search, mode: 'insensitive' as const } },
            { vin: { contains: search, mode: 'insensitive' as const } },
            { make: { contains: search, mode: 'insensitive' as const } },
            { model: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.carrierTruck.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.carrierTruck.count({ where }),
  ]);

  return { items, total };
}

export async function getCarrierTruck(orgId: string, id: string) {
  return prisma.carrierTruck.findFirst({
    where: { id, orgId },
    include: {
      primaryDispatches: {
        select: {
          id: true,
          status: true,
          scheduledDeparture: true,
          actualMiles: true,
          plannedMiles: true,
          primaryDriver: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { scheduledDeparture: 'desc' },
      },
    },
  });
}

export async function createCarrierTruck(orgId: string, data: CarrierTruckCreateInput) {
  const { registrationExpiry, licenseExpiry, insuranceExpiry, ...rest } = data;

  return prisma.carrierTruck.create({
    data: {
      ...rest,
      orgId,
      ...(registrationExpiry ? { registrationExpiry: new Date(registrationExpiry) } : {}),
      ...(licenseExpiry ? { licenseExpiry: new Date(licenseExpiry) } : {}),
      ...(insuranceExpiry ? { insuranceExpiry: new Date(insuranceExpiry) } : {}),
    },
  });
}

export async function updateCarrierTruck(
  orgId: string,
  id: string,
  data: CarrierTruckUpdateInput
) {
  const existing = await prisma.carrierTruck.findFirst({ where: { id, orgId } });
  if (!existing) return null;

  const { registrationExpiry, licenseExpiry, insuranceExpiry, ...rest } = data;

  return prisma.carrierTruck.update({
    where: { id },
    data: {
      ...rest,
      ...(registrationExpiry !== undefined
        ? { registrationExpiry: registrationExpiry ? new Date(registrationExpiry) : null }
        : {}),
      ...(licenseExpiry !== undefined
        ? { licenseExpiry: licenseExpiry ? new Date(licenseExpiry) : null }
        : {}),
      ...(insuranceExpiry !== undefined
        ? { insuranceExpiry: insuranceExpiry ? new Date(insuranceExpiry) : null }
        : {}),
    },
  });
}
