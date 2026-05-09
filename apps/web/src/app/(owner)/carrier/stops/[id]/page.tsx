export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getSession } from '@/lib/auth/supabase';
import { getStop } from '@/lib/carrier/stops';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { StopDocumentsSection } from '@/components/carrier/stops/StopDocumentsSection';
import { StopDetailMessages } from '@/components/carrier/stops/StopDetailMessages';
import { StopDetailTimestampEditor } from '@/components/carrier/stops/StopDetailTimestampEditor';

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


function formatDateTime(dt: Date | null): string {
  if (!dt) return '---';
  return dt.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function computeDwell(arrivedAt: Date | null, departedAt: Date | null): string {
  if (!arrivedAt || !departedAt) return '---';
  const mins = Math.floor((departedAt.getTime() - arrivedAt.getTime()) / 60000);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

function extractDispatchNumber(notes: string | null): string {
  if (!notes) return '—';
  const match = notes.match(/\[DISPATCH_NUMBER=([^\]]+)\]/);
  return match ? match[1] : '—';
}

export default async function StopDetailPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect('/login');

  if (session.role !== 'OWNER' && session.role !== 'MANAGER') {
    redirect('/carrier/dashboard');
  }

  const { id } = await params;
  const orgId = session.tenantId;
  if (!orgId) redirect('/login');

  const stop = await getStop(orgId, id);
  if (!stop) notFound();

  // Fetch dispatch details with primary driver userId
  const dispatch = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    return tx.carrierDispatch.findFirst({
      where: { id: stop.dispatchId, orgId },
      select: {
        id: true,
        notes: true,
        status: true,
        primaryDriver: {
          select: { id: true, firstName: true, lastName: true, userId: true },
        },
      },
    });
  }, TX_OPTIONS);

  if (!dispatch) notFound();

  // Fetch load if linked
  const load = stop.loadId
    ? await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        return tx.carrierLoad.findFirst({
          where: { id: stop.loadId!, orgId },
          select: { id: true, referenceNumber: true, bolNumber: true },
        });
      }, TX_OPTIONS)
    : null;

  // Fetch documents with uploader names
  const documents = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    const docs = await tx.carrierDocument.findMany({
      where: { stopId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        documentType: true,
        filename: true,
        fileSizeBytes: true,
        fileUrl: true,
        uploadedBy: true,
        createdAt: true,
      },
    });

    // Resolve uploader names
    const uploaderIds = [...new Set(docs.map((d) => d.uploadedBy).filter(Boolean) as string[])];
    const uploaderMap = new Map<string, string>();
    if (uploaderIds.length) {
      const users = await tx.user.findMany({
        where: { id: { in: uploaderIds } },
        select: { id: true, firstName: true, lastName: true, email: true },
      });
      for (const u of users) {
        uploaderMap.set(u.id, [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email);
      }
    }

    return docs.map((d) => ({
      ...d,
      uploaderName: d.uploadedBy ? (uploaderMap.get(d.uploadedBy) ?? 'Unknown') : null,
      createdAt: d.createdAt.toISOString(),
    }));
  }, TX_OPTIONS);

  const dispatchNumber = extractDispatchNumber(dispatch.notes ?? null);
  const driverUserId = dispatch.primaryDriver.userId ?? null;

  const typeBadgeClass = STOP_TYPE_BADGE[stop.stopType] ?? STOP_TYPE_BADGE.waypoint;
  const statusBadgeClass = STOP_STATUS_BADGE[stop.status] ?? STOP_STATUS_BADGE.pending;
  const typeLabel = stop.stopType.charAt(0).toUpperCase() + stop.stopType.slice(1);
  const statusLabel = stop.status.charAt(0).toUpperCase() + stop.status.slice(1);
  const dwell = computeDwell(stop.arrivedAt, stop.departedAt);

  // Detect existing BOL/POD uploads
  const bolUploaded = documents.some((d) => d.documentType === 'bol');
  const podUploaded = documents.some((d) => d.documentType === 'pod');

  return (
    <div className="space-y-6">
      {/* Back link */}
      <div>
        <Link
          href={`/carrier/dispatches/${stop.dispatchId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dispatch
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${typeBadgeClass}`}>
          {typeLabel}
        </span>
        <h1 className="text-2xl font-bold text-foreground">
          Stop #{stop.sequenceOrder}
        </h1>
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass}`}>
          {statusLabel}
        </span>
      </div>

      {/* Facility name + address */}
      {stop.facility && (
        <div>
          <h2 className="text-xl font-bold text-foreground">{stop.facility.name}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {[stop.facility.addressLine1, stop.facility.city, stop.facility.state, stop.facility.zip]
              .filter(Boolean)
              .join(', ')}
          </p>
        </div>
      )}

      {/* Linked entity chips */}
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/carrier/dispatches/${stop.dispatchId}`}
          className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium bg-muted hover:bg-muted/80 text-foreground border border-border transition-colors"
        >
          Dispatch: {dispatchNumber}
        </Link>
        {load && (
          <Link
            href={`/carrier/loads/${load.id}`}
            className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium bg-muted hover:bg-muted/80 text-foreground border border-border transition-colors"
          >
            Load: {load.referenceNumber ?? load.bolNumber ?? load.id.slice(0, 8)}
          </Link>
        )}
        {stop.facility && (
          <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium bg-muted text-muted-foreground border border-border">
            {stop.facility.name}
          </span>
        )}
      </div>

      {/* Info grid */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">Stop Details</h3>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
          <div>
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Appointment Start</dt>
            <dd className="mt-1 text-sm text-foreground">{formatDateTime(stop.appointmentStart)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Appointment End</dt>
            <dd className="mt-1 text-sm text-foreground">{formatDateTime(stop.appointmentEnd)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Arrived At</dt>
            <dd className="mt-1 text-sm text-foreground flex items-center gap-2">
              {formatDateTime(stop.arrivedAt)}
              <StopDetailTimestampEditor
                stopId={id}
                field="arrivedAt"
                currentValue={stop.arrivedAt?.toISOString() ?? null}
                label="Edit Arrived"
              />
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Departed At</dt>
            <dd className="mt-1 text-sm text-foreground flex items-center gap-2">
              {formatDateTime(stop.departedAt)}
              <StopDetailTimestampEditor
                stopId={id}
                field="departedAt"
                currentValue={stop.departedAt?.toISOString() ?? null}
                label="Edit Departed"
              />
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dwell Time</dt>
            <dd className="mt-1 text-sm text-foreground">{dwell}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">BOL Required</dt>
            <dd className="mt-1 text-sm text-foreground">
              {stop.bolRequired ? (bolUploaded ? 'Yes (Uploaded)' : 'Yes (Not Uploaded)') : 'No'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">POD Required</dt>
            <dd className="mt-1 text-sm text-foreground">
              {stop.podRequired ? (podUploaded ? 'Yes (Uploaded)' : 'Yes (Not Uploaded)') : 'No'}
            </dd>
          </div>
          {stop.commodityDescription && (
            <div className="md:col-span-2">
              <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Commodity</dt>
              <dd className="mt-1 text-sm text-foreground">{stop.commodityDescription}</dd>
            </div>
          )}
          {(stop.pieces != null || stop.weightLbs != null) && (
            <div>
              <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pieces / Weight</dt>
              <dd className="mt-1 text-sm text-foreground">
                {[
                  stop.pieces != null ? `${stop.pieces} pcs` : null,
                  stop.weightLbs != null ? `${Number(stop.weightLbs).toLocaleString()} lbs` : null,
                ]
                  .filter(Boolean)
                  .join(' / ') || '---'}
              </dd>
            </div>
          )}
          {stop.specialInstructions && (
            <div className="md:col-span-2">
              <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Special Instructions</dt>
              <dd className="mt-1 text-sm text-foreground italic">{stop.specialInstructions}</dd>
            </div>
          )}
          {(stop.contactName || stop.contactPhone) && (
            <div>
              <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contact</dt>
              <dd className="mt-1 text-sm text-foreground">
                {[stop.contactName, stop.contactPhone].filter(Boolean).join(' · ')}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Documents section */}
      <StopDocumentsSection
        stopId={id}
        dispatchId={stop.dispatchId}
        loadId={stop.loadId ?? undefined}
        documents={documents}
      />

      {/* Messages section */}
      <StopDetailMessages stopId={id} driverUserId={driverUserId} />
    </div>
  );
}
