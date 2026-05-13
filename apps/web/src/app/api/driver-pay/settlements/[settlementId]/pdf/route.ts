/**
 * GET /api/driver-pay/settlements/[settlementId]/pdf
 *
 * Serve the settlement PDF:
 * - If FINALIZED/PAID (pdfUrl set): return a signed R2 URL (1-hour expiry)
 * - If DRAFT (no pdfUrl): generate on-the-fly and stream as buffer
 *
 * MANAGER+ can see any; DRIVER can only see their own.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { UserRole } from '@/lib/auth/roles';
import { generateSettlementPdf } from '@/lib/driver-pay/settlement-pdf';
import { generateDownloadUrl } from '@/lib/storage/presigned';
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
          load: { select: { id: true, referenceNumber: true, status: true } },
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

  // 4. If pdfUrl exists, return signed URL
  if (settlement.pdfUrl) {
    try {
      const url = await generateDownloadUrl(settlement.pdfUrl);
      return NextResponse.json({ url });
    } catch (err) {
      console.error('[settlement/pdf] Failed to generate signed URL:', err);
      // Fall through to on-the-fly generation
    }
  }

  // 5. Generate on-the-fly (DRAFT or signed URL failed)
  const tenant = await prisma.tenant.findFirst({
    where: { id: session.tenantId },
    select: { name: true },
  });

  // Parse deductions snapshot
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
        const snapshot = (
          parsed as {
            _deductionsApplied: Array<{ deductionId: string; appliedAmount: string }>;
          }
        )._deductionsApplied;

        const deductionIds = snapshot.map((s) => s.deductionId);
        const deductionRecords = await (
          prisma as unknown as PrismaClient
        ).driverDeduction.findMany({
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

  const buffer = await generateSettlementPdf({
    settlement: settlement as Parameters<typeof generateSettlementPdf>[0]['settlement'],
    tenant: { name: tenant?.name ?? 'Carrier' },
    driver: {
      firstName: settlement.driver.firstName,
      lastName: settlement.driver.lastName,
    },
    assignments: settlement.assignments as Parameters<
      typeof generateSettlementPdf
    >[0]['assignments'],
    bonuses: settlement.bonuses,
    deductionsApplied: deductionsApplied as Parameters<
      typeof generateSettlementPdf
    >[0]['deductionsApplied'],
  });

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="settlement-${settlement.settlementReference ?? settlementId}.pdf"`,
    },
  });
}
