import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { UserRole } from '@/lib/auth/roles';
import { DriverSettlementDetailView } from './_components/DriverSettlementDetailView';
import { AuditTrailFooter } from '@/components/audit-trail-footer';
import type { PrismaClient } from '@/generated/prisma';

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await getSession();
  if (!session) redirect('/sign-in');
  if (session.role.toUpperCase() !== UserRole.DRIVER) redirect('/');

  const prisma = await getTenantPrisma() as unknown as PrismaClient;

  const driver = await prisma.carrierDriver.findFirst({
    where: { userId: session.userId },
  });

  if (!driver) redirect('/driver/home');

  const settlement = await prisma.driverSettlement.findFirst({
    where: { id, driverId: driver.id, tenantId: session.tenantId },
    include: {
      assignments: {
        include: {
          payComponents: { where: { visibleToDriver: true, deletedAt: null } },
          load: { select: { id: true, referenceNumber: true, status: true } },
        },
      },
      bonuses: { where: { deletedAt: null, visibleToDriver: true } },
      creator: { select: { firstName: true, lastName: true, email: true } },
      updater: { select: { firstName: true, lastName: true, email: true } },
    },
  });

  if (!settlement) notFound();

  // Serialize for client component
  const serialized = {
    id: settlement.id,
    status: settlement.status,
    settlementReference: settlement.settlementReference,
    periodStart: settlement.periodStart.toISOString(),
    periodEnd: settlement.periodEnd.toISOString(),
    grossTaxable: settlement.grossTaxable.toString(),
    grossNonTaxable: settlement.grossNonTaxable.toString(),
    totalDeductions: settlement.totalDeductions.toString(),
    netPay: settlement.netPay.toString(),
    pdfUrl: settlement.pdfUrl,
    finalizedAt: settlement.finalizedAt?.toISOString() ?? null,
    paidAt: settlement.paidAt?.toISOString() ?? null,
    assignments: settlement.assignments.map((a) => ({
      id: a.id,
      loadId: a.loadId,
      payStatus: a.payStatus,
      approvedAt: a.approvedAt?.toISOString() ?? null,
      load: a.load ?? null,
      payComponents: a.payComponents.map((c) => ({
        id: c.id,
        componentType: c.componentType,
        category: c.category,
        description: c.description,
        grossAmount: c.grossAmount.toString(),
        isTaxable: c.isTaxable,
        isReimbursement: c.isReimbursement,
      })),
    })),
    bonuses: settlement.bonuses.map((b) => ({
      id: b.id,
      bonusType: b.bonusType,
      amount: b.amount.toString(),
      description: b.description,
      isTaxable: b.isTaxable,
      scheduledPayDate: b.scheduledPayDate?.toISOString() ?? null,
      paidAt: b.paidAt?.toISOString() ?? null,
      installmentNumber: b.installmentNumber,
      totalInstallments: b.totalInstallments,
    })),
  };

  return (
    <>
      <DriverSettlementDetailView settlement={serialized} />
      <AuditTrailFooter
        createdAt={settlement.createdAt}
        createdByName={settlement.creator ? `${settlement.creator.firstName ?? ''} ${settlement.creator.lastName ?? ''}`.trim() || null : null}
        createdByEmail={settlement.creator?.email ?? null}
        updatedAt={settlement.updatedAt}
        updatedByName={settlement.updater ? `${settlement.updater.firstName ?? ''} ${settlement.updater.lastName ?? ''}`.trim() || null : null}
        updatedByEmail={settlement.updater?.email ?? null}
      />
    </>
  );
}
