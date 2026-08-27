'use client';

/**
 * DispatchesGrid Component
 *
 * DataGrid-based trips list with:
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
import { dispatchesColumns } from './columns';
import type { DispatchRow } from './types';
import { toTripListRow, type TripListApiItem } from '@/lib/carrier/trip-list-row';
import { useSoftDelete } from '@/hooks/useSoftDelete';
import { DeleteConfirmationDialog } from '@/components/shared/DeleteConfirmationDialog';

interface DispatchesGridProps {
  driverMap: Record<string, string>;
  truckMap: Record<string, string>;
  userRole?: string | null;
}

export function DispatchesGrid({ driverMap, truckMap, userRole }: DispatchesGridProps) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const {
    isPending: isDeletePending,
    dialogOpen,
    itemCount,
    itemName,
    requestDelete,
    confirmDelete,
    setDialogOpen,
  } = useSoftDelete({
    entityType: 'Trip',
    onSuccess: () => {
      setSelectedIds(new Set());
      fetchData();
    },
  });

  // Data fetching state
  const [dispatches, setDispatches] = useState<DispatchRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);

  // Fetch data from API
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page + 1));
      params.set('pageSize', String(pageSize));

      const res = await fetch(`/api/v1/carrier/dispatches?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load trips');

      const json = await res.json();
      const items = (json.data?.items ?? json.data ?? []) as TripListApiItem[];
      const tot = json.data?.total ?? items.length;

      // Payload → row mapping lives in one shared place (quick-557); the two
      // lanes of this page each had their own copy and both had drifted onto
      // legacy `Route` field names.
      const rows: DispatchRow[] = items.map((item) => toTripListRow(item, { driverMap, truckMap }));

      setDispatches(rows);
      setTotal(tot);
    } catch (error) {
      console.error('Error fetching trips:', error);
      setDispatches([]);
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, driverMap, truckMap]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const table = useReactTable({
    data: dispatches,
    columns: dispatchesColumns,
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
  const canCreate = userRole !== 'MANAGER';

  // Quick actions for each row
  const renderQuickActions = (row: DispatchRow): React.ReactNode => {
    const actions: QuickAction[] = [
      {
        id: 'view',
        label: 'View',
        icon: Eye,
        onClick: () => router.push(`/carrier/trips/${row.id}`),
      },
      {
        id: 'edit',
        label: 'Edit',
        icon: Pencil,
        onClick: () => router.push(`/carrier/trips/${row.id}`),
        disabled: row.status !== 'planned',
        disabledTooltip: 'Cannot edit an active or completed trip',
      },
    ];

    if (canCreate) {
      actions.push({
        id: 'delete',
        label: 'Delete',
        icon: Trash2,
        onClick: () => requestDelete(row.id),
        destructive: true,
      });
    }

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
    () =>
      canCreate
        ? [
            {
              id: 'delete',
              label: 'Delete',
              icon: Trash2,
              onClick: () => requestDelete(Array.from(selectedIds)),
              destructive: true,
            },
          ]
        : [],
    [canCreate, selectedIds, requestDelete]
  );

  const pageCount = Math.ceil(total / pageSize);

  return (
    <>
      <GridShell
      gridId="dispatches-overview"
      table={table}
      rows={rows}
      isLoading={isLoading}
      enableSelection
      selectedIds={selectedIds}
      onRowSelect={handleRowSelect}
      onRowDoubleClick={(row) => router.push(`/carrier/trips/${row.id}`)}
      renderQuickActions={renderQuickActions}
      search={globalFilter}
      onSearchChange={(value) => {
        setGlobalFilter(value);
        setPage(0);
      }}
      searchPlaceholder="Search trips..."
      showNew={canCreate}
      onNew={canCreate ? () => router.push('/carrier/trips/new') : undefined}
      recordName="Trip"
      bulkActions={bulkActions}
      onClearSelection={() => setSelectedIds(new Set())}
      primaryColumn="dispatchNumber"
      metadataColumns={['driverName', 'scheduledDate', 'status']}
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
      <DeleteConfirmationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConfirm={confirmDelete}
        itemCount={itemCount}
        itemName={itemName}
        isLoading={isDeletePending}
      />
    </>
  );
}
