/**
 * /carrier/driver-pay/settlements/generate — Generate Settlements page (server component)
 *
 * Pre-fetches drivers who have APPROVED + unsettled assignments.
 * Renders GenerateSettlementsModal (client component).
 */

import React from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Decimal from 'decimal.js';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { UserRole } from '@/lib/auth/roles';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GenerateSettlementsModal } from '../_components/GenerateSettlementsModal';
import { ArrowLeft } from 'lucide-react';

export const metadata = { title: 'Generate Settlements | DriveCommand' };

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function GenerateSettlementsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const role = session.role.toUpperCase();
  if (role !== UserRole.OWNER && role !== UserRole.SYSTEM_ADMIN) {
    redirect('/carrier/driver-pay/settlements');
  }

  const prisma = await getTenantPrisma();

  // Fetch drivers who have APPROVED + unsettled assignments
  const assignments = await prisma.loadDriverAssignment.findMany({
    where: {
      tenantId: session.tenantId,
      payStatus: 'APPROVED',
      settlementId: null,
      approvedAt: { not: null },
      deletedAt: null,
    },
    include: {
      payComponents: { where: { deletedAt: null }, select: { grossAmount: true, category: true } },
      driver: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  // Group by driver and compute totals
  type DriverAgg = {
    id: string;
    firstName: string;
    lastName: string;
    approvedCount: number;
    approvedTotal: Decimal;
  };

  const driverMap = new Map<string, DriverAgg>();

  for (const a of assignments) {
    const driverId = a.driverId;
    if (!driverMap.has(driverId)) {
      driverMap.set(driverId, {
        id: driverId,
        firstName: a.driver.firstName,
        lastName: a.driver.lastName,
        approvedCount: 0,
        approvedTotal: new Decimal(0),
      });
    }
    const agg = driverMap.get(driverId)!;
    agg.approvedCount += 1;
    // Sum non-deduction components
    for (const c of a.payComponents) {
      if ((c.category as string) !== 'DEDUCTION') {
        agg.approvedTotal = agg.approvedTotal.plus(new Decimal(c.grossAmount.toString()));
      }
    }
  }

  const drivers = Array.from(driverMap.values()).map((d) => ({
    id: d.id,
    firstName: d.firstName,
    lastName: d.lastName,
    approvedCount: d.approvedCount,
    approvedTotal: d.approvedTotal.toFixed(2),
  }));

  return (
    <div className="flex h-full flex-col p-6 gap-6 max-w-2xl">
      {/* Header */}
      <header className="flex items-center gap-4">
        <Link href="/carrier/driver-pay/settlements">
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="h-4 w-4" />
            Settlements
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">Generate Settlements</h1>
          <p className="text-sm text-muted-foreground">
            Select a pay period and drivers to generate DRAFT settlements.
          </p>
        </div>
      </header>

      {/* Modal card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Settlement Run</CardTitle>
        </CardHeader>
        <CardContent>
          <GenerateSettlementsModal drivers={drivers} />
        </CardContent>
      </Card>

      {/* Help text */}
      {drivers.length === 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
          <p className="font-medium">No drivers with pending pay</p>
          <p className="mt-1">
            There are no drivers with APPROVED and unsettled assignments. Approve assignments from
            the{' '}
            <Link href="/carrier/driver-pay/pending" className="underline">
              Pending Pay
            </Link>{' '}
            page first.
          </p>
        </div>
      )}
    </div>
  );
}
