import { redirect } from 'next/navigation';
import { Users } from 'lucide-react';
import { getSession } from '@/lib/auth/supabase';
import { listClients } from '@/lib/carrier/clients';
import { ClientList } from '@/components/carrier/clients/ClientList';

export default async function ClientsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const orgId = session.tenantId;

  let items: Awaited<ReturnType<typeof listClients>>['items'] = [];
  let total = 0;

  try {
    const result = await listClients(orgId);
    items = result.items;
    total = result.total;
  } catch {
    // DB failure — render empty list
  }

  // Count by status
  const statusCounts: Record<string, number> = {};
  for (const c of items) {
    const s = c.status ?? 'unknown';
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }

  const STATUS_LABELS: Record<string, string> = {
    active: 'Active',
    inactive: 'Inactive',
    blocked: 'Blocked',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Clients
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Showing {items.length} of {total} client{total !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Stat row */}
      {total > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold">{total}</span>
            <span className="text-muted-foreground">total</span>
          </div>
          {Object.entries(statusCounts).map(([status, count]) => (
            <div
              key={status}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm"
            >
              <span className="font-semibold">{count}</span>
              <span className="text-muted-foreground capitalize">
                {STATUS_LABELS[status] ?? status}
              </span>
            </div>
          ))}
        </div>
      )}

      <ClientList
        role={session.role ?? undefined}
        clients={items.map((c) => ({
          id: c.id,
          name: c.name,
          status: c.status,
          email: c.email,
          phone: c.phone,
          primaryContact: c.primaryContact,
          city: c.city,
          state: c.state,
          portalAccess: c.portalAccess,
          isSample: c.isSample,
        }))}
      />
    </div>
  );
}
