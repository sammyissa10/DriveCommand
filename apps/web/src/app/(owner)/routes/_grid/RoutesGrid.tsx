'use client';

/**
 * RoutesGrid Component
 *
 * DataGrid-based routes list with:
 * - Responsive table/card views
 * - Search filter
 * - Row selection with quick actions
 * - Server action for delete
 */

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  type SortingState,
  type ColumnFiltersState,
} from '@tanstack/react-table';
import { Eye, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { GridShell, QuickActions } from '@/components/data-grid/shell';
import type { QuickAction } from '@/components/data-grid/shell';
import { routesColumns } from './columns';
import type { RouteRow } from './types';

interface RoutesGridProps {
  routes: RouteRow[];
  deleteAction?: (id: string) => Promise<{ success: boolean }>;
}

export function RoutesGrid({ routes: initialRoutes, deleteAction }: RoutesGridProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [routes, setRoutes] = useState(initialRoutes);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const table = useReactTable({
    data: routes,
    columns: routesColumns,
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
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row.id,
  });

  const rows = table.getRowModel().rows;

  // Handle delete with optimistic update
  const handleDelete = async (routeId: string) => {
    if (!deleteAction) {
      toast.error('Delete not available');
      return;
    }

    // Optimistic removal
    const routeToDelete = routes.find((r) => r.id === routeId);
    setRoutes((prev) => prev.filter((r) => r.id !== routeId));

    startTransition(async () => {
      const result = await deleteAction(routeId);
      if (result?.success) {
        toast.success('Route deleted', {
          action: {
            label: 'Undo',
            onClick: () => {
              // TODO: Implement undo via server action
              toast.info('Undo not implemented');
            },
          },
        });
      } else {
        // Restore on error
        if (routeToDelete) {
          setRoutes((prev) => [...prev, routeToDelete]);
        }
        toast.error('Failed to delete route');
      }
    });
  };

  // Quick actions for each row
  const renderQuickActions = (row: RouteRow): React.ReactNode => {
    const actions: QuickAction[] = [
      {
        id: 'view',
        label: 'View',
        icon: Eye,
        onClick: () => router.push(`/routes/${row.id}`),
      },
      {
        id: 'edit',
        label: 'Edit',
        icon: Pencil,
        onClick: () => router.push(`/routes/${row.id}/edit`),
      },
      {
        id: 'delete',
        label: 'Delete',
        icon: Trash2,
        onClick: () => handleDelete(row.id),
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
          // TODO: Wire to bulk delete
          console.warn('Bulk delete not implemented');
        },
        destructive: true,
      },
    ],
    []
  );

  return (
    <GridShell
      gridId="routes-overview"
      table={table}
      rows={rows}
      isLoading={isPending}
      enableSelection
      selectedIds={selectedIds}
      onRowSelect={handleRowSelect}
      onRowDoubleClick={(row) => router.push(`/routes/${row.id}`)}
      renderQuickActions={renderQuickActions}
      search={globalFilter}
      onSearchChange={setGlobalFilter}
      searchPlaceholder="Search routes..."
      showNew
      onNew={() => router.push('/routes/new')}
      recordName="Route"
      bulkActions={bulkActions}
      onClearSelection={() => setSelectedIds(new Set())}
      primaryColumn="name"
      metadataColumns={['origin', 'destination', 'status']}
      statusColumn="status"
      pagination={{
        pageIndex: table.getState().pagination.pageIndex,
        pageSize: table.getState().pagination.pageSize,
        pageCount: table.getPageCount(),
        totalRows: routes.length,
        canPreviousPage: table.getCanPreviousPage(),
        canNextPage: table.getCanNextPage(),
        previousPage: () => table.previousPage(),
        nextPage: () => table.nextPage(),
        setPageSize: (size) => table.setPageSize(size),
      }}
    />
  );
}
