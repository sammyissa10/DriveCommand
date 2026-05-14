/**
 * POST /api/driver-pay/settlements/[settlementId]/finalize
 *
 * Finalize a DRAFT settlement: generate PDF, upload to R2, lock the snapshot.
 * OWNER only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { UserRole } from '@/lib/auth/roles';
import { generateSettlementPdf } from '@/lib/driver-pay/settlement-pdf';
import { s3Client, getBucketName } from '@/lib/storage/s3-client';
import type { PrismaClient } from '@/generated/prisma';

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ settlementId: string }> },
) {
  // 1. Auth
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. RBAC — OWNER only
  const role = session.role.toUpperCase();
  if (role !== UserRole.OWNER && role !== UserRole.SYSTEM_ADMIN) {
    return NextResponse.json(
      { error: 'Only owners can finalize settlements.' },
      { status: 403 },
    );
  }

  const { settlementId } = await params;
  const prisma = await getTenantPrisma();

  // 3. Load settlement
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

  // 4. Validate status
  if (settlement.status !== 'DRAFT') {
    return NextResponse.json(
      { error: 'Only DRAFT settlements can be finalized.' },
      { status: 409 },
    );
  }

  // 5. Parse deductions snapshot for PDF
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
            _deductionsApplied: Array<{
              deductionId: string;
              appliedAmount: string;
            }>;
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
      // No snapshot — use empty array
    }
  }

  // 6. Generate PDF
  // Need tenant name — look up tenant
  const tenant = await prisma.tenant.findFirst({
    where: { id: session.tenantId },
    select: { name: true },
  });

  const pdfBuffer = await generateSettlementPdf({
    settlement: settlement as Parameters<typeof generateSettlementPdf>[0]['settlement'],
    tenant: { name: tenant?.name ?? 'Unknown Carrier' },
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

  // 7. Upload to R2
  const r2Key = `settlements/${session.tenantId}/${settlement.id}.pdf`;
  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: getBucketName(),
        Key: r2Key,
        Body: pdfBuffer,
        ContentType: 'application/pdf',
        ContentDisposition: `inline; filename="settlement-${settlement.settlementReference}.pdf"`,
      }),
    );
  } catch (err) {
    // R2 upload failure — log but don't block finalize in development
    console.error('[settlement/finalize] R2 upload failed:', err);
    // In production this should hard-fail; for dev flexibility we continue
    // TODO: make this a hard failure when S3_BUCKET is configured
  }

  // 8a. Fetch active DriverCompensationTemplate to stamp employment type snapshot
  const now = new Date();
  const activeTemplate = await (prisma as unknown as PrismaClient).driverCompensationTemplate.findFirst({
    where: {
      driverId: settlement.driverId,
      tenantId: session.tenantId,
      effectiveFrom: { lte: now },
      deletedAt: null,
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
    },
    orderBy: { effectiveFrom: 'desc' },
  });

  if (!activeTemplate) {
    return NextResponse.json(
      { error: 'Cannot finalize: driver has no active compensation template' },
      { status: 409 },
    );
  }

  // 8. Update settlement
  const updated = await prisma.driverSettlement.update({
    where: { id: settlementId },
    data: {
      status: 'FINALIZED',
      finalizedBy: session.userId,
      finalizedAt: new Date(),
      pdfUrl: r2Key,
      employmentTypeSnapshot: activeTemplate.employmentType,
    },
  });

  // 9. Audit log
  await (prisma as unknown as PrismaClient).driverPayAuditLog.create({
    data: {
      tenantId: session.tenantId,
      entityType: 'DriverSettlement',
      entityId: settlementId,
      action: 'settlement:finalized',
      previousValue: { status: 'DRAFT' },
      newValue: {
        status: 'FINALIZED',
        pdfUrl: r2Key,
        finalizedBy: session.userId,
        employmentTypeSnapshot: activeTemplate.employmentType,
      },
      actorId: session.userId,
      createdBy: session.userId,
    },
  });

  revalidatePath('/carrier/driver-pay/settlements');

  return NextResponse.json({
    settlement: {
      id: updated.id,
      status: updated.status,
      finalizedBy: updated.finalizedBy,
      finalizedAt: updated.finalizedAt?.toISOString() ?? null,
      pdfUrl: updated.pdfUrl,
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}
