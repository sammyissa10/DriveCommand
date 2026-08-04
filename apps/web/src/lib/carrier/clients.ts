import { getTenantPrisma } from '@/lib/context/tenant-context';
import { logger } from '@/lib/logger';
import type { GridFilter } from '@/components/data-grid/core/types';
import type { Prisma, PrismaClient } from '@/generated/prisma';
import { normalizeContacts, getMainContact, type ContactInput } from '@/lib/carrier/client-contacts';

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
  contacts?: ContactInput[];
}

export type ClientUpdateInput = Partial<ClientCreateInput>;

const CONTACTS_ORDER_BY: Prisma.CarrierClientContactOrderByWithRelationInput[] = [
  { isMain: 'desc' },
  { createdAt: 'asc' },
];

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

  const tenantPrisma = await getTenantPrisma();
  const [items, total] = await Promise.all([
    tenantPrisma.carrierClient.findMany({
      where,
      skip,
      take: pageSize,
      orderBy,
      include: {
        contacts: {
          orderBy: CONTACTS_ORDER_BY,
          select: { id: true, name: true, role: true, phone: true, email: true, isMain: true },
        },
      },
    }),
    tenantPrisma.carrierClient.count({ where }),
  ]);

  return { items, total };
}

export interface ClientLoadStat {
  loads: number;
  revenue: number;
}

/**
 * Per-client load count + total revenue, aggregated from non-deleted
 * CarrierLoads. Used by the mobile-web Clients Overview KPIs and row meta.
 * Returns a Map keyed by clientId; clients with no loads are simply absent.
 */
export async function getClientLoadStats(
  orgId: string,
  clientIds: string[],
): Promise<Map<string, ClientLoadStat>> {
  if (clientIds.length === 0) return new Map();

  const tenantPrisma = await getTenantPrisma();
  const rows = await tenantPrisma.carrierLoad.groupBy({
    by: ['clientId'],
    where: { orgId, clientId: { in: clientIds }, deletedAt: null },
    _count: { _all: true },
    _sum: { totalRevenue: true },
  });

  return new Map(
    rows.map((r) => [
      r.clientId,
      { loads: r._count._all, revenue: Number(r._sum.totalRevenue ?? 0) },
    ]),
  );
}

export async function getClient(orgId: string, id: string) {
  const tenantPrisma = await getTenantPrisma();
  const client = await tenantPrisma.carrierClient.findFirst({
    where: { id, orgId },
    include: {
      contacts: {
        orderBy: CONTACTS_ORDER_BY,
        select: { id: true, name: true, role: true, phone: true, email: true, isMain: true },
      },
    },
  });

  if (!client) return null;

  const [openLoadsCount, arResult] = await Promise.all([
    tenantPrisma.carrierLoad.count({
      where: {
        clientId: id,
        orgId,
        status: { notIn: ['delivered', 'cancelled', 'invoiced'] },
      },
    }),
    tenantPrisma.carrierLoad.aggregate({
      where: { clientId: id, orgId, status: 'invoiced' },
      _sum: { totalRevenue: true },
    }),
  ]);

  return {
    ...client,
    openLoadsCount,
    outstandingAR: decStr(arResult._sum.totalRevenue),
    mainContact: getMainContact(client.contacts),
  };
}

/** Thrown when a client with the same name already exists in the org. */
export class DuplicateClientError extends Error {
  readonly clientName: string;
  constructor(clientName: string) {
    super(`A client named "${clientName}" already exists`);
    this.name = 'DuplicateClientError';
    this.clientName = clientName;
  }
}

/**
 * @param db Optional pre-resolved tenant client.
 *
 * `getTenantPrisma()` reads the `x-tenant-id` request header, which middleware
 * does not inject on `/api/mobile/*` — Bearer auth means no Supabase cookie, so
 * middleware returns early and the header never exists (DEC-11). A caller that
 * already holds a tenant-scoped client from `getTenantPrismaForOrg(orgId)` must
 * be able to pass it in, otherwise the only way to create a client from the
 * mobile surface is a second implementation of this function. Omitting it keeps
 * the existing behaviour exactly, so every current call site is unchanged.
 */
export async function createClient(
  orgId: string,
  data: ClientCreateInput,
  db?: PrismaClient,
) {
  const tenantPrisma = db ?? (await getTenantPrisma());
  const { creditLimit, contacts, ...rest } = data;
  const name = rest.name.trim();

  // Enforce unique client name per org (case-insensitive, excluding soft-deleted).
  const existing = await tenantPrisma.carrierClient.findFirst({
    where: { orgId, deletedAt: null, name: { equals: name, mode: 'insensitive' } },
    select: { id: true },
  });
  if (existing) throw new DuplicateClientError(name);

  const normalizedContacts = contacts !== undefined ? normalizeContacts(contacts) : [];

  return tenantPrisma.carrierClient.create({
    data: {
      ...rest,
      name,
      orgId,
      ...(creditLimit !== undefined
        ? { creditLimit: creditLimit !== null ? Number(creditLimit) : null }
        : {}),
      ...(normalizedContacts.length > 0
        ? {
            contacts: {
              create: normalizedContacts.map(({ id: _id, ...c }) => ({ ...c, orgId })),
            },
          }
        : {}),
    },
    include: {
      contacts: {
        orderBy: CONTACTS_ORDER_BY,
        select: { id: true, name: true, role: true, phone: true, email: true, isMain: true },
      },
    },
  });
}

export async function updateClient(orgId: string, id: string, data: ClientUpdateInput) {
  const tenantPrisma = await getTenantPrisma();
  const existing = await tenantPrisma.carrierClient.findFirst({ where: { id, orgId } });
  if (!existing) return null;

  const { creditLimit, contacts, ...rest } = data;

  return tenantPrisma.$transaction(async (tx) => {
    if (contacts !== undefined) {
      const normalizedContacts = normalizeContacts(contacts);
      // Replace-all: delete existing contacts for this client, re-insert normalized.
      await tx.carrierClientContact.deleteMany({ where: { clientId: id, orgId } });
      if (normalizedContacts.length > 0) {
        await tx.carrierClientContact.createMany({
          data: normalizedContacts.map(({ id: _id, ...c }) => ({ ...c, orgId, clientId: id })),
        });
      }
    }

    return tx.carrierClient.update({
      where: { id },
      data: {
        ...rest,
        ...(creditLimit !== undefined
          ? { creditLimit: creditLimit !== null ? Number(creditLimit) : null }
          : {}),
      },
      include: {
        contacts: {
          orderBy: CONTACTS_ORDER_BY,
          select: { id: true, name: true, role: true, phone: true, email: true, isMain: true },
        },
      },
    });
  });
}

export async function softDeleteClient(orgId: string, id: string) {
  const tenantPrisma = await getTenantPrisma();
  const existing = await tenantPrisma.carrierClient.findFirst({ where: { id, orgId } });
  if (!existing) return null;

  return tenantPrisma.carrierClient.update({
    where: { id },
    data: { status: 'inactive' },
  });
}
