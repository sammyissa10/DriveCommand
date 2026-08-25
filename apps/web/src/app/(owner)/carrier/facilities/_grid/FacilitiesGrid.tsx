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
    itemNamePlural,
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
        // `destructive: true` is deliberately NOT set, and this is the whole fix
        // for the two-dialogs-in-a-row bug.
        //
        // In shell/shared/QuickActions.tsx that one flag does two unrelated
        // things: it tints the icon red on hover, AND it makes handleAction open
        // QuickActions' own AlertDialog instead of calling onClick. Confirming
        // that dialog then calls onClick — which is requestDelete — so the
        // canonical dialog opens second. Two prompts, and the first one reads
        // "This action cannot be undone", which is the opposite of true: this
        // delete is a deleted_at stamp with an Undo toast and a Recently Deleted
        // entry.
        //
        // Dropping the flag costs a red hover tint on an icon that is already a
        // trash can, is already labelled Delete, and already leads to a properly
        // destructive-styled confirmation. That is the cheaper half to give up.
        //
        // The bulk action below keeps `destructive: true` because
        // BulkActionsBar's copy of that flag only picks a button variant — it
        // has no dialog of its own.
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
      itemNamePlural={itemNamePlural}
      isLoading={isDeletePending}
    />
    </>
  );
}
