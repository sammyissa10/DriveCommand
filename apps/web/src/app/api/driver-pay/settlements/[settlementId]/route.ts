/**
 * GET /api/driver-pay/settlements/[settlementId]
 *
 * Full breakdown: settlement + assignments + components + bonuses + deductions + anomaly.
 * MANAGER+ can see any; DRIVER can only see their own.
 */

import { NextRequest, NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { UserRole } from '@/lib/auth/roles';
import {
  computeFourWeekAverage,
  detectSettlementAnomaly,
} from '@/lib/driver-pay/settlement-anomaly';
import type { PrismaClient } from '@/generated/prisma';

// ---------------------------------------------------------------------------
// RBAC helpers
// ---------------------------------------------------------------------------

function isManagerOrAbove(role: string): boolean {
  const r = role.toUpperCase();
  return r === UserRole.SYSTEM_ADMIN || r === UserRole.OWNER || r === UserRole.MANAGER;
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ settlementId: string }> },
) {
  // 1. Auth
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const role = session.role;
  const isDriver = role.toUpperCase() === UserRole.DRIVER || role === 'driver';
  const isManager = isManagerOrAbove(role);

  if (!isDriver && !isManager) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const { settlementId } = await params;
  const prisma = await getTenantPrisma();

  // 2. Load settlement
  const settlement = await prisma.driverSettlement.findFirst({
    where: { id: settlementId, tenantId: session.tenantId },
    include: {
      driver: true,
      assignments: {
        include: {
          payComponents: { where: { deletedAt: null } },
          load: {
            select: { id: true, referenceNumber: true, status: true },
          },
        },
      },
      bonuses: { where: { deletedAt: null } },
    },
  });

  if (!settlement) {
    return NextResponse.json({ error: 'Settlement not found.' }, { status: 404 });
  }

  // 3. DRIVER: ensure they can only see their own
  if (isDriver) {
    const driverRecord = await prisma.carrierDriver.findFirst({
      where: { userId: session.userId },
      select: { id: true },
    });
    if (!driverRecord || driverRecord.id !== settlement.driverId) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }
  }

  // 4. Parse deductionsApplied snapshot from notes
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
        const snapshot = (parsed as { _deductionsApplied: Array<{ deductionId: string; appliedAmount: string; requestedAmount: string; carryover: string }> })._deductionsApplied;

        // Fetch deduction records for snapshot
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
      // Notes not JSON or no snapshot — continue with empty array
    }
  }

  // 5. Anomaly detection
  const currentNet = new Decimal(settlement.netPay.toString());
  const fourWeekAverage = await computeFourWeekAverage(
    prisma as unknown as PrismaClient,
    session.tenantId,
    settlement.driverId,
    settlement.periodStart,
  );
  const anomaly = detectSettlementAnomaly(currentNet, fourWeekAverage);

  // 6. Serialize
  return NextResponse.json({
    settlement: {
      id: settlement.id,
      tenantId: settlement.tenantId,
      driverId: settlement.driverId,
      periodStart: settlement.periodStart.toISOString(),
      periodEnd: settlement.periodEnd.toISOString(),
      status: settlement.status,
      grossTaxable: settlement.grossTaxable.toString(),
      grossNonTaxable: settlement.grossNonTaxable.toString(),
      totalDeductions: settlement.totalDeductions.toString(),
      netPay: settlement.netPay.toString(),
      settlementReference: settlement.settlementReference,
      pdfUrl: settlement.pdfUrl,
      finalizedBy: settlement.finalizedBy,
      finalizedAt: settlement.finalizedAt?.toISOString() ?? null,
      paidAt: settlement.paidAt?.toISOString() ?? null,
      notes: settlement.notes,
      createdAt: settlement.createdAt.toISOString(),
      updatedAt: settlement.updatedAt.toISOString(),
    },
    driver: settlement.driver
      ? {
          id: settlement.driver.id,
          firstName: settlement.driver.firstName,
          lastName: settlement.driver.lastName,
          payModel: settlement.driver.payModel,
        }
      : null,
    assignments: settlement.assignments.map((a) => ({
      id: a.id,
      loadId: a.loadId,
      payStatus: a.payStatus,
      settlementId: a.settlementId,
      approvedAt: a.approvedAt?.toISOString() ?? null,
      load: a.load
        ? {
            id: a.load.id,
            referenceNumber: a.load.referenceNumber,
            status: a.load.status,
          }
        : null,
      payComponents: a.payComponents.map((c) => ({
        id: c.id,
        componentType: c.componentType,
        category: c.category,
        description: c.description,
        grossAmount: c.grossAmount.toString(),
        isTaxable: c.isTaxable,
        isReimbursement: c.isReimbursement,
        notes: c.notes,
      })),
    })),
    bonuses: settlement.bonuses.map((b) => ({
      id: b.id,
      bonusType: b.bonusType,
      amount: b.amount.toString(),
      description: b.description,
      scheduledPayDate: b.scheduledPayDate?.toISOString() ?? null,
      paidAt: b.paidAt?.toISOString() ?? null,
      isTaxable: b.isTaxable,
    })),
    deductionsApplied,
    anomaly: {
      isAnomaly: anomaly.isAnomaly,
      fourWeekAverage: anomaly.fourWeekAverage?.toFixed(2) ?? null,
      currentNet: anomaly.currentNet.toFixed(2),
      deviationPct: anomaly.deviationPct?.toFixed(1) ?? null,
      reason: anomaly.reason,
    },
  });
}
