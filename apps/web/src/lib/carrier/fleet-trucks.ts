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
  displayName?: string | null;
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
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate the next globally unique vehicle ID in the format VH-YYYY-NNNNN.
 * Queries the max vehicle_id to determine the next sequence number.
 */
async function generateVehicleId(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `VH-${year}-`;

  // Find the highest existing vehicle_id for this year
  const rows = await prisma.$queryRawUnsafe<Array<{ vehicle_id: string }>>(
    `SELECT vehicle_id FROM carrier_trucks WHERE vehicle_id LIKE $1 ORDER BY vehicle_id DESC LIMIT 1`,
    `${prefix}%`
  );

  let nextSeq = 1;
  if (rows.length > 0) {
    const lastId = rows[0].vehicle_id;
    const suffix = lastId.slice(prefix.length);
    const parsed = parseInt(suffix, 10);
    if (!isNaN(parsed)) {
      nextSeq = parsed + 1;
    }
  }

  return `${prefix}${String(nextSeq).padStart(5, '0')}`;
}

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
            { displayName: { contains: search, mode: 'insensitive' as const } },
            { vehicleId: { contains: search, mode: 'insensitive' as const } },
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
  const { registrationExpiry, licenseExpiry, insuranceExpiry, displayName, ...rest } = data;

  const vehicleId = await generateVehicleId();
  const resolvedDisplayName = displayName || data.unitNumber;

  return prisma.carrierTruck.create({
    data: {
      ...rest,
      orgId,
      vehicleId,
      displayName: resolvedDisplayName,
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
