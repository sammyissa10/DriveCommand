/**
 * GET /api/driver-pay/settlements
 *
 * List settlements with filters: driverId, status, periodStart, periodEnd, page, pageSize.
 * MANAGER+ can see all; DRIVER can only see their own.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { UserRole } from '@/lib/auth/roles';
import { Prisma } from '@/generated/prisma';
import type { Prisma as PrismaTypes } from '@/generated/prisma';

// ---------------------------------------------------------------------------
// RBAC helpers
// ---------------------------------------------------------------------------

function isManagerOrAbove(role: string): boolean {
  const r = role.toUpperCase();
  return r === UserRole.SYSTEM_ADMIN || r === UserRole.OWNER || r === UserRole.MANAGER;
}

// ---------------------------------------------------------------------------
// Query schema
// ---------------------------------------------------------------------------

const QuerySchema = z.object({
  driverId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'FINALIZED', 'PAID', 'VOIDED']).optional(),
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

function serializeSettlement(s: {
  id: string;
  tenantId: string;
  driverId: string;
  periodStart: Date;
  periodEnd: Date;
  status: string;
  grossTaxable: Prisma.Decimal;
  grossNonTaxable: Prisma.Decimal;
  totalDeductions: Prisma.Decimal;
  netPay: Prisma.Decimal;
  settlementReference: string | null;
  pdfUrl: string | null;
  finalizedBy: string | null;
  finalizedAt: Date | null;
  paidAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  driver?: {
    firstName: string;
    lastName: string;
    payModel: string;
  } | null;
}) {
  return {
    id: s.id,
    tenantId: s.tenantId,
    driverId: s.driverId,
    periodStart: s.periodStart.toISOString(),
    periodEnd: s.periodEnd.toISOString(),
    status: s.status,
    grossTaxable: s.grossTaxable.toString(),
    grossNonTaxable: s.grossNonTaxable.toString(),
    totalDeductions: s.totalDeductions.toString(),
    netPay: s.netPay.toString(),
    settlementReference: s.settlementReference,
    pdfUrl: s.pdfUrl,
    finalizedBy: s.finalizedBy,
    finalizedAt: s.finalizedAt?.toISOString() ?? null,
    paidAt: s.paidAt?.toISOString() ?? null,
    notes: s.notes,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    createdBy: s.createdBy,
    driver: s.driver
      ? {
          firstName: s.driver.firstName,
          lastName: s.driver.lastName,
          employmentType: s.driver.payModel,
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  // 1. Auth
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const role = session.role;
  const isDriver = role.toUpperCase() === UserRole.DRIVER || role === 'driver';
  const isManager = isManagerOrAbove(role);

  if (!isDriver && !isManager) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  // 2. Parse query params
  const searchParams = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = QuerySchema.safeParse(searchParams);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid query parameters.' },
      { status: 400 },
    );
  }
  const query = parsed.data;

  const prisma = await getTenantPrisma();

  // 3. Build where clause
  const where: PrismaTypes.DriverSettlementWhereInput = { tenantId: session.tenantId };

  // DRIVER: force filter to own settlements only
  if (isDriver) {
    // Look up the driver record for this user
    const driverRecord = await prisma.carrierDriver.findFirst({
      where: { userId: session.userId },
      select: { id: true },
    });
    if (!driverRecord) {
      return NextResponse.json({ settlements: [], totalCount: 0, page: query.page, pageSize: query.pageSize });
    }
    where.driverId = driverRecord.id;
  } else if (query.driverId) {
    where.driverId = query.driverId;
  }

  if (query.status) {
    where.status = query.status;
  }
  if (query.periodStart) {
    where.periodStart = { gte: query.periodStart };
  }
  if (query.periodEnd) {
    where.periodEnd = { lte: query.periodEnd };
  }

  // 4. Query
  const skip = (query.page - 1) * query.pageSize;

  const [rows, totalCount] = await Promise.all([
    prisma.driverSettlement.findMany({
      where,
      include: {
        driver: {
          select: { firstName: true, lastName: true, payModel: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: query.pageSize,
    }),
    prisma.driverSettlement.count({ where }),
  ]);

  return NextResponse.json({
    settlements: rows.map(serializeSettlement),
    totalCount,
    page: query.page,
    pageSize: query.pageSize,
  });
}
