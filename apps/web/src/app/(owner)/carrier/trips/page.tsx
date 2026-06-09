import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/supabase';
import { prisma } from '@/lib/db/prisma';
import { DispatchesGrid } from './_grid/DispatchesGrid';

export default async function TripsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const orgId = session.tenantId;
  if (!orgId) redirect('/login');

  const [drivers, trucks] = await Promise.all([
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
  ]);

  const driverMap: Record<string, string> = {};
  for (const d of drivers) driverMap[d.id] = `${d.firstName} ${d.lastName}`;

  const truckMap: Record<string, string> = {};
  for (const t of trucks) truckMap[t.id] = t.unitNumber;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Trips
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Daily trips view &mdash; showing today and tomorrow by default.
          </p>
        </div>
      </div>

      <DispatchesGrid driverMap={driverMap} truckMap={truckMap} userRole={session.role} />
    </div>
  );
}
