import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/supabase';
import { prisma } from '@/lib/db/prisma';
import { facilityVisibilityWhere, staffViewer } from '@/lib/carrier/facility-visibility';
import { LoadForm } from '@/components/carrier/loads/LoadForm';
import { NewLoadMobile } from './NewLoadMobile';
import { SampleHiddenNote } from '@/components/onboarding/sample-hidden-note';
import { ResponsiveSwitch } from '@/components/ui/ResponsiveSwitch';


/**
 * Did TKT-0076 actually remove anything for THIS tenant?
 *
 * The note only earns its place when a record really is missing. Asking the
 * question here rather than inside the component keeps it one cheap count per
 * entity on a page that is already fetching those tables.
 */
async function hasHiddenSamples(orgId: string): Promise<boolean> {
  const [c, d, t] = await Promise.all([
    prisma.carrierClient.count({ where: { orgId, isSample: true, deletedAt: null } }),
    prisma.carrierDriver.count({ where: { orgId, isSample: true, deletedAt: null } }),
    prisma.carrierTruck.count({ where: { orgId, isSample: true, deletedAt: null } }),
  ]);
  return c + d + t > 0;
}

export default async function NewLoadPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const orgId = session.tenantId;
  if (!orgId) redirect('/login');

  // TKT-0076: seeded demo records must never appear in an operational picker —
  // the same predicate `carrier/trips/new` uses. `deletedAt` guards against
  // soft-deleted rows lingering in a dropdown. Sample records stay visible in
  // the list grids with their pill; this hides them from ASSIGNMENT only.
  const samplesHidden = await hasHiddenSamples(orgId);

  const [clients, drivers, trucks, facilities] = await Promise.all([
    prisma.carrierClient.findMany({
      where: { orgId, isSample: false, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.carrierDriver.findMany({
      where: { orgId, status: 'active', isSample: false, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        user: { select: { isDispatchReady: true } },
      },
      orderBy: { firstName: 'asc' },
    }),
    prisma.carrierTruck.findMany({
      where: { orgId, status: 'active', isSample: false, deletedAt: null },
      select: { id: true, unitNumber: true, make: true, model: true },
      orderBy: { unitNumber: 'asc' },
    }),
    // Mobile picks stop facilities from a select; desktop uses a search modal.
    prisma.carrierFacility.findMany({
      // A picker. Driver residences are excluded server-side (spec Section 9).
      where: { orgId, deletedAt: null, ...facilityVisibilityWhere(staffViewer(session)) },
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

          {samplesHidden && <SampleHiddenNote className="-mb-2" />}
          <LoadForm mode="create" clients={clients} drivers={driverOptions} trucks={trucks} />
        </div>
      }
    />
  );
}
