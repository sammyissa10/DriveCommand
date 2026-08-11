import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/supabase';
import { prisma } from '@/lib/db/prisma';
import { facilityVisibilityWhere, staffViewer } from '@/lib/carrier/facility-visibility';
import { LoadForm } from '@/components/carrier/loads/LoadForm';
import { NewLoadMobile } from './NewLoadMobile';
import { ResponsiveSwitch } from '@/components/ui/ResponsiveSwitch';

export default async function NewLoadPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const orgId = session.tenantId;
  if (!orgId) redirect('/login');

  const [clients, drivers, trucks, facilities] = await Promise.all([
    prisma.carrierClient.findMany({
      where: { orgId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.carrierDriver.findMany({
      where: { orgId, status: 'active' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        user: { select: { isDispatchReady: true } },
      },
      orderBy: { firstName: 'asc' },
    }),
    prisma.carrierTruck.findMany({
      where: { orgId, status: 'active' },
      select: { id: true, unitNumber: true, make: true, model: true },
      orderBy: { unitNumber: 'asc' },
    }),
    // Mobile picks stop facilities from a select; desktop uses a search modal.
    prisma.carrierFacility.findMany({
      // A picker. Driver residences are excluded server-side (spec Section 9).
      where: { orgId, ...facilityVisibilityWhere(staffViewer(session)) },
      select: { id: true, name: true, city: true, state: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const driverOptions = drivers.map((d) => ({
    id: d.id,
    name: `${d.firstName} ${d.lastName}`,
    status: 'active',
    isDispatchReady: d.user?.isDispatchReady ?? false,
  }));

  return (
    <ResponsiveSwitch
      mobile={
        <div className="-m-4">
          <NewLoadMobile clients={clients} facilities={facilities} />
        </div>
      }
      desktop={
        <div className="space-y-6">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              New Load
            </h1>
            <p className="mt-1 text-muted-foreground text-sm">
              Create a new load. Select a client and optionally link a contract to auto-populate rate fields.
            </p>
          </div>

          <LoadForm mode="create" clients={clients} drivers={driverOptions} trucks={trucks} />
        </div>
      }
    />
  );
}
