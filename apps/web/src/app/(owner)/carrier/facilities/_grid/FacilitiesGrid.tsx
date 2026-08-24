'use client';

/**
 * FacilitiesGrid Component
 *
 * DataGrid-based facilities list with:
 * - Responsive table/card views
 * - Search and filter
 * - Row selection with quick actions
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
import { facilitiesColumns } from './columns';
import type { FacilityRow } from './types';
import { useSoftDelete } from '@/hooks/useSoftDelete';
import { DeleteConfirmationDialog } from '@/components/shared/DeleteConfirmationDialog';

interface FacilitiesGridProps {
  facilities: FacilityRow[];
}

export function FacilitiesGrid({ facilities }: FacilitiesGridProps) {
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
    entityType: 'CarrierFacility',
    onSuccess: () => {
      setSelectedIds(new Set());
      router.refresh();
    },
  });

  const table = useReactTable({
    data: facilities,
    columns: facilitiesColumns,
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
  const renderQuickActions = (row: FacilityRow): React.ReactNode => {
    const actions: QuickAction[] = [
      {
        id: 'view',
        label: 'View',
        icon: Eye,
        onClick: () => router.push(`/carrier/facilities/${row.id}`),
      },
      {
        id: 'edit',
        label: 'Edit',
        icon: Pencil,
        onClick: () => router.push(`/carrier/facilities/${row.id}`),
      },
      {
        id: 'delete',
        label: 'Delete',
        icon: Trash2,
        onClick: () => requestDelete(row.id),
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
        // Same `requestDelete` as the row action, which is what gives the bulk
        // path the confirmation it previously lacked: `destructive: true` only
        // colours the button, it does not gate anything.
        onClick: () => requestDelete(Array.from(selectedIds)),
        destructive: true,
      },
    ],
    [selectedIds, requestDelete]
  );

  return (
    <>
    <GridShell
      gridId="facilities-overview"
      table={table}
      rows={rows}
      enableSelection
      selectedIds={selectedIds}
      onRowSelect={handleRowSelect}
      onRowDoubleClick={(row) => router.push(`/carrier/facilities/${row.id}`)}
      renderQuickActions={renderQuickActions}
      search={globalFilter}
      onSearchChange={setGlobalFilter}
      searchPlaceholder="Search by name or city..."
      showNew
      onNew={() => router.push('/carrier/facilities/new')}
      recordName="Facility"
      bulkActions={bulkActions}
      onClearSelection={() => setSelectedIds(new Set())}
      primaryColumn="name"
      metadataColumns={['facilityType', 'location']}
      statusColumn="facilityType"
      pagination={{
        pageIndex: table.getState().pagination.pageIndex,
        pageSize: table.getState().pagination.pageSize,
        pageCount: table.getPageCount(),
        totalRows: facilities.length,
        canPreviousPage: table.getCanPreviousPage(),
        canNextPage: table.getCanNextPage(),
        previousPage: () => table.previousPage(),
        nextPage: () => table.nextPage(),
        setPageSize: (size) => table.setPageSize(size),
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
