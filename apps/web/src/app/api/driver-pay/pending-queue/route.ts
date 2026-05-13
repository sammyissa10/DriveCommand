import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { UserRole } from '@/lib/auth/roles';
import Decimal from 'decimal.js';

// ---------------------------------------------------------------------------
// Query schema
// ---------------------------------------------------------------------------

const QuerySchema = z.object({
  countOnly: z.enum(['true', 'false']).optional(),
  driverId: z.string().uuid().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  minAmount: z.string().optional(),
  maxAmount: z.string().optional(),
  overrideOnly: z.enum(['true', 'false']).optional(),
  sort: z
    .enum(['oldest', 'newest', 'amount_desc', 'amount_asc'])
    .optional()
    .default('oldest'),
});

// ---------------------------------------------------------------------------
// GET /api/driver-pay/pending-queue
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  // 1. Auth
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. RBAC
  const role: string = session.role;
  const isDriver = role === 'driver' || role === UserRole.DRIVER;
  if (isDriver) {
    return NextResponse.json(
      { error: 'Drivers cannot view the pending pay queue.' },
      { status: 403 },
    );
  }

  // 3. Parse query params
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

  // 4. Build base where clause
  const where = {
    deletedAt: null as null,
    payStatus: { in: ['PENDING_REVIEW', 'DISPUTED'] as ('PENDING_REVIEW' | 'DISPUTED')[] },
    ...(query.driverId ? { driverId: query.driverId } : {}),
    ...(query.dateFrom || query.dateTo
      ? {
          createdAt: {
            ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
            ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
          },
        }
      : {}),
    ...(query.overrideOnly === 'true' ? { overrideReason: { not: null } } : {}),
  };

  // 5. Count-only mode (for sidebar badge — counts only PENDING_REVIEW)
  if (query.countOnly === 'true') {
    const count = await prisma.loadDriverAssignment.count({
      where: {
        ...where,
        payStatus: 'PENDING_REVIEW',
      },
    });
    return NextResponse.json({ count });
  }

  // 6. Full mode — query rows with joins
  const rows = await prisma.loadDriverAssignment.findMany({
    where,
    include: {
      driver: { select: { id: true, firstName: true, lastName: true } },
      load: { select: { id: true, loadNumber: true } },
      payComponents: {
        where: { deletedAt: null },
        select: { grossAmount: true },
      },
    },
    orderBy:
      query.sort === 'newest'
        ? { createdAt: 'desc' }
        : query.sort === 'oldest'
          ? { createdAt: 'asc' }
          : undefined,
  });

  // 7. Compute totalPay per row and apply amount filters
  let serialized = rows.map((row) => {
    const totalPay = row.payComponents.reduce(
      (sum, c) => sum.plus(new Decimal(c.grossAmount.toString())),
      new Decimal(0),
    );

    const ageDays = Math.floor(
      (Date.now() - row.createdAt.getTime()) / 86400000,
    );

    return {
      id: row.id,
      driverId: row.driverId,
      driverName: `${row.driver.firstName} ${row.driver.lastName}`,
      loadId: row.loadId,
      loadNumber: row.load?.loadNumber ?? null,
      payStatus: row.payStatus as 'PENDING_REVIEW' | 'DISPUTED',
      paymentModel: row.payType as string,
      totalPay: totalPay.toDecimalPlaces(2).toString(),
      totalPayDecimal: totalPay, // for in-memory sort/filter
      isOverride: !!row.overrideReason,
      overrideReason: row.overrideReason,
      ageDays,
      createdAt: row.createdAt.toISOString(),
    };
  });

  // Apply amount filters in-memory
  if (query.minAmount) {
    const min = new Decimal(query.minAmount);
    serialized = serialized.filter((r) => r.totalPayDecimal.gte(min));
  }
  if (query.maxAmount) {
    const max = new Decimal(query.maxAmount);
    serialized = serialized.filter((r) => r.totalPayDecimal.lte(max));
  }

  // Sort by amount in-memory if requested
  if (query.sort === 'amount_desc') {
    serialized.sort((a, b) =>
      b.totalPayDecimal.minus(a.totalPayDecimal).toNumber(),
    );
  } else if (query.sort === 'amount_asc') {
    serialized.sort((a, b) =>
      a.totalPayDecimal.minus(b.totalPayDecimal).toNumber(),
    );
  }

  // Strip internal decimal field before returning
  const result = serialized.map(({ totalPayDecimal: _td, ...rest }) => rest);

  return NextResponse.json({ assignments: result, count: result.length });
}
