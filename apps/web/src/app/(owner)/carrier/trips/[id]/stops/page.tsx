export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { getSession } from '@/lib/auth/supabase';
import { getTrip } from '@/lib/carrier/trips';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { maskFacilitiesForViewer, staffViewer } from '@/lib/carrier/facility-visibility';

interface Props {
  params: Promise<{ id: string }>;
}

const STOP_STATUS_BADGE: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  arrived: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  skipped: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
};

const STOP_TYPE_BADGE: Record<string, string> = {
  pickup: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
  delivery: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300',
  fuel: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  rest: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  waypoint: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

const DISPATCH_STATUS_BADGE: Record<string, string> = {
  planned: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

function formatAppt(dt: Date | null): string {
  if (!dt) return '---';
  return dt.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function computeDwell(arrivedAt: Date | null, departedAt: Date | null): string {
  if (!arrivedAt || !departedAt) return '---';
  const mins = Math.floor((departedAt.getTime() - arrivedAt.getTime()) / 60000);
  return `${mins} min`;
}

function extractDispatchNumber(notes: string | null): string {
  if (!notes) return '—';
  const match = notes.match(/\[DISPATCH_NUMBER=([^\]]+)\]/);
  return match ? match[1] : '—';
}

export default async function StopsOverviewPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { id } = await params;
  const orgId = session.tenantId;
  if (!orgId) redirect('/login');

  const dispatch = await getTrip(orgId, id);
  if (!dispatch) notFound();

  const dispatchNumber = extractDispatchNumber(dispatch.notes ?? null);
  const statusLabel = dispatch.status.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const statusBadgeClass = DISPATCH_STATUS_BADGE[dispatch.status] ?? DISPATCH_STATUS_BADGE.planned;

  // Fetch facility names for all stops
  const facilityIds = [...new Set(dispatch.stops.map((s) => s.facilityId))];
  const facilities = facilityIds.length
    ? maskFacilitiesForViewer(
        await prisma.carrierFacility.findMany({
          where: { id: { in: facilityIds }, orgId },
          select: {
            id: true,
            name: true,
            city: true,
            state: true,
            isDriverResidence: true,
            residentDriverId: true,
          },
        }),
        // This trip's own stops — masked, not removed. See the trip detail page.
        staffViewer(session),
      )
    : [];
  const facilityMap: Record<string, { name: string; city: string | null; state: string | null }> = {};
  for (const f of facilities) facilityMap[f.id] = f;

  // Fetch document counts per stop
  const stopIds = dispatch.stops.map((s) => s.id);
  const docCountMap: Record<string, number> = {};
  if (stopIds.length) {
    const docs = await prisma.carrierDocument.groupBy({
      by: ['stopId'],
      where: { stopId: { in: stopIds } },
      _count: { id: true },
    });
    for (const d of docs) {
      if (d.stopId) docCountMap[d.stopId] = d._count.id;
    }
  }

  // Fetch message counts per stop
  const msgCountMap: Record<string, number> = {};
  if (stopIds.length) {
    const msgs = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.fleetMessage.groupBy({
        by: ['stopId'],
        where: { stopId: { in: stopIds }, tenantId: orgId },
        _count: { id: true },
      });
    }, TX_OPTIONS);
    for (const m of msgs) {
      if (m.stopId) msgCountMap[m.stopId] = m._count.id;
    }
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <div>
        <Link
          href={`/carrier/trips/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Trip
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-foreground">
          Stops &mdash; {dispatchNumber}
        </h1>
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass}`}>
          {statusLabel}
        </span>
      </div>

      {/* Stops table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">#</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Facility</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Appointment</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Arrived</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Departed</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Dwell</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Docs</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Msgs</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider sr-only">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {dispatch.stops.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No stops added to this trip yet.
                  </td>
                </tr>
              ) : (
                dispatch.stops.map((stop) => {
                  const facility = facilityMap[stop.facilityId];
                  const typeBadge = STOP_TYPE_BADGE[stop.stopType] ?? STOP_TYPE_BADGE.waypoint;
                  const statusBadge = STOP_STATUS_BADGE[stop.status] ?? STOP_STATUS_BADGE.pending;
                  const typeLabel = stop.stopType.charAt(0).toUpperCase() + stop.stopType.slice(1);
                  const statusLbl = stop.status.charAt(0).toUpperCase() + stop.status.slice(1);
                  const docCount = docCountMap[stop.id] ?? 0;
                  const msgCount = msgCountMap[stop.id] ?? 0;
                  const dwell = computeDwell(stop.arrivedAt, stop.departedAt);

                  return (
                    <tr
                      key={stop.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 text-foreground font-medium">{stop.sequenceOrder}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${typeBadge}`}>
                          {typeLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-foreground font-medium">{facility?.name ?? '—'}</div>
                        {facility?.city && (
                          <div className="text-xs text-muted-foreground">
                            {[facility.city, facility.state].filter(Boolean).join(', ')}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-foreground whitespace-nowrap">
                        {formatAppt(stop.appointmentStart)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge}`}>
                          {statusLbl}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-foreground whitespace-nowrap">
                        {stop.arrivedAt
                          ? stop.arrivedAt.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                          : '---'}
                      </td>
                      <td className="px-4 py-3 text-foreground whitespace-nowrap">
                        {stop.departedAt
                          ? stop.departedAt.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                          : '---'}
                      </td>
                      <td className="px-4 py-3 text-foreground">{dwell}</td>
                      <td className="px-4 py-3">
                        {docCount > 0 ? (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                            {docCount}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {msgCount > 0 ? (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300">
                            {msgCount}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/carrier/stops/${stop.id}`}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          View <ExternalLink className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
