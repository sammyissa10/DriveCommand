/**
 * GET /api/driver-pay/me/deductions
 *
 * Returns the authenticated driver's own active deductions (visibleToDriver=true),
 * enriched with decimal.js installment progress.
 * Accessible by DRIVER role only (web session or mobile Bearer token).
 */

import { NextRequest, NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import { requireDriverContext } from '@/lib/driver-pay/require-driver';
import type { PrismaClient } from '@/generated/prisma';

// Use the Prisma-generated return type for deductions
type DriverDeductionRow = Awaited<ReturnType<PrismaClient['driverDeduction']['findMany']>>[number];

export async function GET(req: NextRequest) {
  const ctx = await requireDriverContext(req);
  if ('error' in ctx) return ctx.error;
  const { session, driver, isMobile, getPrisma, withBypassRls } = ctx;

  try {
    const fetchDeductions = (tx: PrismaClient): Promise<DriverDeductionRow[]> => {
      return tx.driverDeduction.findMany({
        where: {
          driverId: driver.id,
          tenantId: session.tenantId,
          deletedAt: null,
          visibleToDriver: true,
        },
      });
    };

    const raw: DriverDeductionRow[] = isMobile
      ? await withBypassRls(fetchDeductions)
      : await fetchDeductions(await getPrisma());

    // Compute installment progress using decimal.js — never native float
    const deductions = raw.map((d) => {
      const collected = new Decimal(d.amountCollected?.toString() ?? '0');
      const total = new Decimal(d.totalAmount?.toString() ?? '0');
      const remaining = total.minus(collected);
      const pct = total.isZero()
        ? 0
        : collected.div(total).times(100).toDecimalPlaces(0).toNumber();

      return {
        ...d,
        amountPerPeriod: d.amountPerPeriod?.toString() ?? null,
        totalAmount: d.totalAmount?.toString() ?? null,
        amountCollected: d.amountCollected?.toString() ?? null,
        progress: {
          collected: collected.toString(),
          total: total.toString(),
          remaining: remaining.toString(),
          pct,
        },
      };
    });

    return NextResponse.json({ deductions });
  } catch (error) {
    console.error('GET /api/driver-pay/me/deductions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
