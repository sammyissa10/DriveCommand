'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Package, Plus, X, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

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

  const canAttach = dispatchStatus === 'planned' || dispatchStatus === 'in_progress';

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
        toast.success('Load attached to dispatch');
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
            Attach Load
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
        <p className="text-sm text-muted-foreground">No loads attached to this dispatch.</p>
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
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    {load.referenceNumber ?? 'No reference #'}
                  </div>
                  <div className="text-xs text-muted-foreground">{load.client.name}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge}`}>
                    {statusLabel}
                  </span>
                  {load.totalRevenue != null && (
                    <span className="text-sm font-medium text-foreground">
                      {formatCurrency(load.totalRevenue)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
