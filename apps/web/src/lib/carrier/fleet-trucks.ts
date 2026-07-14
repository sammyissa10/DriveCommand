import { prisma } from '@/lib/db/prisma';
import { getTenantPrisma } from '@/lib/context/tenant-context';

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
  photoS3Key?: string | null;
}

export type CarrierTruckUpdateInput = Partial<CarrierTruckCreateInput>;

/**
 * Thrown when a create would collide with an existing (non-deleted) truck in the
 * same org on a user-facing identifier. The route maps this to a 409 so the
 * quick-create sheet can surface an inline error on the right field — never a
 * raw 500.
 */
export class CarrierTruckConflictError extends Error {
  constructor(
    public readonly field: 'vin' | 'unitNumber',
    /** The existing truck's unit number, for a message that names the record. */
    public readonly existingUnitNumber: string,
  ) {
    super(`DUPLICATE_${field.toUpperCase()}`);
    this.name = 'CarrierTruckConflictError';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate the next globally unique vehicle ID in the format VH-YYYY-NNNNN.
 * Queries the max vehicle_id to determine the next sequence number.
 */
export async function generateVehicleId(): Promise<string> {
  const [id] = await generateVehicleIds(1);
  return id;
}

/**
 * Generate N sequential vehicle IDs in a single DB read.
 * Use this instead of calling generateVehicleId() N times — multiple single-ID
 * calls would each read the same max() and produce duplicate IDs.
 *
 * IMPORTANT: call this OUTSIDE any prisma.$transaction callback. It uses the
 * global prisma client; calling it inside a transaction deadlocks the max:1 pool.
 */
export async function generateVehicleIds(count: number): Promise<string[]> {
  if (count === 0) return [];
  const year = new Date().getFullYear();
  const prefix = `VH-${year}-`;

  const rows = await prisma.$queryRawUnsafe<Array<{ vehicle_id: string }>>(
    `SELECT vehicle_id FROM carrier_trucks WHERE vehicle_id LIKE $1 ORDER BY vehicle_id DESC LIMIT 1`,
    `${prefix}%`
  );

  let nextSeq = 1;
  if (rows.length > 0) {
    const suffix = rows[0].vehicle_id.slice(prefix.length);
    const parsed = parseInt(suffix, 10);
    if (!isNaN(parsed)) nextSeq = parsed + 1;
  }

  return Array.from({ length: count }, (_, i) =>
    `${prefix}${String(nextSeq + i).padStart(5, '0')}`
  );
}

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

export async function listCarrierTrucks(orgId: string, filters: ListCarrierTrucksFilters = {}) {
  const tenantPrisma = await getTenantPrisma();
  const { status, truckType, search, page = 1, pageSize = 50 } = filters;
  const skip = (page - 1) * pageSize;

  const where = {
    orgId,
    deletedAt: null,
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
    tenantPrisma.carrierTruck.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        primaryDispatches: {
          where: { status: { in: ['planned', 'in_transit'] } },
          select: {
            primaryDriver: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
          orderBy: { scheduledDeparture: 'desc' },
          take: 1,
        },
      },
    }),
    tenantPrisma.carrierTruck.count({ where }),
  ]);

  return { items, total };
}

export async function getCarrierTruck(orgId: string, id: string) {
  const tenantPrisma = await getTenantPrisma();
  return tenantPrisma.carrierTruck.findFirst({
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
  const tenantPrisma = await getTenantPrisma();
  const { registrationExpiry, licenseExpiry, insuranceExpiry, displayName, ...rest } = data;

  // Guard the two user-facing identifiers before we mint a vehicleId. Neither
  // has a DB unique constraint, so without this a duplicate silently creates a
  // second record. Scoped to the org and non-deleted rows.
  if (data.vin && data.vin.trim()) {
    const dupVin = await tenantPrisma.carrierTruck.findFirst({
      where: { orgId, deletedAt: null, vin: { equals: data.vin.trim(), mode: 'insensitive' } },
      select: { unitNumber: true },
    });
    if (dupVin) throw new CarrierTruckConflictError('vin', dupVin.unitNumber);
  }
  const dupUnit = await tenantPrisma.carrierTruck.findFirst({
    where: { orgId, deletedAt: null, unitNumber: data.unitNumber.trim() },
    select: { unitNumber: true },
  });
  if (dupUnit) throw new CarrierTruckConflictError('unitNumber', dupUnit.unitNumber);

  const vehicleId = await generateVehicleId();
  const resolvedDisplayName = displayName || data.unitNumber;

  return tenantPrisma.carrierTruck.create({
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
  const tenantPrisma = await getTenantPrisma();
  const existing = await tenantPrisma.carrierTruck.findFirst({ where: { id, orgId } });
  if (!existing) return null;

  const { registrationExpiry, licenseExpiry, insuranceExpiry, ...rest } = data;

  return tenantPrisma.carrierTruck.update({
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
