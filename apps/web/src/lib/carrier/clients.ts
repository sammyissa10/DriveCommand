import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';

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
  notes?: string;
}

export type ClientUpdateInput = Partial<ClientCreateInput>;

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

export async function listClients(orgId: string, filters: ListClientsFilters = {}) {
  const { status, search, page = 1, pageSize = 50 } = filters;
  const skip = (page - 1) * pageSize;

  const where = {
    orgId,
    ...(status ? { status } : {}),
    ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.carrierClient.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
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
  return prisma.carrierClient.create({
    data: {
      ...data,
      orgId,
    },
  });
}

export async function updateClient(orgId: string, id: string, data: ClientUpdateInput) {
  const existing = await prisma.carrierClient.findFirst({ where: { id, orgId } });
  if (!existing) return null;

  return prisma.carrierClient.update({
    where: { id },
    data,
  });
}

export async function softDeleteClient(orgId: string, id: string) {
  const existing = await prisma.carrierClient.findFirst({ where: { id, orgId } });
  if (!existing) return null;

  return prisma.carrierClient.update({
    where: { id },
    data: { status: 'inactive' },
  });
}
