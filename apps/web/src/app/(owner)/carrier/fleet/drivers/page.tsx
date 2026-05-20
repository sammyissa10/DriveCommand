import { redirect } from 'next/navigation';
import { Users } from 'lucide-react';
import { getSession } from '@/lib/auth/supabase';
import { listCarrierDrivers } from '@/lib/carrier/fleet-drivers';
import { DriversGrid } from './_grid/DriversGrid';

export default async function CarrierDriversPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const orgId = session.tenantId;

  let items: Awaited<ReturnType<typeof listCarrierDrivers>>['items'] = [];
  let total = 0;

  try {
    const result = await listCarrierDrivers(orgId);
    items = result.items;
    total = result.total;
  } catch {
    // DB failure — render empty list
  }

  // Count by status
  const statusCounts: Record<string, number> = {};
  for (const d of items) {
    const s = d.status ?? 'unknown';
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Carrier Drivers
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Showing {items.length} of {total} driver{total !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Stat row */}
      {total > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm">
            <Users className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            <span className="font-medium">{total}</span>
            <span className="text-muted-foreground">total</span>
          </div>
          {Object.entries(statusCounts).map(([status, count]) => (
            <div
              key={status}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm"
            >
              <span className="font-medium">{count}</span>
              <span className="text-muted-foreground capitalize">{status}</span>
            </div>
          ))}
        </div>
      )}

      <DriversGrid
        drivers={items.map((d) => ({
          id: d.id,
          firstName: d.firstName,
          lastName: d.lastName,
          cdlClass: d.cdlClass,
          cdlExpiry: d.cdlExpiry,
          payModel: d.payModel,
          status: d.status,
          isSample: d.isSample,
        }))}
      />
    </div>
  );
}
