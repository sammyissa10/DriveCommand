'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Package, Plus, X, Search, AlertTriangle, Bell, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LOAD_STATUS_BADGE: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  in_transit: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  delivered: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

const LOAD_STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const formatCurrency = (val: number | null | undefined) =>
  val != null
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val)
    : '—';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LoadItem {
  id: string;
  loadType: string;
  referenceNumber: string | null;
  status: string;
  totalRevenue: number | null;
  client: { name: string };
}

interface UnassignedLoad {
  id: string;
  referenceNumber: string | null;
  status: string;
  totalRevenue: number | null;
  client: { name: string };
}

interface DispatchLoadsPanelProps {
  loads: LoadItem[];
  dispatchId: string;
  dispatchStatus: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DispatchLoadsPanel({ loads, dispatchId, dispatchStatus }: DispatchLoadsPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showAttach, setShowAttach] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [unassignedLoads, setUnassignedLoads] = useState<UnassignedLoad[]>([]);
  const [searching, setSearching] = useState(false);

  // Confirmation dialog state
  const [confirmRemoveLoadId, setConfirmRemoveLoadId] = useState<string | null>(null);
  const loadToRemove = loads.find((l) => l.id === confirmRemoveLoadId);

  // Allow attaching loads during planned or in_transit (for backhaul use case)
  const canAttach = dispatchStatus === 'planned' || dispatchStatus === 'in_progress';
  // Only allow removing loads when trip is planned (before it starts)
  const canRemove = dispatchStatus === 'planned';
  const isInProgress = dispatchStatus === 'in_progress';

  async function fetchUnassigned(query: string) {
    setSearching(true);
    try {
      const params = new URLSearchParams({ status: 'pending', pageSize: '50' });
      const res = await fetch(`/api/v1/carrier/loads?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch loads');
      const json = await res.json() as { data: { items: Array<UnassignedLoad & { dispatchId?: string | null }> } };
      // Filter to only loads with no dispatchId and matching query
      const items = (json.data?.items ?? []).filter(
        (l) =>
          !l.dispatchId &&
          (
            !query.trim() ||
            (l.referenceNumber?.toLowerCase().includes(query.toLowerCase()) ||
              l.client?.name?.toLowerCase().includes(query.toLowerCase()))
          )
      );
      setUnassignedLoads(items);
    } catch {
      toast.error('Failed to fetch available loads');
    } finally {
      setSearching(false);
    }
  }

  function handleOpenAttach() {
    setShowAttach(true);
    fetchUnassigned('');
  }

  function handleSearch(q: string) {
    setSearchQuery(q);
    fetchUnassigned(q);
  }

  function handleRemoveClick(loadId: string) {
    setConfirmRemoveLoadId(loadId);
  }

  function handleConfirmRemove() {
    if (!confirmRemoveLoadId) return;
    const loadId = confirmRemoveLoadId;
    setConfirmRemoveLoadId(null);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/carrier/dispatches/${dispatchId}/remove-load`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ loadId }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? 'Failed to remove load');
        }
        toast.success('Load removed from trip', {
          description: isInProgress ? 'Driver has been notified of the change.' : undefined,
          icon: isInProgress ? <Bell className="h-4 w-4 text-blue-500" /> : undefined,
        });
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to remove load');
      }
    });
  }

  function handleAttach(loadId: string) {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/carrier/loads/${loadId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dispatchId }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? 'Failed to attach load');
        }
        toast.success('Load attached to trip', {
          description: isInProgress ? 'Driver has been notified of the new load.' : undefined,
          icon: isInProgress ? <Bell className="h-4 w-4 text-blue-500" /> : undefined,
        });
        setShowAttach(false);
        setSearchQuery('');
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to attach load');
      }
    });
  }

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Package className="h-4 w-4 text-muted-foreground" />
          Loads
          <span className="text-sm font-normal text-muted-foreground">({loads.length})</span>
        </h3>
        {canAttach && !showAttach && (
          <Button size="sm" variant="outline" onClick={handleOpenAttach}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Load
          </Button>
        )}
      </div>

      {/* Attach panel */}
      {showAttach && (
        <div className="rounded-md border bg-background p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Search Unassigned Loads</span>
            <button
              onClick={() => { setShowAttach(false); setSearchQuery(''); }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by reference # or client…"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {searching ? (
              <p className="text-xs text-muted-foreground text-center py-2">Searching…</p>
            ) : unassignedLoads.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">No unassigned pending loads found</p>
            ) : (
              unassignedLoads.map((l) => (
                <button
                  key={l.id}
                  disabled={isPending}
                  onClick={() => handleAttach(l.id)}
                  className="w-full flex items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-accent transition-colors text-left"
                >
                  <span>
                    <span className="font-medium">{l.referenceNumber ?? 'No ref'}</span>
                    <span className="text-muted-foreground ml-2">{l.client.name}</span>
                  </span>
                  {l.totalRevenue != null && (
                    <span className="text-muted-foreground text-xs">
                      {formatCurrency(l.totalRevenue)}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Load list */}
      {loads.length === 0 ? (
        <p className="text-sm text-muted-foreground">No loads attached to this trip.</p>
      ) : (
        <div className="space-y-2">
          {loads.map((load) => {
            const statusBadge = LOAD_STATUS_BADGE[load.status] ?? LOAD_STATUS_BADGE.pending;
            const statusLabel = LOAD_STATUS_LABEL[load.status] ?? load.status;
            return (
              <div
                key={load.id}
                className="flex items-center justify-between rounded-md border bg-background px-3 py-2.5 gap-3"
              >
                <Link
                  href={`/carrier/loads/${load.id}`}
                  className="min-w-0 group flex-1 hover:opacity-80 transition-opacity"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-foreground truncate">
                      {load.referenceNumber ?? 'No reference #'}
                    </span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                  </div>
                  <div className="text-xs text-muted-foreground">{load.client.name}</div>
                </Link>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge}`}>
                    {statusLabel}
                  </span>
                  {load.totalRevenue != null && (
                    <span className="text-sm font-medium text-foreground">
                      {formatCurrency(load.totalRevenue)}
                    </span>
                  )}
                  {canRemove && (
                    <button
                      onClick={() => handleRemoveClick(load.id)}
                      disabled={isPending}
                      title="Remove load from trip"
                      className="ml-1 rounded p-1 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label="Remove load from trip"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Remove Load Confirmation Dialog */}
      <AlertDialog open={!!confirmRemoveLoadId} onOpenChange={(open) => !open && setConfirmRemoveLoadId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Remove Load from Trip?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                This will remove <span className="font-medium text-foreground">{loadToRemove?.referenceNumber ?? 'this load'}</span> from the trip.
              </p>
              <div className="rounded-md bg-muted p-3 text-sm space-y-1.5">
                <p className="font-medium text-foreground">What happens:</p>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li>All pending stops for this load will be deleted</li>
                  <li>The load itself will <span className="text-foreground font-medium">not</span> be deleted</li>
                  <li>You can add this load to a different trip later</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRemove}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Remove Load
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
