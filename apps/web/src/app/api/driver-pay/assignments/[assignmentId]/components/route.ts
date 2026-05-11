import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { Prisma, PayComponentType, PayComponentCategory, PayComponentUnit } from '@/generated/prisma';
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
// Input schema for POST
// ---------------------------------------------------------------------------

const CreateComponentSchema = z.object({
  componentType: z.string(),
  category: z.string(),
  description: z.string().min(1).max(255),
  quantity: z.string(),
  unit: z.string(),
  rate: z.string(),
  multiplier: z.string().optional().default('1.0'),
  isTaxable: z.boolean().optional().default(true),
  isReimbursement: z.boolean().optional().default(false),
  visibleToDriver: z.boolean().optional().default(true),
  notes: z.string().nullable().optional(),
  stopId: z.string().uuid().nullable().optional(),
  // Optional fields for gross_amount computation
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
// GET — list components
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { assignmentId } = await params;
  const prisma = await getTenantPrisma();

  const assignment = await prisma.loadDriverAssignment.findFirst({
    where: { id: assignmentId, deletedAt: null },
  });
  if (!assignment) {
    return NextResponse.json({ error: 'Assignment not found.' }, { status: 404 });
  }

  const role: string = session.role;
  const isDriver = role === 'driver' || role === 'DRIVER';

  if (isDriver) {
    if (assignment.driverId !== session.userId) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }
  }

  const where: Prisma.LoadPayComponentWhereInput = {
    assignmentId,
    deletedAt: null,
    ...(isDriver ? { visibleToDriver: true } : {}),
  };

  const rows = await prisma.loadPayComponent.findMany({
    where,
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ components: rows.map(serializeComponent) });
}

// ---------------------------------------------------------------------------
// POST — create component
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { assignmentId } = await params;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = CreateComponentSchema.safeParse(rawBody);
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
      { error: 'Cannot add components to a paid assignment.' },
      { status: 409 },
    );
  }

  const role: string = session.role;
  const isDriver = role === 'driver' || role === 'DRIVER';

  // Role guard for drivers
  if (isDriver) {
    if (assignment.driverId !== session.userId) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }
    if (body.category !== 'REIMBURSEMENT') {
      return NextResponse.json(
        { error: 'Drivers may only add reimbursement components.' },
        { status: 403 },
      );
    }
  }

  // Category enforcement
  let negateGross = false;
  let enforcedIsTaxable = body.isTaxable ?? true;
  let enforcedIsReimbursement = body.isReimbursement ?? false;

  if (body.category === 'DEDUCTION') {
    negateGross = true;
    // isTaxable keeps client value
  } else if (body.category === 'REIMBURSEMENT') {
    enforcedIsTaxable = false;
    enforcedIsReimbursement = true;
  } else if (body.category === 'ALLOWANCE' && body.componentType === 'PER_DIEM') {
    enforcedIsTaxable = false;
  }

  // Server recompute gross_amount
  const grossAmount = computeGrossAmount({
    componentType: body.componentType,
    quantity: new Decimal(body.quantity),
    rate: new Decimal(body.rate),
    multiplier: new Decimal(body.multiplier ?? '1.0'),
    loadRevenue: body.loadRevenue ? new Decimal(body.loadRevenue) : undefined,
    arrivedAt: body.arrivedAt ? new Date(body.arrivedAt) : undefined,
    departedAt: body.departedAt ? new Date(body.departedAt) : undefined,
    freeTimeMinutes: body.freeTimeMinutes,
    weeklyHours: body.weeklyHours ? new Decimal(body.weeklyHours) : undefined,
    dailyHours: body.dailyHours ? new Decimal(body.dailyHours) : undefined,
    dailyThreshold: body.dailyThreshold ? new Decimal(body.dailyThreshold) : undefined,
    otMultiplier: body.otMultiplier ? new Decimal(body.otMultiplier) : undefined,
  });
  const finalGross = negateGross ? grossAmount.neg() : grossAmount;

  const component = await prisma.loadPayComponent.create({
    data: {
      tenantId: assignment.tenantId,
      assignmentId,
      loadId: assignment.loadId,
      driverId: assignment.driverId,
      stopId: body.stopId ?? null,
      componentType: body.componentType as PayComponentType,
      category: body.category as PayComponentCategory,
      description: body.description,
      quantity: new Decimal(body.quantity),
      unit: body.unit as PayComponentUnit,
      rate: new Decimal(body.rate),
      multiplier: new Decimal(body.multiplier ?? '1.0'),
      grossAmount: finalGross,
      isTaxable: enforcedIsTaxable,
      isReimbursement: enforcedIsReimbursement,
      visibleToDriver: body.visibleToDriver ?? true,
      notes: body.notes ?? null,
      enteredBy: session.userId,
      createdBy: session.userId,
    },
  });

  return NextResponse.json({ component: serializeComponent(component) }, { status: 201 });
}
