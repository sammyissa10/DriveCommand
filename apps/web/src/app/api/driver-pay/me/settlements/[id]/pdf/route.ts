/**
 * GET /api/driver-pay/me/settlements/[id]/pdf
 *
 * Returns the PDF URL for one of the authenticated driver's own settlements.
 * Accessible by DRIVER role only (web session or mobile Bearer token).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireDriverContext } from '@/lib/driver-pay/require-driver';
import type { PrismaClient } from '@/generated/prisma';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireDriverContext(req);
  if ('error' in ctx) return ctx.error;
  const { session, driver, isMobile, getPrisma, withBypassRls } = ctx;

  const { id } = await params;

  try {
    const fetchPdf = (tx: PrismaClient) =>
      tx.driverSettlement.findFirst({
        where: {
          id,
          driverId: driver.id,
          tenantId: session.tenantId,
          deletedAt: null,
        },
        select: { id: true, pdfUrl: true },
      });

    const settlement = isMobile
      ? await withBypassRls(fetchPdf)
      : await fetchPdf(await getPrisma());

    if (!settlement) {
      return NextResponse.json({ error: 'Settlement not found.' }, { status: 404 });
    }

    if (!settlement.pdfUrl) {
      return NextResponse.json({ error: 'PDF not generated yet.' }, { status: 404 });
    }

    return NextResponse.json({ url: settlement.pdfUrl });
  } catch (error) {
    console.error('GET /api/driver-pay/me/settlements/[id]/pdf error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
