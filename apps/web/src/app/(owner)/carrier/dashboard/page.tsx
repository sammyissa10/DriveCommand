import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Send, Package, UserPlus } from 'lucide-react';
import { getSession } from '@/lib/auth/supabase';
import { AlertBar } from '@/components/carrier/dashboard/AlertBar';
import { KPIStrip } from '@/components/carrier/dashboard/KPIStrip';
import { TodayDispatches } from '@/components/carrier/dashboard/TodayDispatches';

export default async function CarrierDashboardPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const orgId = session.tenantId;
  if (!orgId) redirect('/login');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Dashboard
        </h1>
        <p className="mt-1 text-muted-foreground text-sm">Carrier operations overview</p>
      </div>

      {/* Compliance Alerts */}
      <AlertBar />

      {/* KPI Strip */}
      <KPIStrip />

      {/* Two-column layout: Today's Dispatches + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's Dispatches — 2/3 width */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-base font-semibold text-foreground">Today&apos;s Dispatches</h2>
          <TodayDispatches />
        </div>

        {/* Quick Actions — 1/3 width */}
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">Quick Actions</h2>
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
  );
}
