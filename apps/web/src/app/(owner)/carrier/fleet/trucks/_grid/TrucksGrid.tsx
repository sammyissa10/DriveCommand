'use client';

/**
 * TrucksGrid Component
 *
 * DataGrid-based trucks list with:
 * - Responsive table/card views
 * - Search and filters (status, type)
 * - Row selection with quick actions
 * - Expiration urgency badges
 * - Mobile FAB for create
 */

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
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
import { GridShell, QuickActions } from '@/components/data-grid/shell';
import type { QuickAction } from '@/components/data-grid/shell';
import { trucksColumns } from './columns';
import type { TruckRow } from './types';

interface TrucksGridProps {
  trucks: TruckRow[];
}

export function TrucksGrid({ trucks }: TrucksGridProps) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const table = useReactTable({
    data: trucks,
    columns: trucksColumns,
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

  // Quick actions for each row
  const renderQuickActions = (row: TruckRow): React.ReactNode => {
    const actions: QuickAction[] = [
      {
        id: 'view',
        label: 'View',
        icon: Eye,
        onClick: () => router.push(`/carrier/fleet/trucks/${row.id}`),
      },
      {
        id: 'edit',
        label: 'Edit',
        icon: Pencil,
        onClick: () => router.push(`/carrier/fleet/trucks/${row.id}/edit`),
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

  return (
    <GridShell
      gridId="trucks-overview"
      table={table}
      rows={rows}
      enableSelection
      selectedIds={selectedIds}
      onRowSelect={handleRowSelect}
      onRowDoubleClick={(row) => router.push(`/carrier/fleet/trucks/${row.id}`)}
      renderQuickActions={renderQuickActions}
      search={globalFilter}
      onSearchChange={setGlobalFilter}
      searchPlaceholder="Search by unit # or VIN..."
      showNew
      onNew={() => router.push('/carrier/fleet/trucks/new')}
      recordName="Truck"
      bulkActions={bulkActions}
      onClearSelection={() => setSelectedIds(new Set())}
      primaryColumn="unitNumber"
      metadataColumns={['status', 'truckType', 'registrationExpiry']}
      statusColumn="status"
      pagination={{
        pageIndex: table.getState().pagination.pageIndex,
        pageSize: table.getState().pagination.pageSize,
        pageCount: table.getPageCount(),
        totalRows: trucks.length,
        canPreviousPage: table.getCanPreviousPage(),
        canNextPage: table.getCanNextPage(),
        previousPage: () => table.previousPage(),
        nextPage: () => table.nextPage(),
        setPageSize: (size) => table.setPageSize(size),
      }}
    />
  );
}
