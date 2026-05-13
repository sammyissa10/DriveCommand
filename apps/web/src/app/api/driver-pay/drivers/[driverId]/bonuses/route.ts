import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { Prisma, BonusType } from '@/generated/prisma';
import Decimal from 'decimal.js';
import { scheduleInstallments } from '@/lib/driver-pay/installment-scheduler';
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
  createdBy: string;
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
// Zod schema for POST
// ---------------------------------------------------------------------------

const CreateBonusSchema = z.object({
  bonusType: z.enum([
    'SIGN_ON',
    'RETENTION',
    'SAFETY',
    'FUEL_EFFICIENCY',
    'REFERRAL',
    'PERFORMANCE',
    'OTHER',
  ]),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'amount must be a valid decimal'),
  description: z.string().min(1).max(255),
  triggerDate: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  scheduledPayDate: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .nullable()
    .optional(),
  totalInstallments: z.number().int().min(2).optional(),
  intervalDays: z.number().int().positive().optional(),
  referredDriverId: z.string().uuid().nullable().optional(),
  isTaxable: z.boolean().optional().default(true),
  visibleToDriver: z.boolean().optional().default(true),
  notes: z.string().nullable().optional(),
});

// ---------------------------------------------------------------------------
// GET — list bonuses for a driver
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

  const driver = await prisma.carrierDriver.findFirst({
    where: { id: driverId },
  });
  if (!driver) {
    return NextResponse.json({ error: 'Driver not found.' }, { status: 404 });
  }

  const rows = await prisma.driverBonus.findMany({
    where: { driverId, deletedAt: null },
    orderBy: { triggerDate: 'desc' },
  });

  return NextResponse.json({ bonuses: rows.map(serializeBonus) });
}

// ---------------------------------------------------------------------------
// POST — create bonus (single or multi-installment)
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

  const parsed = CreateBonusSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Validation error.' },
      { status: 400 },
    );
  }
  const body = parsed.data;

  // REFERRAL validation — both directions
  if (body.bonusType === 'REFERRAL' && !body.referredDriverId) {
    return NextResponse.json(
      { error: 'Referral bonus requires referredDriverId.' },
      { status: 422 },
    );
  }
  if (body.bonusType !== 'REFERRAL' && body.referredDriverId) {
    return NextResponse.json(
      { error: 'referredDriverId is only allowed for REFERRAL bonuses.' },
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

  const triggerDate = new Date(body.triggerDate);
  const scheduledPayDate = body.scheduledPayDate ? new Date(body.scheduledPayDate) : null;

  // Multi-installment flow
  if (body.totalInstallments !== undefined && body.totalInstallments >= 2) {
    if (!body.intervalDays) {
      return NextResponse.json(
        { error: 'intervalDays is required when totalInstallments is set.' },
        { status: 400 },
      );
    }

    const startDate = scheduledPayDate ?? triggerDate;
    const installments = scheduleInstallments({
      totalAmount: new Decimal(body.amount),
      count: body.totalInstallments,
      startDate,
      intervalDays: body.intervalDays,
    });

    // Create parent first, then children in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create parent (installment 1)
      const parent = await tx.driverBonus.create({
        data: {
          tenantId: driver.orgId,
          driverId,
          bonusType: body.bonusType as BonusType,
          amount: installments[0].amount,
          description: body.description,
          triggerDate,
          scheduledPayDate: installments[0].scheduledPayDate,
          installmentNumber: 1,
          totalInstallments: body.totalInstallments,
          parentBonusId: null,
          referredDriverId: body.referredDriverId ?? null,
          isTaxable: body.isTaxable ?? true,
          visibleToDriver: body.visibleToDriver ?? true,
          notes: body.notes ?? null,
          createdBy: session.userId,
        },
      });

      // Create children (installments 2..N)
      const children = [];
      for (let i = 1; i < installments.length; i++) {
        const child = await tx.driverBonus.create({
          data: {
            tenantId: driver.orgId,
            driverId,
            bonusType: body.bonusType as BonusType,
            amount: installments[i].amount,
            description: body.description,
            triggerDate,
            scheduledPayDate: installments[i].scheduledPayDate,
            installmentNumber: installments[i].installmentNumber,
            totalInstallments: body.totalInstallments,
            parentBonusId: parent.id,
            referredDriverId: body.referredDriverId ?? null,
            isTaxable: body.isTaxable ?? true,
            visibleToDriver: body.visibleToDriver ?? true,
            notes: body.notes ?? null,
            createdBy: session.userId,
          },
        });
        children.push(child);
      }

      return { parent, children };
    });

    return NextResponse.json(
      {
        bonus: serializeBonus(result.parent),
        installments: result.children.map(serializeBonus),
      },
      { status: 201 },
    );
  }

  // Single bonus
  const bonus = await prisma.driverBonus.create({
    data: {
      tenantId: driver.orgId,
      driverId,
      bonusType: body.bonusType as BonusType,
      amount: new Decimal(body.amount),
      description: body.description,
      triggerDate,
      scheduledPayDate,
      installmentNumber: null,
      totalInstallments: null,
      parentBonusId: null,
      referredDriverId: body.referredDriverId ?? null,
      isTaxable: body.isTaxable ?? true,
      visibleToDriver: body.visibleToDriver ?? true,
      notes: body.notes ?? null,
      createdBy: session.userId,
    },
  });

  return NextResponse.json({ bonus: serializeBonus(bonus) }, { status: 201 });
}
