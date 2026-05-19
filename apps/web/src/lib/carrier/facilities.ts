import { prisma } from '@/lib/db/prisma';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ListFacilitiesFilters {
  facilityType?: string;
  search?: string;
  lat?: number;
  lng?: number;
  radiusMiles?: number;
  page?: number;
  pageSize?: number;
}

export interface FacilityCreateInput {
  name: string;
  facilityType?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  lumperRequired?: boolean;
  appointmentRequired?: boolean;
  contacts?: Array<{ name: string; phone?: string; email?: string; role?: string }>;
  notes?: string;
}

export type FacilityUpdateInput = Partial<FacilityCreateInput>;

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

export async function listFacilities(orgId: string, filters: ListFacilitiesFilters = {}) {
  const { facilityType, search, lat, lng, radiusMiles, page = 1, pageSize = 50 } = filters;
  const skip = (page - 1) * pageSize;

  // If proximity search is requested, first get IDs within radius using haversine formula
  let proximityIds: string[] | null = null;
  if (lat != null && lng != null && radiusMiles != null) {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM facilities
      WHERE org_id = ${orgId}
        AND latitude IS NOT NULL
        AND longitude IS NOT NULL
        AND (
          3959 * acos(
            cos(radians(${lat})) * cos(radians(latitude)) * cos(radians(longitude) - radians(${lng}))
            + sin(radians(${lat})) * sin(radians(latitude))
          )
        ) <= ${radiusMiles}
    `;
    proximityIds = rows.map((r) => r.id);
  }

  const where = {
    orgId,
    // Exclude soft-deleted facilities (those with 'inactive_' prefix)
    NOT: { facilityType: { startsWith: 'inactive_' } },
    ...(facilityType ? { facilityType } : {}),
    ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
    ...(proximityIds != null ? { id: { in: proximityIds } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.carrierFacility.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.carrierFacility.count({ where }),
  ]);

  return { items, total };
}

export async function getFacility(orgId: string, id: string) {
  return prisma.carrierFacility.findFirst({
    where: {
      id,
      orgId,
      NOT: { facilityType: { startsWith: 'inactive_' } },
    },
  });
}

export async function createFacility(orgId: string, data: FacilityCreateInput) {
  const tenantPrisma = await getTenantPrisma();
  return tenantPrisma.carrierFacility.create({
    data: {
      ...data,
      orgId,
    },
  });
}

export async function updateFacility(orgId: string, id: string, data: FacilityUpdateInput) {
  const tenantPrisma = await getTenantPrisma();
  const existing = await prisma.carrierFacility.findFirst({
    where: { id, orgId, NOT: { facilityType: { startsWith: 'inactive_' } } },
  });
  if (!existing) return null;

  return tenantPrisma.carrierFacility.update({
    where: { id },
    data,
  });
}

export async function softDeleteFacility(orgId: string, id: string) {
  const tenantPrisma = await getTenantPrisma();
  const existing = await prisma.carrierFacility.findFirst({ where: { id, orgId } });
  if (!existing) return null;

  // NOTE: CarrierFacility lacks an 'active' column. Soft-delete uses facilityType prefix convention.
  // Migration 015 should add an 'active' boolean column; update this logic afterward.
  const currentType = existing.facilityType ?? 'terminal';
  const newType = currentType.startsWith('inactive_') ? currentType : `inactive_${currentType}`;

  logger.info('softDeleteFacility: marking facility inactive via facilityType prefix', { id, orgId, newType });

  return tenantPrisma.carrierFacility.update({
    where: { id },
    data: { facilityType: newType },
  });
}
