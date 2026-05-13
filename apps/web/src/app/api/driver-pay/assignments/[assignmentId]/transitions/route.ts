import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { UserRole } from '@/lib/auth/roles';
import {
  canTransition,
  nextStatusFor,
  TRANSITION_LABELS,
  type TransitionAction,
  type PayStatus,
  type AssignmentSnapshotForFsm,
  type ComponentSnapshotForFsm,
} from '@/lib/driver-pay/state-machine';
import { Prisma } from '@/generated/prisma';

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

function serializeAssignment(a: {
  id: string;
  tenantId: string;
  loadId: string;
  driverId: string;
  driverRole: string;
  payType: string;
  baseRate: Prisma.Decimal;
  rateUnit: string;
  currency: string;
  payStatus: string;
  actualMiles: Prisma.Decimal | null;
  mileageSource: string | null;
  loadRevenue: Prisma.Decimal | null;
  overrideReason: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  settlementId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}) {
  return {
    id: a.id,
    tenantId: a.tenantId,
    loadId: a.loadId,
    driverId: a.driverId,
    driverRole: a.driverRole,
    payType: a.payType,
    baseRate: a.baseRate.toString(),
    rateUnit: a.rateUnit,
    currency: a.currency,
    payStatus: a.payStatus,
    actualMiles: a.actualMiles?.toString() ?? null,
    mileageSource: a.mileageSource,
    loadRevenue: a.loadRevenue?.toString() ?? null,
    overrideReason: a.overrideReason,
    approvedBy: a.approvedBy,
    approvedAt: a.approvedAt?.toISOString() ?? null,
    settlementId: a.settlementId,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    deletedAt: a.deletedAt?.toISOString() ?? null,
  };
}

// ---------------------------------------------------------------------------
// Map DB payType → state machine paymentModel
// ---------------------------------------------------------------------------

function toPaymentModel(
  payType: string,
): AssignmentSnapshotForFsm['paymentModel'] {
  switch (payType) {
    case 'CPM':
      return 'CPM';
    case 'HOURLY':
      return 'HOURLY';
    case 'PERCENTAGE':
      return 'PERCENTAGE';
    case 'DAILY':
      return 'DAILY';
    case 'FLAT_PER_LOAD':
    case 'SALARY':
    default:
      return 'FLAT';
  }
}

// ---------------------------------------------------------------------------
// Body schema
// ---------------------------------------------------------------------------

const BodySchema = z.object({
  action: z.enum(['submit', 'approve', 'dispute', 'reject', 'correct']),
  reason: z.string().min(1).max(2000).optional(),
});

// ---------------------------------------------------------------------------
// POST /api/driver-pay/assignments/[assignmentId]/transitions
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  // 1. Auth
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse body
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

  // 3. RBAC gate — drivers cannot change pay status
  const role: string = session.role;
  const isDriver = role === 'driver' || role === UserRole.DRIVER;
  if (isDriver) {
    return NextResponse.json(
      { error: 'Drivers cannot change pay status.' },
      { status: 403 },
    );
  }

  // Block the 'correct' action — corrections go through the dedicated endpoint
  if (body.action === 'correct') {
    return NextResponse.json(
      {
        error: 'Use the Corrections API to record an adjustment.',
        actionHint: 'POST to /api/driver-pay/assignments/{id}/corrections instead.',
      },
      { status: 422 },
    );
  }

  const { assignmentId } = await params;
  const prisma = await getTenantPrisma();

  // 4. Load assignment (tenant isolation enforced by getTenantPrisma)
  const assignment = await prisma.loadDriverAssignment.findFirst({
    where: { id: assignmentId, deletedAt: null },
  });
  if (!assignment) {
    return NextResponse.json({ error: 'Assignment not found.' }, { status: 404 });
  }

  // 5. Load components
  const rawComponents = await prisma.loadPayComponent.findMany({
    where: { assignmentId, deletedAt: null },
  });

  const components: ComponentSnapshotForFsm[] = rawComponents.map((c) => ({
    componentType: c.componentType as string,
    category: c.category as string,
    originalComponentId: c.originalComponentId,
    grossAmount: c.grossAmount.toString(),
  }));

  // 6. Build snapshot for FSM
  const snapshot: AssignmentSnapshotForFsm = {
    payStatus: assignment.payStatus as PayStatus,
    paymentModel: toPaymentModel(assignment.payType as string),
    actualMiles: assignment.actualMiles?.toString() ?? null,
    mileageSource: assignment.mileageSource ?? null,
    loadRevenue: assignment.loadRevenue?.toString() ?? null,
    overrideReason: assignment.overrideReason,
    // isOverride: not stored in DB — infer as true when overrideReason is set
    isOverride: !!assignment.overrideReason,
    settlementId: assignment.settlementId ?? null,
  };

  // 7. Run state machine
  const result = canTransition(snapshot, body.action as TransitionAction, components);

  // 8. Pre-condition failure → 422
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason, actionHint: result.actionHint },
      { status: 422 },
    );
  }

  // 9. Dispute / reject require a reason
  if (body.action === 'dispute' || body.action === 'reject') {
    if (!body.reason || body.reason.trim().length < 10) {
      return NextResponse.json({ error: 'A reason is required.' }, { status: 422 });
    }
  }

  // 10. Atomic transaction: status update + audit log
  const prev = assignment.payStatus as PayStatus;
  const next = result.nextStatus;

  const ipAddress =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    null;

  // Build update data — only include fields that exist on LoadDriverAssignment
  const updateData: Record<string, unknown> = { payStatus: next };
  if (body.action === 'approve') {
    updateData.approvedAt = new Date();
    updateData.approvedBy = session.userId;
  }

  const [updated] = await prisma.$transaction([
    prisma.loadDriverAssignment.update({
      where: { id: assignmentId },
      data: updateData,
    }),
    prisma.driverPayAuditLog.create({
      data: {
        tenantId: assignment.tenantId,
        entityType: 'LoadDriverAssignment',
        entityId: assignmentId,
        action: `status:${prev}->${next}`,
        previousValue: { status: prev },
        newValue: {
          status: next,
          reason: body.reason ?? null,
          actionLabel: TRANSITION_LABELS[body.action as TransitionAction],
        },
        actorId: session.userId,
        ipAddress,
        createdBy: session.userId,
      },
    }),
  ]);

  return NextResponse.json({ assignment: serializeAssignment(updated) });
}
