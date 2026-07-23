import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { NewTripFormClient } from './NewTripFormClient';
import { NewTripMobile } from './NewTripMobile';
import { ResponsiveSwitch } from '@/components/ui/ResponsiveSwitch';

export default async function NewTripPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const orgId = session.tenantId;
  if (!orgId) redirect('/login');

  const tenantPrisma = await getTenantPrisma();

  // Only real, active, non-deleted fleet records belong in the pickers.
  // Excluding is_sample keeps seeded demo records out of operational dropdowns
  // (TKT-0076); deletedAt guards against soft-deleted rows lingering.
  const [drivers, trucks] = await Promise.all([
    tenantPrisma.carrierDriver.findMany({
      where: { orgId, status: 'active', isSample: false, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { lastName: 'asc' },
    }),
    tenantPrisma.carrierTruck.findMany({
      where: { orgId, status: 'active', isSample: false, deletedAt: null },
      select: { id: true, unitNumber: true },
      orderBy: { unitNumber: 'asc' },
    }),
  ]);

  const driverMap: Record<string, string> = {};
  for (const d of drivers) driverMap[d.id] = `${d.firstName} ${d.lastName}`;

  const truckMap: Record<string, string> = {};
  for (const t of trucks) truckMap[t.id] = t.unitNumber;

  return (
    <ResponsiveSwitch
      mobile={
        <div className="-m-4">
          <NewTripMobile driverMap={driverMap} truckMap={truckMap} userRole={session.role} />
        </div>
      }
      desktop={
        <div className="space-y-6">
          {/* Back link */}
          <div>
            <Link
              href="/carrier/trips"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Trips
            </Link>
          </div>

          {/* Header */}
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              New Trip
            </h1>
            <p className="mt-1 text-muted-foreground text-sm">
              Create a new trip and assign a driver and truck.
            </p>
          </div>

          {/* Form */}
          <div className="max-w-2xl">
            <NewTripFormClient
              driverMap={driverMap}
              truckMap={truckMap}
              userRole={session.role}
            />
          </div>
        </div>
      }
    />
  );
}
