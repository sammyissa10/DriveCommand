'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Plus, Package } from 'lucide-react';
import { SamplePill } from '@/components/onboarding/sample-pill';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LoadItem {
  id: string;
  referenceNumber: string;
  clientId: string;
  client: { name: string } | null;
  dispatchId: string | null;
  loadType: string;
  status: string;
  totalRevenue: string | null;
  dispatch: { id: string; notes: string | null } | null;
  isSample: boolean;
}

interface LoadListProps {
  clientMap: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractDispatchNumber(notes: string | null): string | null {
  if (!notes) return null;
  const match = notes.match(/\[DISPATCH_NUMBER=([^\]]+)\]/);
  return match ? match[1] : null;
}

const ALL_STATUSES = ['pending', 'in_transit', 'delivered', 'cancelled', 'invoiced'];

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  invoiced: 'Invoiced',
};

const STATUS_ACTIVE_CLASS: Record<string, string> = {
  pending:
    'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200 border-slate-400',
  in_transit:
    'bg-blue-200 text-blue-800 dark:bg-blue-800 dark:text-blue-100 border-blue-500',
  delivered:
    'bg-green-200 text-green-800 dark:bg-green-800 dark:text-green-100 border-green-500',
  cancelled:
    'bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-100 border-red-500',
  invoiced:
    'bg-purple-200 text-purple-800 dark:bg-purple-800 dark:text-purple-100 border-purple-500',
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  in_transit: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200',
  delivered: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200',
  invoiced: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200',
};

function formatCurrency(value: string | null | number): string {
  if (value == null) return '—';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
}

const PAGE_SIZE = 25;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LoadList({ clientMap }: LoadListProps) {
  const [loads, setLoads] = useState<LoadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [clientId, setClientId] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (clientId) params.set('client_id', clientId);
      if (statusFilter.length === 1) params.set('status', statusFilter[0]);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo + 'T23:59:59');
      params.set('page', String(page));
      params.set('pageSize', String(PAGE_SIZE));

      const res = await fetch(`/api/v1/carrier/loads?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load loads');

      const json = await res.json();
      const items = (json.data?.items ?? []) as LoadItem[];
      const tot = json.data?.total ?? 0;
      setLoads(items);
      setTotal(tot);
    } catch {
      setLoads([]);
    } finally {
      setLoading(false);
    }
  }, [clientId, statusFilter, dateFrom, dateTo, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function toggleStatus(status: string) {
    setStatusFilter((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
    setPage(1);
  }

  // Client-side filter for multi-status (API only supports single status)
  const displayed =
    statusFilter.length <= 1
      ? loads
      : loads.filter((l) => statusFilter.includes(l.status));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3">
        {/* Top row: client + date range + new button */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Client select */}
          <select
            value={clientId}
            onChange={(e) => { setClientId(e.target.value); setPage(1); }}
            className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">All Clients</option>
            {Object.entries(clientMap).map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>

          {/* Date From */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground whitespace-nowrap">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {/* Date To */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground whitespace-nowrap">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {/* New Load button */}
          <div className="ml-auto">
            <Link
              href="/carrier/loads/new"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Load
            </Link>
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
              onClick={() => { setStatusFilter([]); setPage(1); }}
              className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border border-border text-muted-foreground hover:bg-muted transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Load #</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Client</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Dispatch</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Total</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <tr key={i} className="border-b animate-pulse">
                  <td className="px-4 py-3"><div className="h-4 w-24 bg-muted rounded" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-32 bg-muted rounded" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-20 bg-muted rounded" /></td>
                  <td className="px-4 py-3"><div className="h-5 w-12 bg-muted rounded-full" /></td>
                  <td className="px-4 py-3"><div className="h-5 w-20 bg-muted rounded-full" /></td>
                  <td className="px-4 py-3 text-right"><div className="h-4 w-20 bg-muted rounded ml-auto" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : displayed.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Package className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-semibold">No loads found</h3>
          <p className="mt-1 text-sm text-muted-foreground">Try adjusting your filters or create a new load</p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Load #</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Client</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Dispatch</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Total</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((load) => (
                <tr
                  key={load.id}
                  className="border-b hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => { window.location.href = `/carrier/loads/${load.id}`; }}
                >
                  <td className="px-4 py-3 font-mono text-xs font-medium">
                    <div className="flex items-center gap-1">
                      <Link
                        href={`/carrier/loads/${load.id}`}
                        className="hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {load.referenceNumber}
                      </Link>
                      {load.isSample && <SamplePill />}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/carrier/clients/${load.clientId}`}
                      className="hover:underline text-foreground"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {load.client?.name ?? clientMap[load.clientId] ?? 'Unknown'}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {load.dispatchId ? (
                      <Link
                        href={`/carrier/dispatches/${load.dispatchId}`}
                        className="hover:underline text-foreground font-mono text-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {extractDispatchNumber(load.dispatch?.notes ?? null) ?? load.dispatchId.slice(0, 8)}
                      </Link>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                        Unassigned
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium uppercase">
                      {load.loadType}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[load.status] ?? 'bg-muted text-muted-foreground'}`}
                    >
                      {STATUS_LABEL[load.status] ?? load.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">
                    {formatCurrency(load.totalRevenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Page {page} of {totalPages} ({total} total)</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="inline-flex items-center rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="inline-flex items-center rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
