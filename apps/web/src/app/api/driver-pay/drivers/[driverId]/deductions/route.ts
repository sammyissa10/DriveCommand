import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { Prisma, DeductionType, DeductionSchedule } from '@/generated/prisma';
import Decimal from 'decimal.js';
import { UserRole } from '@/lib/auth/roles';

// ---------------------------------------------------------------------------
// RBAC helpers
// ---------------------------------------------------------------------------

function isManagerOrAbove(role: string): boolean {
  const r = role.toUpperCase();
  return r === UserRole.SYSTEM_ADMIN || r === UserRole.OWNER || r === UserRole.MANAGER;
}

function isOwnerOrAbove(role: string): boolean {
  const r = role.toUpperCase();
  return r === UserRole.SYSTEM_ADMIN || r === UserRole.OWNER;
}

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

function serializeDeduction(d: {
  id: string;
  tenantId: string;
  driverId: string;
  deductionType: string;
  schedule: string;
  amountPerPeriod: Prisma.Decimal;
  totalAmount: Prisma.Decimal | null;
  amountCollected: Prisma.Decimal;
  maxPercentageOfNet: Prisma.Decimal | null;
  startsOn: Date;
  endsOn: Date | null;
  paused: boolean;
  visibleToDriver: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  deletedAt: Date | null;
}) {
  return {
    id: d.id,
    tenantId: d.tenantId,
    driverId: d.driverId,
    deductionType: d.deductionType,
    schedule: d.schedule,
    amountPerPeriod: d.amountPerPeriod.toString(),
    totalAmount: d.totalAmount ? d.totalAmount.toString() : null,
    amountCollected: d.amountCollected.toString(),
    maxPercentageOfNet: d.maxPercentageOfNet ? d.maxPercentageOfNet.toString() : null,
    startsOn: d.startsOn.toISOString(),
    endsOn: d.endsOn ? d.endsOn.toISOString() : null,
    paused: d.paused,
    visibleToDriver: d.visibleToDriver,
    notes: d.notes,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
    createdBy: d.createdBy,
    deletedAt: d.deletedAt ? d.deletedAt.toISOString() : null,
  };
}

// ---------------------------------------------------------------------------
// Zod schema for POST
// ---------------------------------------------------------------------------

const CreateDeductionSchema = z.object({
  deductionType: z.enum([
    'ADVANCE',
    'ESCROW',
    'GARNISHMENT',
    'CHILD_SUPPORT',
    'EQUIPMENT_LEASE',
    'INSURANCE',
    'OTHER',
  ]),
  schedule: z.enum(['ONE_TIME', 'EVERY_SETTLEMENT', 'FIXED_INSTALLMENTS']),
  amountPerPeriod: z.string().regex(/^\d+(\.\d{1,2})?$/, 'amountPerPeriod must be a valid decimal'),
  totalAmount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'totalAmount must be a valid decimal')
    .nullable()
    .optional(),
  maxPercentageOfNet: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'maxPercentageOfNet must be a valid decimal')
    .nullable()
    .optional(),
  startsOn: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  endsOn: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .nullable()
    .optional(),
  visibleToDriver: z.boolean().optional().default(true),
  notes: z.string().nullable().optional(),
});

// ---------------------------------------------------------------------------
// GET — list deductions for a driver
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ driverId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isManagerOrAbove(session.role)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const { driverId } = await params;
  const prisma = await getTenantPrisma();

  // Verify driver exists in this tenant (RLS scopes query to tenant)
  const driver = await prisma.carrierDriver.findFirst({
    where: { id: driverId },
  });
  if (!driver) {
    return NextResponse.json({ error: 'Driver not found.' }, { status: 404 });
  }

  const rows = await prisma.driverDeduction.findMany({
    where: { driverId, deletedAt: null },
    orderBy: { startsOn: 'desc' },
  });

  return NextResponse.json({ deductions: rows.map(serializeDeduction) });
}

// ---------------------------------------------------------------------------
// POST — create deduction
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ driverId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isOwnerOrAbove(session.role)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const { driverId } = await params;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = CreateDeductionSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Validation error.' },
      { status: 400 },
    );
  }
  const body = parsed.data;

  // 1. Federal garnishment cap validation
  if (body.maxPercentageOfNet) {
    const pct = new Decimal(body.maxPercentageOfNet);
    if (pct.greaterThan(50)) {
      return NextResponse.json(
        { error: 'maxPercentageOfNet cannot exceed 50% (federal garnishment cap).' },
        { status: 422 },
      );
    }
  }

  // 2. Date range validation
  if (body.startsOn && body.endsOn) {
    const startsOn = new Date(body.startsOn);
    const endsOn = new Date(body.endsOn);
    if (startsOn > endsOn) {
      return NextResponse.json(
        { error: 'startsOn must be on or before endsOn.' },
        { status: 422 },
      );
    }
  }

  // 3. FIXED_INSTALLMENTS requires totalAmount
  if (body.schedule === 'FIXED_INSTALLMENTS' && !body.totalAmount) {
    return NextResponse.json(
      { error: 'FIXED_INSTALLMENTS requires totalAmount.' },
      { status: 422 },
    );
  }

  const prisma = await getTenantPrisma();

  const driver = await prisma.carrierDriver.findFirst({
    where: { id: driverId },
  });
  if (!driver) {
    return NextResponse.json({ error: 'Driver not found.' }, { status: 404 });
  }

  const deduction = await prisma.driverDeduction.create({
    data: {
      tenantId: driver.orgId,
      driverId,
      deductionType: body.deductionType as DeductionType,
      schedule: body.schedule as DeductionSchedule,
      amountPerPeriod: new Decimal(body.amountPerPeriod),
      totalAmount: body.totalAmount ? new Decimal(body.totalAmount) : null,
      amountCollected: new Decimal(0),
      maxPercentageOfNet: body.maxPercentageOfNet ? new Decimal(body.maxPercentageOfNet) : null,
      startsOn: new Date(body.startsOn),
      endsOn: body.endsOn ? new Date(body.endsOn) : null,
      paused: false,
      visibleToDriver: body.visibleToDriver ?? true,
      notes: body.notes ?? null,
      createdBy: session.userId,
    },
  });

  return NextResponse.json({ deduction: serializeDeduction(deduction) }, { status: 201 });
}
