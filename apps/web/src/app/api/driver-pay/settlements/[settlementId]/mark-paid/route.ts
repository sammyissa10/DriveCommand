/**
 * POST /api/driver-pay/settlements/[settlementId]/mark-paid
 *
 * Mark a FINALIZED settlement as PAID, flipping all child assignments to PAID.
 * OWNER only. Irreversible.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { UserRole } from '@/lib/auth/roles';
import { Prisma } from '@/generated/prisma';
import type { PrismaClient } from '@/generated/prisma';

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const BodySchema = z.object({
  settlementReference: z.string().min(1).max(100).optional(),
  paidAt: z.coerce.date().optional(),
});

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ settlementId: string }> },
) {
  // 1. Auth
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. RBAC — OWNER only
  const role = session.role.toUpperCase();
  if (role !== UserRole.OWNER && role !== UserRole.SYSTEM_ADMIN) {
    return NextResponse.json(
      { error: 'Only owners can mark settlements as paid.' },
      { status: 403 },
    );
  }

  // 3. Parse body (optional)
  let body: z.infer<typeof BodySchema> = {};
  try {
    const raw = await req.json();
    const parsed = BodySchema.safeParse(raw);
    if (parsed.success) body = parsed.data;
  } catch {
    // Empty body is fine
  }

  const { settlementId } = await params;
  const prisma = await getTenantPrisma();

  // 4. Load settlement
  const settlement = await prisma.driverSettlement.findFirst({
    where: { id: settlementId, tenantId: session.tenantId },
  });

  if (!settlement) {
    return NextResponse.json({ error: 'Settlement not found.' }, { status: 404 });
  }

  // 5. Validate status — must be FINALIZED
  if (settlement.status !== 'FINALIZED') {
    return NextResponse.json(
      { error: 'Only FINALIZED settlements can be marked as paid.' },
      { status: 409 },
    );
  }

  const paidAt = body.paidAt ?? new Date();
  const settlementRef = body.settlementReference ?? settlement.settlementReference;

  // 6. Atomic transaction
  const [updated] = await prisma.$transaction([
    // Update settlement status
    prisma.driverSettlement.update({
      where: { id: settlementId },
      data: {
        status: 'PAID',
        paidAt,
        settlementReference: settlementRef,
      },
    }),
    // Flip all child assignments to PAID
    prisma.loadDriverAssignment.updateMany({
      where: { settlementId },
      data: {
        payStatus: 'PAID',
        paidAt,
      },
    }),
    // Update bonus paidAt
    prisma.driverBonus.updateMany({
      where: { settlementId },
      data: { paidAt },
    }),
    // Audit log
    (prisma as unknown as PrismaClient).driverPayAuditLog.create({
      data: {
        tenantId: session.tenantId,
        entityType: 'DriverSettlement',
        entityId: settlementId,
        action: 'settlement:marked-paid',
        previousValue: { status: 'FINALIZED' } as Prisma.InputJsonValue,
        newValue: {
          status: 'PAID',
          paidAt: paidAt.toISOString(),
        } as Prisma.InputJsonValue,
        actorId: session.userId,
        createdBy: session.userId,
      },
    }),
  ]);

  revalidatePath('/carrier/driver-pay/settlements');

  return NextResponse.json({
    settlement: {
      id: updated.id,
      status: updated.status,
      paidAt: updated.paidAt?.toISOString() ?? null,
      settlementReference: updated.settlementReference,
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}
