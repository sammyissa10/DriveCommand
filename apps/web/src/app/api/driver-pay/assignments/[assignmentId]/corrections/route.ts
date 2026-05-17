import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { UserRole } from '@/lib/auth/roles';
import { PayComponentType, PayComponentCategory, PayComponentUnit, Prisma } from '@/generated/prisma';
import Decimal from 'decimal.js';

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------

function serializeComponent(c: {
  id: string;
  tenantId: string;
  assignmentId: string;
  loadId: string;
  driverId: string;
  stopId: string | null;
  componentType: string;
  category: string;
  description: string;
  quantity: Prisma.Decimal;
  unit: string;
  rate: Prisma.Decimal;
  multiplier: Prisma.Decimal;
  grossAmount: Prisma.Decimal;
  isTaxable: boolean;
  isReimbursement: boolean;
  originalComponentId: string | null;
  visibleToDriver: boolean;
  notes: string | null;
  enteredBy: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  deletedAt: Date | null;
}) {
  return {
    id: c.id,
    tenantId: c.tenantId,
    assignmentId: c.assignmentId,
    loadId: c.loadId,
    driverId: c.driverId,
    stopId: c.stopId,
    componentType: c.componentType,
    category: c.category,
    description: c.description,
    quantity: c.quantity.toString(),
    unit: c.unit,
    rate: c.rate.toString(),
    multiplier: c.multiplier.toString(),
    grossAmount: c.grossAmount.toString(),
    isTaxable: c.isTaxable,
    isReimbursement: c.isReimbursement,
    originalComponentId: c.originalComponentId,
    visibleToDriver: c.visibleToDriver,
    notes: c.notes,
    enteredBy: c.enteredBy,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    createdBy: c.createdBy,
    deletedAt: c.deletedAt?.toISOString() ?? null,
  };
}

function serializeAssignment(a: {
  id: string;
  tenantId: string;
  loadId: string;
  driverId: string;
  payStatus: string;
  payType: string;
  baseRate: Prisma.Decimal;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}) {
  return {
    id: a.id,
    tenantId: a.tenantId,
    loadId: a.loadId,
    driverId: a.driverId,
    payStatus: a.payStatus,
    payType: a.payType,
    baseRate: a.baseRate.toString(),
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    deletedAt: a.deletedAt?.toISOString() ?? null,
  };
}

// ---------------------------------------------------------------------------
// Body schema
// ---------------------------------------------------------------------------

const BodySchema = z.object({
  originalComponentId: z.string().uuid().nullable().optional(),
  reason: z.string().min(10, 'Reason must be at least 10 characters.').max(2000),
  amount: z
    .string()
    .refine(
      (v) => {
        try {
          return !new Decimal(v).isZero();
        } catch {
          return false;
        }
      },
      { message: 'Amount must be a non-zero number.' },
    ),
  type: z.enum(['POSITIVE', 'NEGATIVE']),
});

// ---------------------------------------------------------------------------
// POST /api/driver-pay/assignments/[assignmentId]/corrections
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

  // 3. RBAC — drivers cannot create corrections
  const role: string = session.role;
  const isDriver = role === 'driver' || role === UserRole.DRIVER;
  if (isDriver) {
    return NextResponse.json(
      { error: 'Drivers cannot create corrections.' },
      { status: 403 },
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

  // 5. Validate state — only PAID or CORRECTED can be corrected
  if (!['PAID', 'CORRECTED'].includes(assignment.payStatus as string)) {
    return NextResponse.json(
      {
        error: 'Cannot correct an assignment that has not been paid yet.',
        actionHint: 'Only paid assignments can be corrected.',
      },
      { status: 422 },
    );
  }

  // 6. Validate originalComponentId belongs to this assignment (if provided)
  if (body.originalComponentId) {
    const original = await prisma.loadPayComponent.findFirst({
      where: {
        id: body.originalComponentId,
        assignmentId,
        deletedAt: null,
      },
    });
    if (!original) {
      return NextResponse.json(
        { error: 'Original component not found on this assignment.' },
        { status: 422 },
      );
    }
  }

  // 7. Compute signed amount + componentType
  // User enters a positive number; type determines the sign
  const inputAmount = new Decimal(body.amount).abs();
  const signedAmount =
    body.type === 'POSITIVE' ? inputAmount : inputAmount.neg();
  const componentType: PayComponentType =
    body.type === 'POSITIVE' ? 'ADJUSTMENT_POSITIVE' : 'ADJUSTMENT_NEGATIVE';

  // 8. Transaction — create component + update status + audit log
  const prevStatus = assignment.payStatus as string;
  const nextStatus = 'CORRECTED';
  const ipAddress =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

  const [component, updatedAssignment] = await prisma.$transaction([
    prisma.loadPayComponent.create({
      data: {
        tenantId: assignment.tenantId,
        assignmentId,
        loadId: assignment.loadId,
        driverId: assignment.driverId,
        stopId: null,
        componentType,
        category: 'ADJUSTMENT' as PayComponentCategory,
        description: `Correction: ${body.reason}`.slice(0, 255),
        quantity: new Decimal(1),
        unit: 'FLAT' as PayComponentUnit,
        rate: signedAmount,
        multiplier: new Decimal(1),
        grossAmount: signedAmount,
        isTaxable: true,
        isReimbursement: false,
        visibleToDriver: true,
        notes: body.reason,
        originalComponentId: body.originalComponentId ?? null,
        enteredBy: session.userId,
        createdBy: session.userId,
      },
    }),
    prisma.loadDriverAssignment.update({
      where: { id: assignmentId },
      data: { payStatus: nextStatus },
    }),
    prisma.driverPayAuditLog.create({
      data: {
        tenantId: assignment.tenantId,
        entityType: 'LoadDriverAssignment',
        entityId: assignmentId,
        action: `correction:${prevStatus}->${nextStatus}`,
        previousValue: { status: prevStatus },
        newValue: {
          status: nextStatus,
          componentType,
          amount: signedAmount.toString(),
          originalComponentId: body.originalComponentId ?? null,
          reason: body.reason,
        },
        actorId: session.userId,
        ipAddress,
        createdBy: session.userId,
      },
    }),
  ]);

  return NextResponse.json(
    {
      component: serializeComponent(component),
      assignment: serializeAssignment(updatedAssignment),
    },
    { status: 201 },
  );
}
