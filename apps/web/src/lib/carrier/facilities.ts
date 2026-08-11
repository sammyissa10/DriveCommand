import { prisma } from '@/lib/db/prisma';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { logger } from '@/lib/logger';
import type { PrismaClient } from '@/generated/prisma';
import { facilityVisibilityWhere, type FacilityViewer } from './facility-visibility';

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
  /** Who created it. Optional — every existing caller omits it and is unaffected. */
  createdById?: string;
  updatedById?: string;
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

/**
 * The general facility picker and list.
 *
 * `viewer` is OPTIONAL and omitting it excludes driver residences — spec
 * Section 9's "not in the general picker", enforced in the `where` rather than
 * in whatever renders the result. Default deny is chosen so an existing call
 * site that was never taught about viewers leaks nothing; see
 * `facility-visibility.ts`.
 */
export async function listFacilities(
  orgId: string,
  filters: ListFacilitiesFilters = {},
  viewer?: FacilityViewer | null,
) {
  const tenantPrisma = await getTenantPrisma();
  const { facilityType, search, lat, lng, radiusMiles, page = 1, pageSize = 50 } = filters;
  const skip = (page - 1) * pageSize;

  // If proximity search is requested, first get IDs within radius using haversine formula
  let proximityIds: string[] | null = null;
  if (lat != null && lng != null && radiusMiles != null) {
    // prisma.$queryRaw stays bare — raw SQL cannot run through tenantPrisma proxy
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
    // Driver residences: server-side, never a UI hide (spec Section 9).
    ...facilityVisibilityWhere(viewer),
  };

  const [items, total] = await Promise.all([
    tenantPrisma.carrierFacility.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    tenantPrisma.carrierFacility.count({ where }),
  ]);

  return { items, total };
}

/** One facility. Same default-deny rule as `listFacilities` — a residence is
 *  not fetchable by id either, or the list filter would be a suggestion. */
export async function getFacility(orgId: string, id: string, viewer?: FacilityViewer | null) {
  const tenantPrisma = await getTenantPrisma();
  return tenantPrisma.carrierFacility.findFirst({
    where: {
      id,
      orgId,
      NOT: { facilityType: { startsWith: 'inactive_' } },
      ...facilityVisibilityWhere(viewer),
    },
  });
}

/**
 * Create a facility.
 *
 * `client` is an OPTIONAL pre-resolved tenant Prisma client. Omitting it is the
 * existing behaviour exactly — `getTenantPrisma()` reads the `x-tenant-id`
 * header — so every current call site is untouched. It exists because that
 * header does not exist on `/api/mobile/*` (DEC-11), and the document-import
 * facility ladder runs on both surfaces; passing `getTenantPrismaForOrg(orgId,
 * userId)` is what lets it reuse this function rather than write a second
 * facility-creation path. Same extension `createClient` and `createContract`
 * took in Phase 3, for the same reason.
 */
export async function createFacility(
  orgId: string,
  data: FacilityCreateInput,
  client?: PrismaClient,
) {
  const tenantPrisma = client ?? (await getTenantPrisma());
  return tenantPrisma.carrierFacility.create({
    data: {
      ...data,
      orgId,
    },
  });
}

export async function updateFacility(
  orgId: string,
  id: string,
  data: FacilityUpdateInput,
  viewer?: FacilityViewer | null,
) {
  const tenantPrisma = await getTenantPrisma();
  const existing = await tenantPrisma.carrierFacility.findFirst({
    // Same filter as the read: a facility you may not see is not one you may
    // edit, or "server-side filter" would mean "hidden but writable".
    where: {
      id,
      orgId,
      NOT: { facilityType: { startsWith: 'inactive_' } },
      ...facilityVisibilityWhere(viewer),
    },
  });
  if (!existing) return null;

  return tenantPrisma.carrierFacility.update({
    where: { id },
    data,
  });
}

export async function softDeleteFacility(orgId: string, id: string, viewer?: FacilityViewer | null) {
  const tenantPrisma = await getTenantPrisma();
  const existing = await tenantPrisma.carrierFacility.findFirst({
    where: { id, orgId, ...facilityVisibilityWhere(viewer) },
  });
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
