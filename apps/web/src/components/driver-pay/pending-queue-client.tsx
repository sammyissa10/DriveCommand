'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CheckCircle2 } from 'lucide-react';
import { ApprovalCard } from './approval-card';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type QueueRow = {
  id: string;
  driverId: string;
  driverName: string;
  loadId: string;
  loadNumber: string | null;
  payStatus: 'PENDING_REVIEW' | 'DISPUTED';
  paymentModel: string;
  totalPay: string;
  isOverride: boolean;
  overrideReason: string | null;
  ageDays: number;
  createdAt: string;
};

type Filters = {
  driverId: string;
  dateFrom: string;
  dateTo: string;
  minAmount: string;
  maxAmount: string;
  overrideOnly: boolean;
  sort: 'oldest' | 'newest' | 'amount_desc' | 'amount_asc';
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildQuery(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.driverId) params.set('driverId', filters.driverId);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.minAmount) params.set('minAmount', filters.minAmount);
  if (filters.maxAmount) params.set('maxAmount', filters.maxAmount);
  if (filters.overrideOnly) params.set('overrideOnly', 'true');
  if (filters.sort !== 'oldest') params.set('sort', filters.sort);
  return params.toString();
}

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

function FilterBar({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 border-b p-3">
      <div className="flex items-center gap-1.5">
        <Label htmlFor="sort-select" className="text-xs whitespace-nowrap">Sort</Label>
        <Select
          value={filters.sort}
          onValueChange={(v) => onChange({ ...filters, sort: v as Filters['sort'] })}
        >
          <SelectTrigger id="sort-select" className="h-7 w-[130px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="amount_desc">Highest pay</SelectItem>
            <SelectItem value="amount_asc">Lowest pay</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-1.5">
        <Label className="text-xs whitespace-nowrap">Min $</Label>
        <Input
          type="number"
          min="0"
          step="0.01"
          placeholder="0"
          className="h-7 w-20 text-xs"
          value={filters.minAmount}
          onChange={(e) => onChange({ ...filters, minAmount: e.target.value })}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <Label className="text-xs whitespace-nowrap">Max $</Label>
        <Input
          type="number"
          min="0"
          step="0.01"
          placeholder="∞"
          className="h-7 w-20 text-xs"
          value={filters.maxAmount}
          onChange={(e) => onChange({ ...filters, maxAmount: e.target.value })}
        />
      </div>
      <Button
        variant={filters.overrideOnly ? 'secondary' : 'outline'}
        size="sm"
        className="h-7 text-xs px-2"
        onClick={() => onChange({ ...filters, overrideOnly: !filters.overrideOnly })}
      >
        Overrides only
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <CheckCircle2 className="h-12 w-12 text-emerald-500" />
      <p className="text-base font-medium">All caught up.</p>
      <p className="text-sm text-muted-foreground">
        No pay items waiting for review.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Select prompt (right pane when nothing selected)
// ---------------------------------------------------------------------------

function SelectPrompt() {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
      Select a row to review the pay details.
    </div>
  );
}

// ---------------------------------------------------------------------------
// Queue row item
// ---------------------------------------------------------------------------

function QueueRowItem({
  row,
  isSelected,
  onSelect,
}: {
  row: QueueRow;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-3 border-b px-3 py-3 text-left transition hover:bg-muted/50 focus:outline-none focus:bg-muted',
        isSelected && 'bg-muted',
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{row.driverName}</span>
          {row.isOverride && (
            <Badge
              variant="outline"
              className="border-amber-500 text-amber-600 text-[10px] px-1.5 py-0 shrink-0"
            >
              Override
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          Load {row.loadNumber ?? '—'} &bull; {row.ageDays}d ago
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-mono text-sm">${row.totalPay}</div>
        <Badge
          variant={row.payStatus === 'DISPUTED' ? 'destructive' : 'secondary'}
          className={cn(
            'text-[10px] px-1.5 py-0',
            row.payStatus === 'PENDING_REVIEW' && 'bg-amber-100 text-amber-900',
          )}
        >
          {row.payStatus === 'DISPUTED' ? 'Disputed' : 'Pending'}
        </Badge>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main client component
// ---------------------------------------------------------------------------

export function PendingQueueClient() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({
    driverId: '',
    dateFrom: '',
    dateTo: '',
    minAmount: '',
    maxAmount: '',
    overrideOnly: false,
    sort: 'oldest',
  });

  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch queue rows
  const fetchRows = useCallback(async (f: Filters) => {
    setLoading(true);
    try {
      const qs = buildQuery(f);
      const res = await fetch(
        `/api/driver-pay/pending-queue${qs ? `?${qs}` : ''}`,
        { cache: 'no-store' },
      );
      if (!res.ok) return;
      const data: { assignments: QueueRow[] } = await res.json();
      setRows(data.assignments ?? []);
      // Auto-select first row if nothing selected
      setSelectedId((prev) => {
        if (prev && data.assignments.find((r) => r.id === prev)) return prev;
        return data.assignments[0]?.id ?? null;
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchRows(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced filter change
  const handleFiltersChange = useCallback(
    (f: Filters) => {
      setFilters(f);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fetchRows(f), 300);
    },
    [fetchRows],
  );

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Skip if inside an input / textarea / select
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }

      const currentIdx = rows.findIndex((r) => r.id === selectedId);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = Math.min(currentIdx + 1, rows.length - 1);
        if (next !== currentIdx) {
          setSelectedId(rows[next].id);
          // Scroll into view
          const listEl = listRef.current;
          if (listEl) {
            const child = listEl.children[next] as HTMLElement | undefined;
            child?.scrollIntoView({ block: 'nearest' });
          }
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = Math.max(currentIdx - 1, 0);
        if (prev !== currentIdx) {
          setSelectedId(rows[prev].id);
          const listEl = listRef.current;
          if (listEl) {
            const child = listEl.children[prev] as HTMLElement | undefined;
            child?.scrollIntoView({ block: 'nearest' });
          }
        }
      }
      // Note: A and D are handled by ApprovalCard's own buttons + keyboard hint in the header
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [rows, selectedId]);

  // Handle transition (approve or dispute completed)
  const handleTransition = useCallback((id: string) => {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.id === id);
      const next = prev.filter((r) => r.id !== id);
      // Auto-advance to next row (or previous if at end)
      setSelectedId(next[idx]?.id ?? next[idx - 1]?.id ?? next[0]?.id ?? null);
      return next;
    });
  }, []);

  const selectedRow = rows.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      {/* LEFT: filter bar + scrollable list */}
      <div className="flex flex-col overflow-hidden rounded-md border bg-card">
        <FilterBar filters={filters} onChange={handleFiltersChange} />
        <div className="flex-1 overflow-y-auto" ref={listRef}>
          {loading ? (
            <div className="space-y-2 p-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState />
          ) : (
            rows.map((row) => (
              <QueueRowItem
                key={row.id}
                row={row}
                isSelected={selectedId === row.id}
                onSelect={() => setSelectedId(row.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* RIGHT: approval card detail */}
      <div className="overflow-hidden rounded-md border bg-card">
        {selectedId && selectedRow ? (
          <ApprovalCard
            assignmentId={selectedId}
            row={selectedRow}
            onTransition={handleTransition}
          />
        ) : (
          <SelectPrompt />
        )}
      </div>
    </div>
  );
}
