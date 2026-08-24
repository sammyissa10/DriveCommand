import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getSession } from '@/lib/auth/supabase';
import { prisma } from '@/lib/db/prisma';
import { facilityVisibilityWhere, staffViewer } from '@/lib/carrier/facility-visibility';
import { RouteTemplateForm } from '@/components/carrier/templates/RouteTemplateForm';
import { NewTemplateMobile } from './NewTemplateMobile';
import { ResponsiveSwitch } from '@/components/ui/ResponsiveSwitch';

export default async function NewRouteTemplatePage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const orgId = session.tenantId;
  if (!orgId) redirect('/login');

  // Fetched server-side so every select renders with its options on the first
  // paint (client-fetching them made selects flash their placeholder).
  const [clients, drivers, trucks, facilities] = await Promise.all([
    prisma.carrierClient.findMany({
      where: { orgId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
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
    prisma.carrierFacility.findMany({
      // A picker. Driver residences are excluded server-side (spec Section 9).
      where: { orgId, deletedAt: null, ...facilityVisibilityWhere(staffViewer(session)) },
      select: { id: true, name: true, city: true, state: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return (
    <ResponsiveSwitch
      mobile={
        <div className="-m-4">
          <NewTemplateMobile clients={clients} drivers={drivers} trucks={trucks} facilities={facilities} />
        </div>
      }
      desktop={
        <div className="space-y-6">
          <div>
            <Link
              href="/carrier/templates"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Route Templates
            </Link>
            <h1 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              New Route Template
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Define a recurring route with stops for automated dispatch generation.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-6">
            <RouteTemplateForm />
          </div>
        </div>
      }
    />
  );
}
