import { redirect } from 'next/navigation';
import Link from 'next/link';
import { FileUp } from 'lucide-react';
import { getSession } from '@/lib/auth/supabase';
import { prisma } from '@/lib/db/prisma';
import { Button } from '@/components/ui/button';
import { ResumeImportBanner } from '@/components/carrier/imports/ResumeImportBanner';
import { getResumableImports } from '@/lib/document-import/intake';
import { DispatchesGrid } from './_grid/DispatchesGrid';
import { TripsMobile } from './TripsMobile';

export default async function TripsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const orgId = session.tenantId;
  if (!orgId) redirect('/login');

  const canCreate = session.role !== 'MANAGER';

  const [drivers, trucks, realLoadCount, resumableImports] = await Promise.all([
    prisma.carrierDriver.findMany({
      where: { orgId, status: 'active' },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { lastName: 'asc' },
    }),
    prisma.carrierTruck.findMany({
      where: { orgId, status: 'active' },
      select: { id: true, unitNumber: true },
      orderBy: { unitNumber: 'asc' },
    }),
    // Real (non-sample, non-deleted) loads exist? Drives the guided empty state:
    // you can't plan a trip until there's a load to assign.
    prisma.carrierLoad.count({ where: { orgId, isSample: false, deletedAt: null } }),
    // Unfinished imports — the resume banner (spec Phase 2 item 8). Only the
    // people who could act on it are asked about it.
    canCreate ? getResumableImports(orgId, session.userId) : Promise.resolve([]),
  ]);

  const hasLoads = realLoadCount > 0;

  const driverMap: Record<string, string> = {};
  for (const d of drivers) driverMap[d.id] = `${d.firstName} ${d.lastName}`;

  const truckMap: Record<string, string> = {};
  for (const t of trucks) truckMap[t.id] = t.unitNumber;

  return (
    <>
      {/* Mobile-web design system — rendered below lg; desktop keeps its own layout */}
      <div className="lg:hidden -m-4">
        <TripsMobile
          driverMap={driverMap}
          truckMap={truckMap}
          canCreate={canCreate}
          hasLoads={hasLoads}
          resumableImports={resumableImports}
        />
      </div>

      {/* Desktop */}
      <div className="hidden lg:block space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Trips
            </h1>
            <p className="mt-1 text-muted-foreground text-sm">
              Daily trips view &mdash; showing today and tomorrow, plus any in-progress trips.
            </p>
          </div>

          {/* The one primary action, top right (spec Phase 2 item 1). */}
          {canCreate ? (
            <Button asChild className="shrink-0">
              <Link href="/carrier/imports/new">
                <FileUp className="mr-2 h-4 w-4" />
                Import Document
              </Link>
            </Button>
          ) : null}
        </div>

        <ResumeImportBanner items={resumableImports} />

        <DispatchesGrid driverMap={driverMap} truckMap={truckMap} userRole={session.role} />
      </div>
    </>
  );
}
