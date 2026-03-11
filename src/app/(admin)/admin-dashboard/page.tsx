export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { Building2, Truck, TrendingUp, LifeBuoy, Receipt } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getSystemMetrics } from '@/app/(admin)/actions/tenants';

export default async function AdminDashboardPage() {
  let metrics = {
    totalTenants: 0,
    activeLoadsToday: 0,
    newSignupsThisWeek: 0,
    openTickets: 0,
  };

  try {
    metrics = await getSystemMetrics();
  } catch (err) {
    console.error('[AdminDashboardPage] getSystemMetrics error:', err);
  }

  const metricCards = [
    {
      label: 'Total Tenants',
      value: metrics.totalTenants,
      icon: Building2,
      iconColor: 'text-gray-500',
      valueColor: 'text-gray-900',
    },
    {
      label: 'Active Loads Today',
      value: metrics.activeLoadsToday,
      icon: Truck,
      iconColor: 'text-blue-500',
      valueColor: 'text-blue-600',
    },
    {
      label: 'New Signups This Week',
      value: metrics.newSignupsThisWeek,
      icon: TrendingUp,
      iconColor: 'text-green-500',
      valueColor: 'text-green-600',
    },
    {
      label: 'Open Tickets',
      value: metrics.openTickets,
      icon: LifeBuoy,
      iconColor: 'text-yellow-500',
      valueColor: 'text-yellow-600',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Platform Overview</h1>
        <p className="mt-1 text-sm text-gray-500">DriveCommand platform metrics</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {metricCards.map(({ label, value, icon: Icon, iconColor, valueColor }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">{label}</CardTitle>
              <Icon className={`h-4 w-4 ${iconColor}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${valueColor}`}>{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link
          href="/tenants"
          className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-6 py-4 shadow-sm hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-gray-400" />
            <span className="font-medium text-gray-900">Manage Tenants</span>
          </div>
          <span className="text-gray-400">→</span>
        </Link>
        <Link
          href="/billing"
          className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-6 py-4 shadow-sm hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Receipt className="h-5 w-5 text-gray-400" />
            <span className="font-medium text-gray-900">Billing</span>
          </div>
          <span className="text-gray-400">→</span>
        </Link>
        <Link
          href="/admin-support"
          className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-6 py-4 shadow-sm hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <LifeBuoy className="h-5 w-5 text-gray-400" />
            <span className="font-medium text-gray-900">Support Queue</span>
          </div>
          <span className="text-gray-400">→</span>
        </Link>
      </div>
    </div>
  );
}
