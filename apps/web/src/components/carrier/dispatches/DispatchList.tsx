'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, RefreshCw, ClipboardList } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { DispatchCard } from './DispatchCard';
import { NewDispatchForm } from './NewDispatchForm';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DispatchItem {
  id: string;
  status: string;
  notes: string | null;
  primaryDriverId: string;
  truckId: string;
  scheduledDeparture: string;
  _count: { stops: number };
  completedStopsCount: number;
}

interface LoadItem {
  id: string;
  dispatchId: string | null;
  clientId: string;
  client: { name: string } | null;
}

interface DispatchListProps {
  driverMap: Record<string, string>;
  truckMap: Record<string, string>;
  userRole?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTodayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

function getTomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(23, 59, 59, 999);
  return d.toISOString().split('T')[0];
}

const ALL_STATUSES = ['planned', 'in_progress', 'completed', 'cancelled', 'tonu'];

const STATUS_LABEL: Record<string, string> = {
  planned: 'Planned',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  tonu: 'TONU',
};

const STATUS_ACTIVE_CLASS: Record<string, string> = {
  planned: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200 border-slate-400',
  in_progress: 'bg-blue-200 text-blue-800 dark:bg-blue-800 dark:text-blue-100 border-blue-500',
  completed: 'bg-green-200 text-green-800 dark:bg-green-800 dark:text-green-100 border-green-500',
  cancelled: 'bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-100 border-red-500',
  tonu: 'bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-100 border-amber-500',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DispatchList({ driverMap, truckMap, userRole }: DispatchListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [dispatches, setDispatches] = useState<DispatchItem[]>([]);
  const [clientNames, setClientNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState(getTodayISO());
  const [dateTo, setDateTo] = useState(getTomorrowISO());
  const [needsAssignment, setNeedsAssignment] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [sheetOpen, setSheetOpen] = useState(() => searchParams.get('new') === 'true');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch dispatches with date range
      const params = new URLSearchParams();
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo + 'T23:59:59');
      if (needsAssignment) params.set('needs_assignment', 'true');
      params.set('pageSize', '200');

      const [dispatchRes, loadsRes] = await Promise.all([
        fetch(`/api/v1/carrier/dispatches?${params.toString()}`),
        fetch(`/api/v1/carrier/loads?date_from=${dateFrom}&date_to=${dateTo}&pageSize=200`),
      ]);

      if (!dispatchRes.ok) throw new Error('Failed to load dispatches');

      const dispatchData = await dispatchRes.json();
      const items = (dispatchData.data?.items ?? []) as DispatchItem[];
      setDispatches(items);

      // Build client name lookup from loads
      if (loadsRes.ok) {
        const loadsData = await loadsRes.json();
        const loadItems = (loadsData.data?.items ?? []) as LoadItem[];

        // Map dispatchId -> set of client names
        const dispatchClientMap: Record<string, Set<string>> = {};
        for (const load of loadItems) {
          if (!load.dispatchId) continue;
          if (!dispatchClientMap[load.dispatchId]) {
            dispatchClientMap[load.dispatchId] = new Set();
          }
          if (load.client?.name) {
            dispatchClientMap[load.dispatchId].add(load.client.name);
          }
        }

        // Flatten to string per dispatch
        const names: Record<string, string> = {};
        for (const [dispatchId, nameSet] of Object.entries(dispatchClientMap)) {
          names[dispatchId] = Array.from(nameSet).join(', ');
        }
        setClientNames(names);
      }

      setLastUpdated(new Date());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load dispatches');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, needsAssignment]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function toggleStatus(status: string) {
    setStatusFilter((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  }

  // Apply client-side status filter
  const filtered =
    statusFilter.length === 0
      ? dispatches
      : dispatches.filter((d) => statusFilter.includes(d.status));

  function handleNewDispatchSuccess(newId: string) {
    setSheetOpen(false);
    router.push(`/carrier/dispatches/${newId}`);
  }

  return (
    <div className="space-y-4">
      {/* Toolbar: filters + new button */}
      <div className="flex flex-col gap-3">
        {/* Top row: date range + new button */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground whitespace-nowrap">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground whitespace-nowrap">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {/* Needs Assignment toggle */}
          <div className="flex items-center gap-2">
            <Switch
              checked={needsAssignment}
              onCheckedChange={setNeedsAssignment}
              id="needs-assignment-toggle"
            />
            <label
              htmlFor="needs-assignment-toggle"
              className="text-sm text-muted-foreground cursor-pointer select-none"
            >
              Needs Assignment
            </label>
          </div>

          {/* Refresh */}
          <button
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {lastUpdated && (
            <span className="text-xs text-muted-foreground">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}

          {/* New Dispatch button */}
          <div className="sm:ml-auto">
            <button
              onClick={() => setSheetOpen(true)}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Dispatch
            </button>
          </div>
        </div>

        {/* Status filter toggles */}
        <div className="flex flex-wrap gap-2">
          {ALL_STATUSES.map((status) => {
            const active = statusFilter.includes(status);
            return (
              <button
                key={status}
                onClick={() => toggleStatus(status)}
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                  active
                    ? STATUS_ACTIVE_CLASS[status]
                    : 'border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                {STATUS_LABEL[status]}
              </button>
            );
          })}
          {statusFilter.length > 0 && (
            <button
              onClick={() => setStatusFilter([])}
              className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border border-border text-muted-foreground hover:bg-muted transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="grid gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-lg border bg-card p-4 animate-pulse">
              <div className="flex justify-between mb-3">
                <div className="h-4 w-32 bg-muted rounded" />
                <div className="h-4 w-20 bg-muted rounded-full" />
              </div>
              <div className="flex gap-2 mb-3">
                <div className="h-5 w-28 bg-muted rounded-full" />
                <div className="h-5 w-20 bg-muted rounded-full" />
              </div>
              <div className="h-2 bg-muted rounded-full mb-3" />
              <div className="flex justify-between">
                <div className="h-3 w-24 bg-muted rounded" />
                <div className="h-3 w-20 bg-muted rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <ClipboardList className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-semibold">No dispatches found</h3>
          <p className="mt-1 text-sm text-muted-foreground">Try adjusting your filters</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((d) => (
            <DispatchCard
              key={d.id}
              dispatch={d}
              driverName={driverMap[d.primaryDriverId] ?? 'Unassigned'}
              truckUnit={truckMap[d.truckId] ?? '—'}
              clientNames={clientNames[d.id] ?? ''}
            />
          ))}
        </div>
      )}

      {/* New Dispatch Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>New Dispatch</SheetTitle>
          </SheetHeader>
          <NewDispatchForm
            driverMap={driverMap}
            truckMap={truckMap}
            onSuccess={handleNewDispatchSuccess}
            onCancel={() => setSheetOpen(false)}
            userRole={userRole}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
