import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { Prisma } from '@/generated/prisma';
import { computeGrossAmount } from '@/lib/driver-pay/calculator';
import Decimal from 'decimal.js';

// ---------------------------------------------------------------------------
// Serializer
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
  createdBy: string;
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
    deletedAt: c.deletedAt ? c.deletedAt.toISOString() : null,
  };
}

// ---------------------------------------------------------------------------
// Input schema for PATCH
// ---------------------------------------------------------------------------

const UpdateComponentSchema = z.object({
  description: z.string().min(1).max(255).optional(),
  quantity: z.string().optional(),
  rate: z.string().optional(),
  multiplier: z.string().optional(),
  isTaxable: z.boolean().optional(),
  visibleToDriver: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  // Recompute inputs (optional)
  loadRevenue: z.string().optional(),
  arrivedAt: z.string().datetime().optional(),
  departedAt: z.string().datetime().optional(),
  freeTimeMinutes: z.number().int().optional(),
  weeklyHours: z.string().optional(),
  dailyHours: z.string().optional(),
  dailyThreshold: z.string().optional(),
  otMultiplier: z.string().optional(),
});

// ---------------------------------------------------------------------------
// PATCH — update component
// ---------------------------------------------------------------------------

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ assignmentId: string; componentId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const role: string = session.role;
  const isOwnerOrManager =
    role === 'owner' || role === 'OWNER' || role === 'manager' || role === 'MANAGER';
  if (!isOwnerOrManager) {
    return NextResponse.json({ error: 'Forbidden. Owner or manager role required.' }, { status: 403 });
  }

  const { assignmentId, componentId } = await params;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = UpdateComponentSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Validation error.' },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const prisma = await getTenantPrisma();

  const assignment = await prisma.loadDriverAssignment.findFirst({
    where: { id: assignmentId, deletedAt: null },
  });
  if (!assignment) {
    return NextResponse.json({ error: 'Assignment not found.' }, { status: 404 });
  }

  // PAID guard
  if ((assignment.payStatus as string) === 'PAID') {
    return NextResponse.json(
      { error: 'Cannot modify components of a paid assignment.' },
      { status: 409 },
    );
  }

  const component = await prisma.loadPayComponent.findFirst({
    where: { id: componentId, assignmentId, deletedAt: null },
  });
  if (!component) {
    return NextResponse.json({ error: 'Component not found.' }, { status: 404 });
  }

  // Build merged fields from existing + provided body fields
  const mergedDescription = body.description ?? component.description;
  const mergedQuantity = new Decimal(body.quantity ?? component.quantity.toString());
  const mergedRate = new Decimal(body.rate ?? component.rate.toString());
  const mergedMultiplier = new Decimal(body.multiplier ?? component.multiplier.toString());
  const mergedVisibleToDriver = body.visibleToDriver ?? component.visibleToDriver;
  const mergedNotes = body.notes !== undefined ? (body.notes ?? null) : component.notes;

  // Recompute grossAmount if numeric fields changed
  const numericChanged =
    body.quantity !== undefined ||
    body.rate !== undefined ||
    body.multiplier !== undefined ||
    body.arrivedAt !== undefined ||
    body.departedAt !== undefined ||
    body.loadRevenue !== undefined ||
    body.weeklyHours !== undefined ||
    body.dailyHours !== undefined;

  let finalGross: Decimal = component.grossAmount as unknown as Decimal;

  if (numericChanged) {
    const recomputed = computeGrossAmount({
      componentType: component.componentType as string,
      quantity: mergedQuantity,
      rate: mergedRate,
      multiplier: mergedMultiplier,
      loadRevenue: body.loadRevenue ? new Decimal(body.loadRevenue) : undefined,
      arrivedAt: body.arrivedAt ? new Date(body.arrivedAt) : undefined,
      departedAt: body.departedAt ? new Date(body.departedAt) : undefined,
      freeTimeMinutes: body.freeTimeMinutes,
      weeklyHours: body.weeklyHours ? new Decimal(body.weeklyHours) : undefined,
      dailyHours: body.dailyHours ? new Decimal(body.dailyHours) : undefined,
      dailyThreshold: body.dailyThreshold ? new Decimal(body.dailyThreshold) : undefined,
      otMultiplier: body.otMultiplier ? new Decimal(body.otMultiplier) : undefined,
    });

    // Re-apply category enforcement
    const category = component.category as string;
    finalGross = category === 'DEDUCTION' ? recomputed.neg() : recomputed;
  }

  // Enforce isTaxable for REIMBURSEMENT — cannot be overridden
  let mergedIsTaxable = body.isTaxable ?? component.isTaxable;
  if ((component.category as string) === 'REIMBURSEMENT') {
    mergedIsTaxable = false;
  }

  const updated = await prisma.loadPayComponent.update({
    where: { id: componentId },
    data: {
      description: mergedDescription,
      quantity: mergedQuantity,
      rate: mergedRate,
      multiplier: mergedMultiplier,
      grossAmount: finalGross,
      isTaxable: mergedIsTaxable,
      visibleToDriver: mergedVisibleToDriver,
      notes: mergedNotes,
    },
  });

  return NextResponse.json({ component: serializeComponent(updated) });
}

// ---------------------------------------------------------------------------
// DELETE — soft-delete component
// ---------------------------------------------------------------------------

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ assignmentId: string; componentId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const role: string = session.role;
  const isOwnerOrManager =
    role === 'owner' || role === 'OWNER' || role === 'manager' || role === 'MANAGER';
  if (!isOwnerOrManager) {
    return NextResponse.json({ error: 'Forbidden. Owner or manager role required.' }, { status: 403 });
  }

  const { assignmentId, componentId } = await params;
  const prisma = await getTenantPrisma();

  const assignment = await prisma.loadDriverAssignment.findFirst({
    where: { id: assignmentId, deletedAt: null },
  });
  if (!assignment) {
    return NextResponse.json({ error: 'Assignment not found.' }, { status: 404 });
  }

  // PAID guard
  if ((assignment.payStatus as string) === 'PAID') {
    return NextResponse.json(
      { error: 'Cannot delete components from a paid assignment.' },
      { status: 409 },
    );
  }

  // Belt-and-suspenders: allow soft-delete only in DRAFT or PENDING_REVIEW
  const status = assignment.payStatus as string;
  if (status !== 'DRAFT' && status !== 'PENDING_REVIEW') {
    return NextResponse.json(
      {
        error:
          'Components can only be deleted when the assignment is in DRAFT or PENDING_REVIEW status.',
      },
      { status: 409 },
    );
  }

  const component = await prisma.loadPayComponent.findFirst({
    where: { id: componentId, assignmentId, deletedAt: null },
  });
  if (!component) {
    return NextResponse.json({ error: 'Component not found.' }, { status: 404 });
  }

  await prisma.loadPayComponent.update({
    where: { id: componentId },
    data: { deletedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
