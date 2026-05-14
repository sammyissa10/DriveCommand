/**
 * /carrier/driver-pay/settlements — Settlement list page (server component)
 */

import React from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { UserRole } from '@/lib/auth/roles';
import { Button } from '@/components/ui/button';
import { SettlementListTable } from './_components/SettlementListTable';
import type { SettlementRow } from './_components/SettlementListTable';
import { ExportPayrollButton } from './_components/ExportPayrollButton';
import { computeExportEligibility } from './_lib/export-eligibility';
import { Plus } from 'lucide-react';
import { Prisma } from '@/generated/prisma';

export const metadata = { title: 'Settlements | DriveCommand' };

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function SettlementsPage({
  searchParams,
}: {
  searchParams: Promise<{
    driverId?: string;
    status?: string;
    periodStart?: string;
    periodEnd?: string;
    page?: string;
  }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const role = session.role.toUpperCase();
  const isManagerOrAbove =
    role === UserRole.OWNER || role === UserRole.MANAGER || role === UserRole.SYSTEM_ADMIN;
  if (!isManagerOrAbove) redirect('/carrier/dashboard');

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? '1', 10));
  const pageSize = 25;
  const skip = (page - 1) * pageSize;

  const prisma = await getTenantPrisma();

  // Build where clause
  const where: Prisma.DriverSettlementWhereInput = { tenantId: session.tenantId };
  if (params.driverId) where.driverId = params.driverId;
  if (params.status) {
    const validStatuses = ['DRAFT', 'FINALIZED', 'PAID', 'VOIDED'];
    if (validStatuses.includes(params.status)) {
      where.status = params.status as 'DRAFT' | 'FINALIZED' | 'PAID' | 'VOIDED';
    }
  }
  if (params.periodStart) where.periodStart = { gte: new Date(params.periodStart) };
  if (params.periodEnd) where.periodEnd = { lte: new Date(params.periodEnd) };

  const [rows, totalCount] = await Promise.all([
    prisma.driverSettlement.findMany({
      where,
      include: {
        driver: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.driverSettlement.count({ where }),
  ]);

  // Server-side eligibility for export: FINALIZED|PAID, not soft-deleted, snapshot present.
  // Spans the full filtered set (no pagination) — the API will also enforce these criteria.
  const eligibleRows = await prisma.driverSettlement.findMany({
    where: {
      ...where,
      status: { in: ['FINALIZED', 'PAID'] },
      deletedAt: null,
      employmentTypeSnapshot: { not: null },
    },
    select: { id: true, netPay: true },
  });
  const { ids: eligibleSettlementIds, total: eligibleTotal } = computeExportEligibility(eligibleRows);

  const settlements: SettlementRow[] = rows.map((s) => ({
    id: s.id,
    settlementReference: s.settlementReference,
    driverId: s.driverId,
    driver: s.driver ? { firstName: s.driver.firstName, lastName: s.driver.lastName } : null,
    periodStart: s.periodStart.toISOString(),
    periodEnd: s.periodEnd.toISOString(),
    netPay: s.netPay.toString(),
    status: s.status as string,
    createdAt: s.createdAt.toISOString(),
  }));

  return (
    <div className="flex h-full flex-col p-6 gap-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Settlements</h1>
          <p className="text-sm text-muted-foreground">
            Driver pay settlement runs — draft, finalize, and mark paid.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(role === UserRole.OWNER || role === UserRole.SYSTEM_ADMIN) && (
            <ExportPayrollButton
              eligibleSettlementIds={eligibleSettlementIds}
              eligibleTotal={eligibleTotal}
            />
          )}
          <Link href="/carrier/driver-pay/settlements/generate">
            <Button className="gap-1">
              <Plus className="h-4 w-4" />
              Generate Settlements
            </Button>
          </Link>
        </div>
      </header>

      {/* Settlement table (client component for pagination) */}
      <SettlementListTable
        settlements={settlements}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
      />
    </div>
  );
}
