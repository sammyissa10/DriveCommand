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
// Zod schemas
// ---------------------------------------------------------------------------

const UpdateDeductionSchema = z.object({
  deductionType: z
    .enum([
      'ADVANCE',
      'ESCROW',
      'GARNISHMENT',
      'CHILD_SUPPORT',
      'EQUIPMENT_LEASE',
      'INSURANCE',
      'OTHER',
    ])
    .optional(),
  schedule: z.enum(['ONE_TIME', 'EVERY_SETTLEMENT', 'FIXED_INSTALLMENTS']).optional(),
  amountPerPeriod: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'amountPerPeriod must be a valid decimal')
    .optional(),
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
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .optional(),
  endsOn: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .nullable()
    .optional(),
  visibleToDriver: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

const PauseSchema = z.object({
  paused: z.boolean(),
});

// ---------------------------------------------------------------------------
// PUT — update deduction (OWNER+)
// ---------------------------------------------------------------------------

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ driverId: string; deductionId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isOwnerOrAbove(session.role)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const { driverId, deductionId } = await params;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = UpdateDeductionSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Validation error.' },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const prisma = await getTenantPrisma();

  // Verify driver exists in this tenant
  const driver = await prisma.carrierDriver.findFirst({
    where: { id: driverId },
  });
  if (!driver) {
    return NextResponse.json({ error: 'Driver not found.' }, { status: 404 });
  }

  // Look up deduction scoped to this driver
  const existing = await prisma.driverDeduction.findFirst({
    where: { id: deductionId, driverId, deletedAt: null },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Deduction not found.' }, { status: 404 });
  }

  // Determine effective values for cross-field validation
  const effectiveSchedule = body.schedule ?? existing.schedule;
  const effectiveTotalAmount =
    body.totalAmount !== undefined
      ? body.totalAmount
      : existing.totalAmount
      ? existing.totalAmount.toString()
      : null;

  // FIXED_INSTALLMENTS requires totalAmount
  if (effectiveSchedule === 'FIXED_INSTALLMENTS' && !effectiveTotalAmount) {
    return NextResponse.json(
      { error: 'FIXED_INSTALLMENTS requires totalAmount.' },
      { status: 422 },
    );
  }

  // Federal garnishment cap
  if (body.maxPercentageOfNet) {
    const pct = new Decimal(body.maxPercentageOfNet);
    if (pct.greaterThan(50)) {
      return NextResponse.json(
        { error: 'maxPercentageOfNet cannot exceed 50% (federal garnishment cap).' },
        { status: 422 },
      );
    }
  }

  // Date range validation
  const effectiveStartsOn = body.startsOn ? new Date(body.startsOn) : existing.startsOn;
  const effectiveEndsOn =
    body.endsOn !== undefined
      ? body.endsOn
        ? new Date(body.endsOn)
        : null
      : existing.endsOn;

  if (effectiveStartsOn && effectiveEndsOn && effectiveStartsOn > effectiveEndsOn) {
    return NextResponse.json(
      { error: 'startsOn must be on or before endsOn.' },
      { status: 422 },
    );
  }

  // Build update payload — unchecked form
  const updateData: Prisma.DriverDeductionUncheckedUpdateInput = {};
  if (body.deductionType !== undefined) updateData.deductionType = body.deductionType as DeductionType;
  if (body.schedule !== undefined) updateData.schedule = body.schedule as DeductionSchedule;
  if (body.amountPerPeriod !== undefined) updateData.amountPerPeriod = new Decimal(body.amountPerPeriod);
  if (body.totalAmount !== undefined)
    updateData.totalAmount = body.totalAmount ? new Decimal(body.totalAmount) : null;
  if (body.maxPercentageOfNet !== undefined)
    updateData.maxPercentageOfNet = body.maxPercentageOfNet
      ? new Decimal(body.maxPercentageOfNet)
      : null;
  if (body.startsOn !== undefined) updateData.startsOn = new Date(body.startsOn);
  if (body.endsOn !== undefined) updateData.endsOn = body.endsOn ? new Date(body.endsOn) : null;
  if (body.visibleToDriver !== undefined) updateData.visibleToDriver = body.visibleToDriver;
  if (body.notes !== undefined) updateData.notes = body.notes ?? null;

  const updated = await prisma.driverDeduction.update({
    where: { id: deductionId },
    data: updateData,
  });

  return NextResponse.json({ deduction: serializeDeduction(updated) });
}

// ---------------------------------------------------------------------------
// PATCH — pause/unpause deduction (MANAGER+)
// ---------------------------------------------------------------------------

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ driverId: string; deductionId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isManagerOrAbove(session.role)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const { driverId, deductionId } = await params;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = PauseSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Validation error.' },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const prisma = await getTenantPrisma();

  // Verify driver exists in this tenant
  const driver = await prisma.carrierDriver.findFirst({
    where: { id: driverId },
  });
  if (!driver) {
    return NextResponse.json({ error: 'Driver not found.' }, { status: 404 });
  }

  // Look up deduction scoped to this driver
  const existing = await prisma.driverDeduction.findFirst({
    where: { id: deductionId, driverId, deletedAt: null },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Deduction not found.' }, { status: 404 });
  }

  const updated = await prisma.driverDeduction.update({
    where: { id: deductionId },
    data: { paused: body.paused },
  });

  return NextResponse.json({ deduction: serializeDeduction(updated) });
}
