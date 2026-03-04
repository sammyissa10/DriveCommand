export const dynamic = 'force-dynamic';

import { getAllTickets } from '@/actions/support-tickets';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LifeBuoy, Ticket, Clock, CheckCircle } from 'lucide-react';
import { AdminTicketList } from './ticket-list';

export default async function AdminSupportPage() {
  let tickets: Awaited<ReturnType<typeof getAllTickets>> = [];
  let fetchError: string | null = null;
  try {
    tickets = await getAllTickets();
  } catch (err) {
    console.error('[AdminSupportPage] getAllTickets error:', err);
    fetchError = err instanceof Error ? err.message : 'Failed to load tickets';
  }

  // Derive stats
  const total = tickets.length;
  const openCount = tickets.filter((t) => t.status === 'OPEN').length;
  const inProgressCount = tickets.filter((t) => t.status === 'IN_PROGRESS').length;
  const resolvedCount = tickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED').length;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Support Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage support tickets across all tenants.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Total Tickets</CardTitle>
            <Ticket className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Open</CardTitle>
            <LifeBuoy className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{openCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">In Progress</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{inProgressCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Resolved</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{resolvedCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tickets list */}
      {fetchError ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Error loading tickets: {fetchError}
        </div>
      ) : tickets.length === 0 ? (
        <EmptyState
          icon={LifeBuoy}
          title="No support tickets yet"
          description="Tickets submitted by users across all tenants will appear here."
        />
      ) : (
        <AdminTicketList tickets={tickets} />
      )}
    </div>
  );
}
