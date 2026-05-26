import { prisma } from '@/lib/db/prisma';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { logger } from '@/lib/logger';
import type { GridFilter } from '@/components/data-grid/core/types';
import type { Prisma } from '@/generated/prisma';

// Helper: convert Prisma Decimal | null to string | null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const decStr = (d: any): string | null => (d != null ? String(d) : null);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ListClientsFilters {
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sort?: { field: string; direction: 'asc' | 'desc' };
  filters?: GridFilter[];
}

export interface ClientCreateInput {
  name: string;
  dbaName?: string;
  mcNumber?: string;
  dotNumber?: string;
  taxId?: string;
  primaryContact?: string;
  email?: string;
  phone?: string;
  website?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  portalAccess?: boolean;
  portalEmail?: string;
  paymentTerms?: number;
  creditLimit?: string | number | null;
  notes?: string;
}

export type ClientUpdateInput = Partial<ClientCreateInput>;

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/**
 * Convert GridFilter array to Prisma where clause.
 */
function gridFiltersToPrismaWhere(filters: GridFilter[]): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  for (const filter of filters) {
    const { columnId, operator, value } = filter;

    switch (operator) {
      case 'equals':
        where[columnId] = value;
        break;
      case 'contains':
        where[columnId] = { contains: value as string, mode: 'insensitive' };
        break;
      case 'startsWith':
        where[columnId] = { startsWith: value as string, mode: 'insensitive' };
        break;
      case 'endsWith':
        where[columnId] = { endsWith: value as string, mode: 'insensitive' };
        break;
      case 'anyOf':
        if (Array.isArray(value) && value.length > 0) {
          where[columnId] = { in: value };
        }
        break;
      case 'noneOf':
        if (Array.isArray(value) && value.length > 0) {
          where[columnId] = { notIn: value };
        }
        break;
      case 'isEmpty':
        where[columnId] = null;
        break;
      case 'isNotEmpty':
        where[columnId] = { not: null };
        break;
      case 'eq':
        where[columnId] = value;
        break;
      case 'neq':
        where[columnId] = { not: value };
        break;
      case 'gt':
        if (typeof value === 'object' && value !== null && 'min' in value) {
          where[columnId] = { gt: value.min };
        }
        break;
      case 'lt':
        if (typeof value === 'object' && value !== null && 'min' in value) {
          where[columnId] = { lt: value.min };
        }
        break;
      case 'between':
        if (typeof value === 'object' && value !== null) {
          const obj = value as { min?: unknown; max?: unknown; from?: Date; to?: Date };
          if ('min' in obj && 'max' in obj && obj.min != null && obj.max != null) {
            where[columnId] = { gte: obj.min, lte: obj.max };
          } else if ('from' in obj && 'to' in obj) {
            const filters: unknown[] = [];
            if (obj.from) filters.push({ gte: obj.from });
            if (obj.to) filters.push({ lte: obj.to });
            if (filters.length > 0) {
              where[columnId] = { AND: filters };
            }
          }
        }
        break;
      case 'is':
      case 'before':
      case 'after':
        if (typeof value === 'object' && value !== null && 'from' in value) {
          const from = (value as { from?: Date }).from;
          if (from) {
            if (operator === 'is') {
              // Match the entire day
              const start = new Date(from);
              start.setHours(0, 0, 0, 0);
              const end = new Date(from);
              end.setHours(23, 59, 59, 999);
              where[columnId] = { gte: start, lte: end };
            } else if (operator === 'before') {
              where[columnId] = { lt: from };
            } else if (operator === 'after') {
              where[columnId] = { gt: from };
            }
          }
        }
        break;
    }
  }

  return where;
}

export async function listClients(orgId: string, filters: ListClientsFilters = {}) {
  const { status, search, page = 1, pageSize = 50, sort, filters: gridFilters = [] } = filters;
  const skip = (page - 1) * pageSize;

  // Build where clause
  const where: Prisma.CarrierClientWhereInput = {
    orgId,
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(search ? {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { primaryContact: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ]
    } : {}),
    ...gridFiltersToPrismaWhere(gridFilters),
  };

  // Build orderBy clause
  let orderBy: Prisma.CarrierClientOrderByWithRelationInput = { createdAt: 'desc' };
  if (sort) {
    orderBy = { [sort.field]: sort.direction };
  }

  const [items, total] = await Promise.all([
    prisma.carrierClient.findMany({
      where,
      skip,
      take: pageSize,
      orderBy,
    }),
    prisma.carrierClient.count({ where }),
  ]);

  return { items, total };
}

export async function getClient(orgId: string, id: string) {
  const client = await prisma.carrierClient.findFirst({
    where: { id, orgId },
  });

  if (!client) return null;

  const [openLoadsCount, arResult] = await Promise.all([
    prisma.carrierLoad.count({
      where: {
        clientId: id,
        orgId,
        status: { notIn: ['delivered', 'cancelled', 'invoiced'] },
      },
    }),
    prisma.carrierLoad.aggregate({
      where: { clientId: id, orgId, status: 'invoiced' },
      _sum: { totalRevenue: true },
    }),
  ]);

  return {
    ...client,
    openLoadsCount,
    outstandingAR: decStr(arResult._sum.totalRevenue),
  };
}

export async function createClient(orgId: string, data: ClientCreateInput) {
  const tenantPrisma = await getTenantPrisma();
  const { creditLimit, ...rest } = data;
  return tenantPrisma.carrierClient.create({
    data: {
      ...rest,
      orgId,
      ...(creditLimit !== undefined
        ? { creditLimit: creditLimit !== null ? Number(creditLimit) : null }
        : {}),
    },
  });
}

export async function updateClient(orgId: string, id: string, data: ClientUpdateInput) {
  const tenantPrisma = await getTenantPrisma();
  const existing = await prisma.carrierClient.findFirst({ where: { id, orgId } });
  if (!existing) return null;

  const { creditLimit, ...rest } = data;
  return tenantPrisma.carrierClient.update({
    where: { id },
    data: {
      ...rest,
      ...(creditLimit !== undefined
        ? { creditLimit: creditLimit !== null ? Number(creditLimit) : null }
        : {}),
    },
  });
}

export async function softDeleteClient(orgId: string, id: string) {
  const tenantPrisma = await getTenantPrisma();
  const existing = await prisma.carrierClient.findFirst({ where: { id, orgId } });
  if (!existing) return null;

  return tenantPrisma.carrierClient.update({
    where: { id },
    data: { status: 'inactive' },
  });
}
