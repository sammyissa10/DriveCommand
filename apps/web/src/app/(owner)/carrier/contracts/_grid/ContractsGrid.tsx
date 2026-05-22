'use client';

/**
 * ContractsGrid Component
 *
 * DataGrid-based contracts list with:
 * - Responsive table/card views
 * - Search and status filter
 * - Row selection with quick actions
 * - Expiring soon indicator
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
import { contractsColumns } from './columns';
import type { ContractRow } from './types';

interface ContractsGridProps {
  contracts: ContractRow[];
}

export function ContractsGrid({ contracts }: ContractsGridProps) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const table = useReactTable({
    data: contracts,
    columns: contractsColumns,
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
  const renderQuickActions = (row: ContractRow): React.ReactNode => {
    const actions: QuickAction[] = [
      {
        id: 'view',
        label: 'View',
        icon: Eye,
        onClick: () => router.push(`/carrier/contracts/${row.id}`),
      },
      {
        id: 'edit',
        label: 'Edit',
        icon: Pencil,
        onClick: () => router.push(`/carrier/contracts/${row.id}/edit`),
      },
    ];

    actions.push({
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      onClick: () => {
        // TODO: Wire to delete mutation
        console.warn('Delete not implemented');
      },
      destructive: true,
    });

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
      gridId="contracts-overview"
      table={table}
      rows={rows}
      enableSelection
      selectedIds={selectedIds}
      onRowSelect={handleRowSelect}
      onRowDoubleClick={(row) => router.push(`/carrier/contracts/${row.id}`)}
      renderQuickActions={renderQuickActions}
      search={globalFilter}
      onSearchChange={setGlobalFilter}
      searchPlaceholder="Search by contract # or client..."
      showNew
      onNew={() => router.push('/carrier/contracts/new')}
      recordName="Contract"
      bulkActions={bulkActions}
      onClearSelection={() => setSelectedIds(new Set())}
      primaryColumn="contractNumber"
      metadataColumns={['clientName', 'status', 'expirationDate']}
      statusColumn="status"
      pagination={{
        pageIndex: table.getState().pagination.pageIndex,
        pageSize: table.getState().pagination.pageSize,
        pageCount: table.getPageCount(),
        totalRows: contracts.length,
        canPreviousPage: table.getCanPreviousPage(),
        canNextPage: table.getCanNextPage(),
        previousPage: () => table.previousPage(),
        nextPage: () => table.nextPage(),
        setPageSize: (size) => table.setPageSize(size),
      }}
    />
  );
}
