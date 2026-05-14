/**
 * /carrier/driver-pay/settlements/[settlementId] — Settlement detail page (server component)
 */

import React from 'react';
import { redirect, notFound } from 'next/navigation';
import Decimal from 'decimal.js';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { UserRole } from '@/lib/auth/roles';
import { SettlementDetailView } from '../_components/SettlementDetailView';
import { computeFourWeekAverage, detectSettlementAnomaly } from '@/lib/driver-pay/settlement-anomaly';
import type { PrismaClient } from '@/generated/prisma';

export const metadata = { title: 'Settlement Detail | DriveCommand' };

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function SettlementDetailPage({
  params,
}: {
  params: Promise<{ settlementId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const role = session.role.toUpperCase();
  const isManagerOrAbove =
    role === UserRole.OWNER || role === UserRole.MANAGER || role === UserRole.SYSTEM_ADMIN;
  if (!isManagerOrAbove) redirect('/carrier/dashboard');

  const { settlementId } = await params;
  const prisma = await getTenantPrisma();

  const settlement = await prisma.driverSettlement.findFirst({
    where: { id: settlementId, tenantId: session.tenantId },
    include: {
      driver: true,
      assignments: {
        include: {
          payComponents: { where: { deletedAt: null } },
          load: { select: { id: true, referenceNumber: true, status: true } },
        },
      },
      bonuses: { where: { deletedAt: null } },
    },
  });

  if (!settlement) notFound();

  // Parse deductions snapshot
  type DeductionSnap = { deductionId: string; appliedAmount: string };
  let deductionsApplied: Array<{ deduction: unknown; appliedAmount: string }> = [];
  if (settlement.notes) {
    try {
      const parsed: unknown = JSON.parse(settlement.notes);
      if (
        parsed &&
        typeof parsed === 'object' &&
        '_deductionsApplied' in parsed &&
        Array.isArray((parsed as { _deductionsApplied: unknown[] })._deductionsApplied)
      ) {
        const snapshot = (parsed as { _deductionsApplied: DeductionSnap[] })._deductionsApplied;
        const deductionIds = snapshot.map((s) => s.deductionId);
        const deductionRecords = await (prisma as unknown as PrismaClient).driverDeduction.findMany({
          where: { id: { in: deductionIds } },
        });
        const deductionMap = new Map(deductionRecords.map((d) => [d.id, d]));
        deductionsApplied = snapshot
          .map((s) => {
            const ded = deductionMap.get(s.deductionId);
            if (!ded) return null;
            return { deduction: ded, appliedAmount: s.appliedAmount };
          })
          .filter(Boolean) as Array<{ deduction: unknown; appliedAmount: string }>;
      }
    } catch {
      // No snapshot
    }
  }

  // Build unified deductions view (per-load DEDUCTION pay components + recurring)
  type UnifiedDeduction = {
    key: string;
    source: 'per-load' | 'recurring';
    label: string;
    subLabel: string | null;
    amount: string; // positive string e.g. "150.00"
  };

  const perLoadDeductions: UnifiedDeduction[] = settlement.assignments.flatMap((a) =>
    a.payComponents
      .filter((c) => c.deletedAt === null && c.category === 'DEDUCTION')
      .map((c) => ({
        key: `pc-${c.id}`,
        source: 'per-load' as const,
        label: c.description,
        subLabel: `Load #${a.load?.referenceNumber ?? a.loadId.slice(0, 8)}`,
        amount: new Decimal(c.grossAmount.toString()).abs().toFixed(2),
      })),
  );

  const recurringDeductions: UnifiedDeduction[] = deductionsApplied.map((d) => {
    const ded = d.deduction as { id: string; deductionType: string; schedule: string };
    return {
      key: `dd-${ded.id}`,
      source: 'recurring' as const,
      label: ded.deductionType,
      subLabel: ded.schedule,
      amount: new Decimal(d.appliedAmount).abs().toFixed(2),
    };
  });

  const deductionsView: UnifiedDeduction[] = [...perLoadDeductions, ...recurringDeductions];

  // Anomaly detection
  const currentNet = new Decimal(settlement.netPay.toString());
  const fourWeekAverage = await computeFourWeekAverage(
    prisma as unknown as PrismaClient,
    session.tenantId,
    settlement.driverId,
    settlement.periodStart,
  );
  const anomaly = detectSettlementAnomaly(currentNet, fourWeekAverage);

  // Serialize for client component
  const settlementData = {
    id: settlement.id,
    status: settlement.status as string,
    settlementReference: settlement.settlementReference,
    periodStart: settlement.periodStart.toISOString(),
    periodEnd: settlement.periodEnd.toISOString(),
    grossTaxable: settlement.grossTaxable.toString(),
    grossNonTaxable: settlement.grossNonTaxable.toString(),
    totalDeductions: settlement.totalDeductions.toString(),
    netPay: settlement.netPay.toString(),
    pdfUrl: settlement.pdfUrl,
    finalizedBy: settlement.finalizedBy,
    finalizedAt: settlement.finalizedAt?.toISOString() ?? null,
    paidAt: settlement.paidAt?.toISOString() ?? null,
    createdAt: settlement.createdAt.toISOString(),
  };

  const driverData = settlement.driver
    ? {
        id: settlement.driver.id,
        firstName: settlement.driver.firstName,
        lastName: settlement.driver.lastName,
      }
    : null;

  const assignmentsData = settlement.assignments.map((a) => ({
    id: a.id,
    loadId: a.loadId,
    payStatus: a.payStatus as string,
    approvedAt: a.approvedAt?.toISOString() ?? null,
    load: a.load
      ? {
          id: a.load.id,
          referenceNumber: a.load.referenceNumber,
          status: a.load.status as string,
        }
      : null,
    payComponents: a.payComponents.map((c) => ({
      id: c.id,
      componentType: c.componentType as string,
      category: c.category as string,
      description: c.description,
      grossAmount: c.grossAmount.toString(),
      isTaxable: c.isTaxable,
    })),
  }));

  const bonusesData = settlement.bonuses.map((b) => ({
    id: b.id,
    bonusType: b.bonusType as string,
    amount: b.amount.toString(),
    description: b.description,
    isTaxable: b.isTaxable,
    scheduledPayDate: b.scheduledPayDate?.toISOString() ?? null,
    paidAt: b.paidAt?.toISOString() ?? null,
  }));

  const anomalyData = {
    isAnomaly: anomaly.isAnomaly,
    fourWeekAverage: anomaly.fourWeekAverage?.toFixed(2) ?? null,
    currentNet: anomaly.currentNet.toFixed(2),
    deviationPct: anomaly.deviationPct?.toFixed(1) ?? null,
    reason: anomaly.reason,
  };

  return (
    <div className="flex h-full flex-col p-6">
      <SettlementDetailView
        settlement={settlementData}
        driver={driverData}
        assignments={assignmentsData}
        bonuses={bonusesData}
        deductions={deductionsView}
        anomaly={anomalyData}
      />
    </div>
  );
}
