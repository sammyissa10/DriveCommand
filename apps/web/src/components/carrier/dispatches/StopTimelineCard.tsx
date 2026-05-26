'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { StopDocumentList } from './StopDocumentList';
import { StopEditModal } from './StopEditModal';
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  MapPin,
  SkipForward,
  Check,
  ExternalLink,
  Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { DocumentUploadModal } from '@/components/carrier/documents/DocumentUploadModal';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STOP_STATUS_DOT: Record<string, string> = {
  pending: 'bg-muted-foreground/40 border-muted-foreground/40',
  arrived: 'bg-blue-500 border-blue-500',
  completed: 'bg-green-500 border-green-500',
  skipped: 'bg-yellow-500 border-yellow-500',
};

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

function formatAppt(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const s = new Date(start);
  const sStr = s.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) +
    ', ' +
    s.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (!end) return sStr;
  const e = new Date(end);
  const eStr = e.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${sStr} — ${eStr}`;
}

function formatTs(ts: string | null): string | null {
  if (!ts) return null;
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function computeDwell(arrivedAt: string | null, departedAt: string | null): number | null {
  if (!arrivedAt || !departedAt) return null;
  const diff = new Date(departedAt).getTime() - new Date(arrivedAt).getTime();
  return Math.floor(diff / 60000);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StopItem {
  id: string;
  sequenceOrder: number;
  stopType: string;
  facilityId: string;
  appointmentStart: string | null;
  appointmentEnd: string | null;
  arrivedAt: string | null;
  departedAt: string | null;
  status: string;
  skipReason: string | null;
  bolNumber: string | null;
  podNumber: string | null;
  contactName: string | null;
  contactPhone: string | null;
  specialInstructions: string | null;
  notes: string | null;
}

interface StopTimelineCardProps {
  stop: StopItem;
  sequenceNumber: number;
  bolRequired: boolean;
  podRequired: boolean;
  bolUploaded: boolean;
  podUploaded: boolean;
  facility: { name: string; addressLine1: string | null; city: string | null; state: string | null } | null;
  dispatchStatus: string;
  userRole: string;
  canManage: boolean;
  dispatchId?: string;
  loadId?: string;
  onStopUpdated?: () => void;
  messageCount?: number;
  docCount?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StopTimelineCard({
  stop,
  sequenceNumber,
  bolRequired,
  podRequired,
  bolUploaded,
  podUploaded,
  facility,
  dispatchStatus,
  userRole,
  canManage,
  dispatchId,
  loadId,
  onStopUpdated,
  messageCount = 0,
  docCount = 0,
}: StopTimelineCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [skipReason, setSkipReason] = useState('');
  const [skipDialogOpen, setSkipDialogOpen] = useState(false);
  const [docRefreshKey, setDocRefreshKey] = useState(0);
  const [editModalOpen, setEditModalOpen] = useState(false);

  const dotClass = STOP_STATUS_DOT[stop.status] ?? STOP_STATUS_DOT.pending;
  const statusBadgeClass = STOP_STATUS_BADGE[stop.status] ?? STOP_STATUS_BADGE.pending;
  const typeBadgeClass = STOP_TYPE_BADGE[stop.stopType] ?? STOP_TYPE_BADGE.waypoint;
  const statusLabel = stop.status.charAt(0).toUpperCase() + stop.status.slice(1);
  const typeLabel = stop.stopType.charAt(0).toUpperCase() + stop.stopType.slice(1);

  const apptStr = formatAppt(stop.appointmentStart, stop.appointmentEnd);
  const arrivedStr = formatTs(stop.arrivedAt);
  const departedStr = formatTs(stop.departedAt);
  const dwell = computeDwell(stop.arrivedAt, stop.departedAt);

  const isPickupOrDelivery = stop.stopType === 'pickup' || stop.stopType === 'delivery';

  const isStopPending = stop.status === 'pending' && dispatchStatus === 'in_progress';
  const isStopArrived = stop.status === 'arrived' && dispatchStatus === 'in_progress';

  // Allow editing stops when trip is planned or in_progress and stop is not completed/skipped
  const canEdit = canManage &&
    (dispatchStatus === 'planned' || dispatchStatus === 'in_progress') &&
    stop.status !== 'completed' && stop.status !== 'skipped';

  // Document compliance guard for Complete Stop
  const missingDocs =
    (stop.stopType === 'pickup' && bolRequired && !bolUploaded) ||
    (stop.stopType === 'delivery' && podRequired && !podUploaded);

  const canComplete = isStopArrived && !missingDocs;

  const canSkip = (isStopPending || isStopArrived) && canManage;

  function handleArrive() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/carrier/stops/${stop.id}/arrived`, {
          method: 'PATCH',
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? 'Failed to mark arrived');
        }
        toast.success('Marked as arrived');
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to mark arrived');
      }
    });
  }

  function handleComplete() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/carrier/stops/${stop.id}/complete`, {
          method: 'PATCH',
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? 'Failed to complete stop');
        }
        toast.success('Stop completed');
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to complete stop');
      }
    });
  }

  function handleSkipConfirm() {
    if (!skipReason.trim()) {
      toast.error('Skip reason is required');
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/carrier/stops/${stop.id}/skip`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ skip_reason: skipReason }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? 'Failed to skip stop');
        }
        toast.success('Stop skipped');
        setSkipDialogOpen(false);
        setSkipReason('');
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to skip stop');
      }
    });
  }

  return (
    <div className="relative pl-14">
      {/* Sequence circle */}
      <div
        className={`absolute left-0 top-3 w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm font-bold bg-background ${dotClass}`}
      >
        {stop.status === 'completed' ? (
          <Check className="h-4 w-4 text-white" />
        ) : (
          <span className="text-foreground">{sequenceNumber}</span>
        )}
      </div>

      {/* Card */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        {/* Top row: type badge + status badge */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${typeBadgeClass}`}>
              {typeLabel}
            </span>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass}`}>
              {statusLabel}
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {canEdit && (
              <Button
                size="sm"
                variant="ghost"
                disabled={isPending}
                onClick={() => setEditModalOpen(true)}
                className="h-7 text-xs"
                title="Edit stop"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            {isStopPending && (
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={handleArrive}
                className="h-7 text-xs"
              >
                <MapPin className="h-3.5 w-3.5 mr-1" />
                {isPending ? 'Saving…' : 'Mark Arrived'}
              </Button>
            )}

            {isStopArrived && (
              <Button
                size="sm"
                variant="outline"
                disabled={isPending || !canComplete}
                title={
                  missingDocs ? 'Required documents must be uploaded first' : undefined
                }
                onClick={handleComplete}
                className="h-7 text-xs"
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                {isPending ? 'Saving…' : 'Complete Stop'}
              </Button>
            )}

            {canSkip && (
              <AlertDialog open={skipDialogOpen} onOpenChange={setSkipDialogOpen}>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    className="h-7 text-xs text-yellow-600 border-yellow-300 hover:bg-yellow-50 dark:hover:bg-yellow-900/20"
                  >
                    <SkipForward className="h-3.5 w-3.5 mr-1" />
                    Skip
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Skip Stop #{sequenceNumber}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Provide a reason for skipping this stop. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <textarea
                    className="w-full rounded-md border border-input bg-background p-2 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Enter skip reason…"
                    value={skipReason}
                    onChange={(e) => setSkipReason(e.target.value)}
                  />
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setSkipReason('')}>Cancel</AlertDialogCancel>
                    <Button
                      disabled={!skipReason.trim() || isPending}
                      onClick={handleSkipConfirm}
                      className="bg-yellow-600 hover:bg-yellow-700 text-white"
                    >
                      {isPending ? 'Skipping…' : 'Skip Stop'}
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        {/* Facility + address + count badges */}
        {facility && (
          <div>
            <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              {facility.name}
              {docCount > 0 && (
                <span className="ml-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                  {docCount} doc{docCount !== 1 ? 's' : ''}
                </span>
              )}
              {messageCount > 0 && (
                <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300">
                  {messageCount} msg{messageCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {(facility.addressLine1 || facility.city) && (
              <p className="text-xs text-muted-foreground ml-5 mt-0.5">
                {[facility.addressLine1, facility.city, facility.state].filter(Boolean).join(', ')}
              </p>
            )}
          </div>
        )}

        {/* Appointment window */}
        {apptStr && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{apptStr}</span>
          </div>
        )}

        {/* Timestamps + dwell */}
        {(arrivedStr || departedStr) && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground">Arrived: </span>
              <span className="text-foreground">{arrivedStr ?? '—'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Departed: </span>
              <span className="text-foreground">{departedStr ?? '—'}</span>
            </div>
            {dwell != null && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Dwell: </span>
                <span className="text-foreground">{dwell} min</span>
              </div>
            )}
          </div>
        )}

        {/* Skip reason */}
        {stop.skipReason && (
          <div className="text-xs text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 rounded px-2 py-1">
            <span className="font-medium">Skip reason: </span>{stop.skipReason}
          </div>
        )}

        {/* Document compliance — pickup/delivery only */}
        {isPickupOrDelivery && (
          <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-border">
            {stop.stopType === 'pickup' && (
              <div className="flex items-center gap-1.5">
                {bolRequired ? (
                  bolUploaded ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                  )
                ) : (
                  <span className="h-3.5 w-3.5 text-muted-foreground/40">—</span>
                )}
                <span className="text-xs text-muted-foreground">
                  BOL{' '}
                  {bolRequired
                    ? bolUploaded
                      ? '(uploaded)'
                      : '(required)'
                    : '(optional)'}
                </span>
                <DocumentUploadModal
                  parentType="stop"
                  parentId={stop.id}
                  documentType="bol"
                  dispatchId={dispatchId}
                  loadId={loadId}
                  onSuccess={() => { router.refresh(); onStopUpdated?.(); setDocRefreshKey(k => k + 1); }}
                />
              </div>
            )}

            {stop.stopType === 'delivery' && (
              <div className="flex items-center gap-1.5">
                {podRequired ? (
                  podUploaded ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                  )
                ) : (
                  <span className="h-3.5 w-3.5 text-muted-foreground/40">—</span>
                )}
                <span className="text-xs text-muted-foreground">
                  POD{' '}
                  {podRequired
                    ? podUploaded
                      ? '(uploaded)'
                      : '(required)'
                    : '(optional)'}
                </span>
                <DocumentUploadModal
                  parentType="stop"
                  parentId={stop.id}
                  documentType="pod"
                  dispatchId={dispatchId}
                  loadId={loadId}
                  onSuccess={() => { router.refresh(); onStopUpdated?.(); setDocRefreshKey(k => k + 1); }}
                />
              </div>
            )}
            <StopDocumentList
              stopId={stop.id}
              canManage={canManage}
              refreshKey={docRefreshKey}
              onDeleted={() => { router.refresh(); onStopUpdated?.(); }}
            />
          </div>
        )}

        {/* View Details link */}
        <div className="flex justify-end pt-1">
          <Link
            href={`/carrier/stops/${stop.id}`}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            View Details <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Edit Stop Modal */}
      <StopEditModal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        stop={{
          id: stop.id,
          contactName: stop.contactName,
          contactPhone: stop.contactPhone,
          appointmentStart: stop.appointmentStart,
          appointmentEnd: stop.appointmentEnd,
          specialInstructions: stop.specialInstructions,
        }}
        dispatchStatus={dispatchStatus}
      />
    </div>
  );
}
