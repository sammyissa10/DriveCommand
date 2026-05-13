/**
 * POST /api/driver-pay/settlements/[settlementId]/void
 *
 * Void a DRAFT or FINALIZED settlement.
 * - Releases all child assignments (settlementId = null)
 * - Releases all child bonuses (settlementId = null)
 * - Reverses deduction amountCollected for amounts applied in this settlement
 * - PAID settlements cannot be voided (409)
 * OWNER only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { Prisma } from '@/generated/prisma';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { UserRole } from '@/lib/auth/roles';
import type { PrismaClient } from '@/generated/prisma';

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const BodySchema = z.object({
  reason: z.string().min(5).max(500),
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
      { error: 'Only owners can void settlements.' },
      { status: 403 },
    );
  }

  // 3. Parse body
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Validation error.' },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const { settlementId } = await params;
  const prisma = await getTenantPrisma();

  // 4. Load settlement
  const settlement = await prisma.driverSettlement.findFirst({
    where: { id: settlementId, tenantId: session.tenantId },
  });

  if (!settlement) {
    return NextResponse.json({ error: 'Settlement not found.' }, { status: 404 });
  }

  // 5. Validate status — PAID cannot be voided
  if (settlement.status === 'PAID') {
    return NextResponse.json(
      {
        error:
          'PAID settlements cannot be voided. Issue a correction instead.',
      },
      { status: 409 },
    );
  }

  if (settlement.status !== 'DRAFT' && settlement.status !== 'FINALIZED') {
    return NextResponse.json(
      { error: 'Only DRAFT or FINALIZED settlements can be voided.' },
      { status: 409 },
    );
  }

  // 6. Parse deductions snapshot to reverse amountCollected
  type DeductionSnapshot = {
    deductionId: string;
    appliedAmount: string;
  };

  let deductionSnapshots: DeductionSnapshot[] = [];
  if (settlement.notes) {
    try {
      const notesData: unknown = JSON.parse(settlement.notes);
      if (
        notesData &&
        typeof notesData === 'object' &&
        '_deductionsApplied' in notesData &&
        Array.isArray((notesData as { _deductionsApplied: unknown[] })._deductionsApplied)
      ) {
        deductionSnapshots = (
          notesData as { _deductionsApplied: DeductionSnapshot[] }
        )._deductionsApplied;
      }
    } catch {
      // No snapshot
    }
  }

  // 7. Build void notes (append reason)
  const voidNotes = settlement.notes
    ? `${settlement.notes}\n[VOIDED: ${new Date().toISOString()}] ${body.reason}`
    : `[VOIDED: ${new Date().toISOString()}] ${body.reason}`;

  // 8. Atomic transaction
  const deductionUpdates = deductionSnapshots.map((snap) =>
    (prisma as unknown as PrismaClient).driverDeduction.update({
      where: { id: snap.deductionId },
      data: {
        amountCollected: {
          decrement: new Prisma.Decimal(snap.appliedAmount),
        },
      },
    }),
  );

  const [updated] = await prisma.$transaction([
    // Void settlement
    prisma.driverSettlement.update({
      where: { id: settlementId },
      data: {
        status: 'VOIDED',
        notes: voidNotes,
      },
    }),
    // Release child assignments
    prisma.loadDriverAssignment.updateMany({
      where: { settlementId },
      data: { settlementId: null },
    }),
    // Release child bonuses
    prisma.driverBonus.updateMany({
      where: { settlementId },
      data: { settlementId: null },
    }),
    // Reverse deduction amountCollected
    ...deductionUpdates,
    // Audit log
    (prisma as unknown as PrismaClient).driverPayAuditLog.create({
      data: {
        tenantId: session.tenantId,
        entityType: 'DriverSettlement',
        entityId: settlementId,
        action: 'settlement:voided',
        previousValue: { status: settlement.status } as Prisma.InputJsonValue,
        newValue: {
          status: 'VOIDED',
          reason: body.reason,
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
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}
