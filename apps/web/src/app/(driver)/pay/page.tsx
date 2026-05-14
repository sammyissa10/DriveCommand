import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { UserRole } from '@/lib/auth/roles';
import { DriverPayPage } from './_components/DriverPayPage';
import type { PrismaClient } from '@/generated/prisma';

export default async function Page() {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  if (session.role.toUpperCase() !== UserRole.DRIVER) redirect('/');

  const prisma = await getTenantPrisma() as unknown as PrismaClient;

  const driver = await prisma.carrierDriver.findFirst({
    where: { userId: session.userId },
  });

  if (!driver) redirect('/driver/home');

  const [settlements, currentPeriod, bonuses, deductions] = await Promise.all([
    prisma.driverSettlement.findMany({
      where: {
        driverId: driver.id,
        tenantId: session.tenantId,
        status: { not: 'DRAFT' },
        deletedAt: null,
      },
      orderBy: { periodStart: 'desc' },
      take: 20,
    }),
    prisma.loadDriverAssignment.findMany({
      where: {
        driverId: driver.id,
        tenantId: session.tenantId,
        payStatus: { in: ['PENDING_REVIEW', 'APPROVED'] },
        settlementId: null,
        deletedAt: null,
      },
      include: {
        payComponents: { where: { visibleToDriver: true, deletedAt: null } },
        load: { select: { id: true, referenceNumber: true, status: true } },
      },
    }),
    prisma.driverBonus.findMany({
      where: {
        driverId: driver.id,
        tenantId: session.tenantId,
        visibleToDriver: true,
        deletedAt: null,
      },
      orderBy: { triggerDate: 'desc' },
    }),
    prisma.driverDeduction.findMany({
      where: {
        driverId: driver.id,
        tenantId: session.tenantId,
        deletedAt: null,
        visibleToDriver: true,
      },
    }),
  ]);

  // Serialize Prisma Decimal values to strings for client component (JSON-safe)
  const serializedSettlements = settlements.map((s) => ({
    ...s,
    grossTaxable: s.grossTaxable.toString(),
    grossNonTaxable: s.grossNonTaxable.toString(),
    totalDeductions: s.totalDeductions.toString(),
    netPay: s.netPay.toString(),
    periodStart: s.periodStart.toISOString(),
    periodEnd: s.periodEnd.toISOString(),
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    finalizedAt: s.finalizedAt?.toISOString() ?? null,
    paidAt: s.paidAt?.toISOString() ?? null,
  }));

  const serializedCurrentPeriod = currentPeriod.map((a) => ({
    ...a,
    approvedAt: a.approvedAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    payComponents: a.payComponents.map((c) => ({
      ...c,
      grossAmount: c.grossAmount.toString(),
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
  }));

  const serializedBonuses = bonuses.map((b) => ({
    ...b,
    amount: b.amount.toString(),
    triggerDate: b.triggerDate.toISOString(),
    scheduledPayDate: b.scheduledPayDate?.toISOString() ?? null,
    paidAt: b.paidAt?.toISOString() ?? null,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  }));

  const serializedDeductions = deductions.map((d) => ({
    ...d,
    amountPerPeriod: d.amountPerPeriod?.toString() ?? null,
    totalAmount: d.totalAmount?.toString() ?? null,
    amountCollected: d.amountCollected?.toString() ?? null,
    maxPercentageOfNet: d.maxPercentageOfNet?.toString() ?? null,
    startsOn: d.startsOn.toISOString(),
    endsOn: d.endsOn?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  }));

  return (
    <DriverPayPage
      driverName={`${driver.firstName} ${driver.lastName}`}
      payModel={driver.payModel}
      settlements={serializedSettlements}
      currentPeriod={serializedCurrentPeriod}
      bonuses={serializedBonuses}
      deductions={serializedDeductions}
    />
  );
}
