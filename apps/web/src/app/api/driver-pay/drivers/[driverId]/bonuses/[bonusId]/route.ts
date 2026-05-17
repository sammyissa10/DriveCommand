import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { Prisma } from '@/generated/prisma';
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

function serializeBonus(b: {
  id: string;
  tenantId: string;
  driverId: string;
  bonusType: string;
  amount: Prisma.Decimal;
  description: string;
  triggerDate: Date;
  scheduledPayDate: Date | null;
  paidAt: Date | null;
  installmentNumber: number | null;
  totalInstallments: number | null;
  parentBonusId: string | null;
  referredDriverId: string | null;
  settlementId: string | null;
  isTaxable: boolean;
  visibleToDriver: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  deletedAt: Date | null;
}) {
  return {
    id: b.id,
    tenantId: b.tenantId,
    driverId: b.driverId,
    bonusType: b.bonusType,
    amount: b.amount.toString(),
    description: b.description,
    triggerDate: b.triggerDate.toISOString(),
    scheduledPayDate: b.scheduledPayDate ? b.scheduledPayDate.toISOString() : null,
    paidAt: b.paidAt ? b.paidAt.toISOString() : null,
    installmentNumber: b.installmentNumber,
    totalInstallments: b.totalInstallments,
    parentBonusId: b.parentBonusId,
    referredDriverId: b.referredDriverId,
    settlementId: b.settlementId,
    isTaxable: b.isTaxable,
    visibleToDriver: b.visibleToDriver,
    notes: b.notes,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
    createdBy: b.createdBy,
    deletedAt: b.deletedAt ? b.deletedAt.toISOString() : null,
  };
}

// ---------------------------------------------------------------------------
// Zod schema for PUT (all fields optional)
// ---------------------------------------------------------------------------

const UpdateBonusSchema = z.object({
  bonusType: z
    .enum([
      'SIGN_ON',
      'RETENTION',
      'SAFETY',
      'FUEL_EFFICIENCY',
      'REFERRAL',
      'PERFORMANCE',
      'OTHER',
    ])
    .optional(),
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'amount must be a valid decimal')
    .optional(),
  description: z.string().min(1).max(255).optional(),
  triggerDate: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .optional(),
  scheduledPayDate: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .nullable()
    .optional(),
  referredDriverId: z.string().uuid().nullable().optional(),
  isTaxable: z.boolean().optional(),
  visibleToDriver: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

// ---------------------------------------------------------------------------
// PUT — update bonus (OWNER+)
// ---------------------------------------------------------------------------

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ driverId: string; bonusId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isOwnerOrAbove(session.role)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const { driverId, bonusId } = await params;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = UpdateBonusSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Validation error.' },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const prisma = await getTenantPrisma();

  // Verify driver exists in this tenant (RLS scopes to current tenant)
  const driver = await prisma.carrierDriver.findFirst({
    where: { id: driverId },
  });
  if (!driver) {
    return NextResponse.json({ error: 'Driver not found.' }, { status: 404 });
  }

  // Look up bonus scoped to this driver
  const existing = await prisma.driverBonus.findFirst({
    where: { id: bonusId, driverId, deletedAt: null },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Bonus not found.' }, { status: 404 });
  }

  // Reject if already paid
  if (existing.paidAt !== null) {
    return NextResponse.json({ error: 'Cannot edit a paid bonus.' }, { status: 409 });
  }

  // Determine effective bonusType (after merge)
  const effectiveBonusType = body.bonusType ?? existing.bonusType;
  const effectiveReferredDriverId =
    body.referredDriverId !== undefined ? body.referredDriverId : existing.referredDriverId;

  // REFERRAL validation both directions
  if (effectiveBonusType === 'REFERRAL' && !effectiveReferredDriverId) {
    return NextResponse.json(
      { error: 'Referral bonus requires referredDriverId.' },
      { status: 422 },
    );
  }
  if (effectiveBonusType !== 'REFERRAL' && effectiveReferredDriverId) {
    return NextResponse.json(
      { error: 'referredDriverId is only allowed for REFERRAL bonuses.' },
      { status: 422 },
    );
  }

  // Build update payload — only provided fields (use unchecked form for direct FK strings)
  const updateData: Prisma.DriverBonusUncheckedUpdateInput = {};
  if (body.bonusType !== undefined) updateData.bonusType = body.bonusType;
  if (body.amount !== undefined) updateData.amount = new Decimal(body.amount);
  if (body.description !== undefined) updateData.description = body.description;
  if (body.triggerDate !== undefined) updateData.triggerDate = new Date(body.triggerDate);
  if (body.scheduledPayDate !== undefined)
    updateData.scheduledPayDate = body.scheduledPayDate ? new Date(body.scheduledPayDate) : null;
  if (body.referredDriverId !== undefined)
    updateData.referredDriverId = body.referredDriverId ?? null;
  if (body.isTaxable !== undefined) updateData.isTaxable = body.isTaxable;
  if (body.visibleToDriver !== undefined) updateData.visibleToDriver = body.visibleToDriver;
  if (body.notes !== undefined) updateData.notes = body.notes ?? null;

  const updated = await prisma.driverBonus.update({
    where: { id: bonusId },
    data: updateData,
  });

  return NextResponse.json({ bonus: serializeBonus(updated) });
}

// ---------------------------------------------------------------------------
// PATCH — mark bonus as paid (MANAGER+)
// ---------------------------------------------------------------------------

const MarkPaidSchema = z.object({
  paidAt: z.string().datetime({ offset: true }).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ driverId: string; bonusId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isManagerOrAbove(session.role)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const { driverId, bonusId } = await params;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }

  const parsed = MarkPaidSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Validation error.' },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const prisma = await getTenantPrisma();

  // Verify driver exists in this tenant (RLS scopes to current tenant)
  const driver = await prisma.carrierDriver.findFirst({
    where: { id: driverId },
  });
  if (!driver) {
    return NextResponse.json({ error: 'Driver not found.' }, { status: 404 });
  }

  // Look up bonus scoped to this driver
  const existing = await prisma.driverBonus.findFirst({
    where: { id: bonusId, driverId, deletedAt: null },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Bonus not found.' }, { status: 404 });
  }

  if (existing.paidAt !== null) {
    return NextResponse.json({ error: 'Bonus is already marked as paid.' }, { status: 409 });
  }

  const parsedPaidAt = body.paidAt ? new Date(body.paidAt) : new Date();

  const updated = await prisma.driverBonus.update({
    where: { id: bonusId },
    data: { paidAt: parsedPaidAt },
  });

  return NextResponse.json({ bonus: serializeBonus(updated) });
}
