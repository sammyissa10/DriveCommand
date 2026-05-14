/**
 * POST /api/driver-pay/me/settlements/[id]/dispute
 *
 * Submits a dispute for one of the authenticated driver's own FINALIZED settlements.
 * Creates a DriverDispute record and writes to DriverPayAuditLog.
 * Accessible by DRIVER role only (web session or mobile Bearer token).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDriverContext } from '@/lib/driver-pay/require-driver';
import { prisma as globalPrisma, TX_OPTIONS } from '@/lib/db/prisma';
import type { PrismaClient } from '@/generated/prisma';

const disputeSchema = z.object({
  issueCategory: z.enum(['WRONG_AMOUNT', 'MISSING_PAY', 'WRONG_MILES', 'MISSING_RECEIPT', 'OTHER']),
  driverMessage: z.string().min(50, 'Message must be at least 50 characters').max(2000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireDriverContext(req);
  if ('error' in ctx) return ctx.error;
  const { session, driver, isMobile, getPrisma } = ctx;

  const { id: settlementId } = await params;

  // Parse and validate body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = disputeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Validation error.' }, { status: 400 });
  }

  const { issueCategory, driverMessage } = parsed.data;

  try {
    // Verify settlement ownership and status
    const fetchSettlement = (tx: PrismaClient) =>
      tx.driverSettlement.findFirst({
        where: {
          id: settlementId,
          driverId: driver.id,
          tenantId: session.tenantId,
          deletedAt: null,
        },
        select: { id: true, status: true },
      });

    const settlement = isMobile
      ? await (globalPrisma as unknown as PrismaClient).$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
          return fetchSettlement(tx as unknown as PrismaClient);
        }, TX_OPTIONS)
      : await fetchSettlement(await getPrisma());

    if (!settlement) {
      return NextResponse.json({ error: 'Settlement not found.' }, { status: 404 });
    }

    if (settlement.status !== 'FINALIZED') {
      return NextResponse.json(
        { error: 'Only FINALIZED settlements can be disputed.' },
        { status: 400 },
      );
    }

    // Create dispute + audit log in a transaction
    const createDispute = async (tx: PrismaClient) => {
      const dispute = await tx.driverDispute.create({
        data: {
          tenantId: session.tenantId,
          driverId: driver.id,
          targetType: 'SETTLEMENT',
          targetId: settlementId,
          issueCategory,
          driverMessage,
          status: 'OPEN',
          createdBy: session.userId,
        },
      });

      await tx.driverPayAuditLog.create({
        data: {
          tenantId: session.tenantId,
          entityType: 'SETTLEMENT',
          entityId: settlementId,
          action: 'DISPUTE_OPENED',
          newValue: { disputeId: dispute.id, issueCategory },
          actorId: session.userId,
          createdBy: session.userId,
        },
      });

      return dispute;
    };

    const dispute = isMobile
      ? await (globalPrisma as unknown as PrismaClient).$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
          return createDispute(tx as unknown as PrismaClient);
        }, TX_OPTIONS)
      : await (await getPrisma()).$transaction(
          (tx) => createDispute(tx as unknown as PrismaClient),
          TX_OPTIONS,
        );

    return NextResponse.json(
      {
        dispute: {
          id: dispute.id,
          status: dispute.status,
          issueCategory: dispute.issueCategory,
          driverMessage: dispute.driverMessage,
          createdAt: dispute.createdAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('POST /api/driver-pay/me/settlements/[id]/dispute error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
