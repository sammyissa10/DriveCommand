import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Send, Package, UserPlus } from 'lucide-react';
import { getSession } from '@/lib/auth/supabase';
import { AlertBar } from '@/components/carrier/dashboard/AlertBar';
import { KPIStrip } from '@/components/carrier/dashboard/KPIStrip';
import { ChecklistStatusWidget } from '@/components/carrier/dashboard/ChecklistStatusWidget';
import { TodayDispatches } from '@/components/carrier/dashboard/TodayDispatches';
import { DriverStatusStrip } from '@/components/carrier/dashboard/DriverStatusStrip';
import { RecentActivity } from '@/components/carrier/dashboard/RecentActivity';
import { QuickMessageBoard } from '@/components/carrier/dashboard/QuickMessageBoard';
import { SampleDataBanner } from '@/components/onboarding/sample-data-banner';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';

export default async function CarrierDashboardPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const orgId = session.tenantId;
  if (!orgId) redirect('/login');

  // Check if tenant has sample data seeded
  const tenant = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    return tx.tenant.findUnique({ where: { id: orgId }, select: { sampleDataSeeded: true } });
  }, TX_OPTIONS).catch(() => null);

  const hasSampleRecords = tenant?.sampleDataSeeded
    ? await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        const [truckCount, driverCount, loadCount, clientCount] = await Promise.all([
          tx.carrierTruck.count({ where: { orgId, isSample: true } }),
          tx.carrierDriver.count({ where: { orgId, isSample: true } }),
          tx.carrierLoad.count({ where: { orgId, isSample: true } }),
          tx.carrierClient.count({ where: { orgId, isSample: true } }),
        ]);
        return truckCount + driverCount + loadCount + clientCount > 0;
      }, TX_OPTIONS).catch(() => false)
    : false;

  return (
    <div className="space-y-6">
      {/* Sample data banner — shown when tenant has seeded sample records */}
      {tenant?.sampleDataSeeded && hasSampleRecords && (
        <SampleDataBanner tenantId={orgId} />
      )}

      {/* Header */}
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Dashboard
        </h1>
        <p className="mt-1 text-muted-foreground text-sm">Carrier operations overview</p>
      </div>

      {/* Row 1: KPI Cards */}
      <KPIStrip />

      {/* Row 2: Compliance & Checklists triage */}
      <ChecklistStatusWidget />

      {/* Row 3: Alert Strip */}
      <AlertBar />

      {/* Row 4: Driver Status Strip */}
      <DriverStatusStrip />

      {/* Row 5: Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 min-w-0">
        {/* Left 60% — Today's Dispatches + Recent Activity */}
        <div className="lg:col-span-3 space-y-6 min-w-0">
          <div>
            <h2 className="text-base font-semibold text-foreground mb-3">
              Today&apos;s Dispatches
            </h2>
            <TodayDispatches />
          </div>
          <RecentActivity />
        </div>

        {/* Right 40% — Messages + Quick Actions */}
        <div className="lg:col-span-2 space-y-6 min-w-0">
          <QuickMessageBoard />

          {/* Quick Actions */}
          <div>
            <h2 className="text-base font-semibold text-foreground mb-3">Quick Actions</h2>
            <div className="space-y-2">
              <Link
                href="/carrier/dispatches?new=true"
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground hover:bg-accent transition-colors"
              >
                <Send className="h-4 w-4 text-muted-foreground" />
                New Dispatch
              </Link>
              <Link
                href="/carrier/loads/new"
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground hover:bg-accent transition-colors"
              >
                <Package className="h-4 w-4 text-muted-foreground" />
                New Load
              </Link>
              <Link
                href="/carrier/clients/new"
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground hover:bg-accent transition-colors"
              >
                <UserPlus className="h-4 w-4 text-muted-foreground" />
                New Client
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
