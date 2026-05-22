'use client';

/**
 * LoadsGrid Component
 *
 * DataGrid-based loads list with:
 * - Responsive table/card views
 * - Search and status filter
 * - Row selection with quick actions
 * - Server-side pagination via API
 */

import { useRouter } from 'next/navigation';
import { useMemo, useState, useCallback, useEffect } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  type ColumnFiltersState,
} from '@tanstack/react-table';
import { Eye, Pencil, Trash2 } from 'lucide-react';
import { GridShell, QuickActions } from '@/components/data-grid/shell';
import type { QuickAction } from '@/components/data-grid/shell';
import { loadsColumns } from './columns';
import type { LoadRow } from './types';

interface LoadsGridProps {
  clientMap: Record<string, string>;
}

interface ApiLoad {
  id: string;
  referenceNumber: string;
  clientId: string;
  client: { name: string } | null;
  dispatchId: string | null;
  dispatch: { id: string; notes: string | null } | null;
  loadType: string;
  status: string;
  totalRevenue: string | null;
  isSample: boolean;
}

function extractDispatchNumber(notes: string | null): string | null {
  if (!notes) return null;
  const match = notes.match(/\[DISPATCH_NUMBER=([^\]]+)\]/);
  return match ? match[1] : null;
}

export function LoadsGrid({ clientMap }: LoadsGridProps) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Data fetching state
  const [loads, setLoads] = useState<LoadRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);

  // Fetch data from API
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (globalFilter) params.set('search', globalFilter);
      params.set('page', String(page + 1)); // API is 1-indexed
      params.set('pageSize', String(pageSize));

      const res = await fetch(`/api/v1/carrier/loads?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load loads');

      const json = await res.json();
      const items = (json.data?.items ?? []) as ApiLoad[];
      const tot = json.data?.total ?? 0;

      // Transform to LoadRow format
      const rows: LoadRow[] = items.map((item) => ({
        id: item.id,
        referenceNumber: item.referenceNumber,
        clientId: item.clientId,
        clientName: item.client?.name || clientMap[item.clientId] || 'Unknown',
        dispatchId: item.dispatchId,
        dispatchNumber: item.dispatch ? extractDispatchNumber(item.dispatch.notes) : null,
        loadType: item.loadType,
        status: item.status,
        totalRevenue: item.totalRevenue,
        isSample: item.isSample,
      }));

      setLoads(rows);
      setTotal(tot);
    } catch (error) {
      console.error('Error fetching loads:', error);
      setLoads([]);
    } finally {
      setIsLoading(false);
    }
  }, [globalFilter, page, pageSize, clientMap]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const table = useReactTable({
    data: loads,
    columns: loadsColumns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    pageCount: Math.ceil(total / pageSize),
    getRowId: (row) => row.id,
  });

  const rows = table.getRowModel().rows;

  // Quick actions for each row
  const renderQuickActions = (row: LoadRow): React.ReactNode => {
    const actions: QuickAction[] = [
      {
        id: 'view',
        label: 'View',
        icon: Eye,
        onClick: () => router.push(`/carrier/loads/${row.id}`),
      },
      {
        id: 'edit',
        label: 'Edit',
        icon: Pencil,
        onClick: () => router.push(`/carrier/loads/${row.id}/edit`),
      },
      {
        id: 'delete',
        label: 'Delete',
        icon: Trash2,
        onClick: () => {
          // TODO: Wire to delete mutation
          console.warn('Delete not implemented');
        },
        destructive: true,
      },
    ];
    return <QuickActions actions={actions} />;
  };

  // Row selection handler
  const handleRowSelect = (rowId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  // Bulk actions
  const bulkActions = useMemo(
    () => [
      {
        id: 'delete',
        label: 'Delete',
        icon: Trash2,
        onClick: () => {
          // TODO: Wire to bulk delete mutation
          console.warn('Bulk delete not implemented');
        },
        destructive: true,
      },
    ],
    []
  );

  const pageCount = Math.ceil(total / pageSize);

  return (
    <GridShell
      gridId="loads-overview"
      table={table}
      rows={rows}
      isLoading={isLoading}
      enableSelection
      selectedIds={selectedIds}
      onRowSelect={handleRowSelect}
      onRowDoubleClick={(row) => router.push(`/carrier/loads/${row.id}`)}
      renderQuickActions={renderQuickActions}
      search={globalFilter}
      onSearchChange={(value) => {
        setGlobalFilter(value);
        setPage(0); // Reset to first page on search
      }}
      searchPlaceholder="Search by reference #, client..."
      showNew
      onNew={() => router.push('/carrier/loads/new')}
      recordName="Load"
      bulkActions={bulkActions}
      onClearSelection={() => setSelectedIds(new Set())}
      primaryColumn="referenceNumber"
      metadataColumns={['clientName', 'status', 'totalRevenue']}
      statusColumn="status"
      pagination={{
        pageIndex: page,
        pageSize: pageSize,
        pageCount: pageCount,
        totalRows: total,
        canPreviousPage: page > 0,
        canNextPage: page < pageCount - 1,
        previousPage: () => setPage((p) => Math.max(0, p - 1)),
        nextPage: () => setPage((p) => Math.min(pageCount - 1, p + 1)),
        setPageSize: (size) => {
          setPageSize(size);
          setPage(0);
        },
      }}
    />
  );
}
