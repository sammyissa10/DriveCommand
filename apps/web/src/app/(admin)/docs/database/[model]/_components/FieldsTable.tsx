'use client';

/**
 * FieldsTable — Migrated to DataGrid.
 * Displays Prisma model fields with constraints.
 */

import { type ColumnDef } from '@tanstack/react-table';
import { GridShell } from '@/components/data-grid';
import { useDataGrid } from '@/components/data-grid/core/useDataGrid';
import type { DataGridColumnMeta } from '@/components/data-grid/core/types';
import { Badge } from '@/components/ui/badge';

interface PrismaField {
  name: string;
  type: string;
  isArray: boolean;
  isRequired: boolean;
  defaultValue?: string;
  isId: boolean;
  isUnique: boolean;
  dbType?: string;
}

interface FieldsTableProps {
  fields: PrismaField[];
}

// ---------------------------------------------------------------------------
// Column Definitions
// ---------------------------------------------------------------------------

const columns: ColumnDef<PrismaField, unknown>[] = [
  {
    id: 'name',
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => (
      <span className="font-mono font-medium">{row.original.name}</span>
    ),
    enableSorting: true,
    meta: {
      freezable: true,
      defaultFrozen: true,
      filterType: 'text',
    } as DataGridColumnMeta,
  },
  {
    id: 'type',
    accessorKey: 'type',
    header: 'Type',
    cell: ({ row }) => (
      <span className="font-mono text-sm">
        {row.original.type}
        {row.original.isArray && '[]'}
      </span>
    ),
    enableSorting: true,
    meta: {
      filterType: 'text',
    } as DataGridColumnMeta,
  },
  {
    id: 'isRequired',
    accessorKey: 'isRequired',
    header: 'Required',
    cell: ({ row }) => (
      <Badge variant={row.original.isRequired ? 'default' : 'outline'} className="text-xs">
        {row.original.isRequired ? 'Yes' : 'No'}
      </Badge>
    ),
    meta: {
      filterType: 'select',
      filterOptions: [
        { value: 'true', label: 'Yes' },
        { value: 'false', label: 'No' },
      ],
    } as DataGridColumnMeta,
  },
  {
    id: 'defaultValue',
    accessorKey: 'defaultValue',
    header: 'Default',
    cell: ({ row }) => (
      <span className="font-mono text-xs text-gray-600">
        {row.original.defaultValue || '—'}
      </span>
    ),
    meta: {
      filterType: 'text',
    } as DataGridColumnMeta,
  },
  {
    id: 'constraints',
    accessorFn: (row) => {
      const parts: string[] = [];
      if (row.isId) parts.push('@id');
      if (row.isUnique) parts.push('@unique');
      if (row.dbType) parts.push(row.dbType);
      return parts.join(', ');
    },
    header: 'Constraints',
    cell: ({ row }) => (
      <div className="flex gap-1 flex-wrap">
        {row.original.isId && (
          <Badge variant="outline" className="text-xs">
            @id
          </Badge>
        )}
        {row.original.isUnique && (
          <Badge variant="outline" className="text-xs">
            @unique
          </Badge>
        )}
        {row.original.dbType && (
          <Badge variant="secondary" className="text-xs">
            {row.original.dbType}
          </Badge>
        )}
      </div>
    ),
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FieldsTable({ fields }: FieldsTableProps) {
  const { table } = useDataGrid({
    gridId: 'prisma-fields',
    columns,
    data: fields,
    rowIdAccessor: (row) => row.name,
    initialPageSize: 50,
  });

  const rows = table.getRowModel().rows;
  const pageCount = table.getPageCount();
  const { pageIndex, pageSize } = table.getState().pagination;

  return (
    <GridShell
      gridId="prisma-fields"
      table={table}
      rows={rows}
      columns={columns}
      pagination={{
        pageIndex,
        pageSize,
        pageCount,
        totalRows: fields.length,
        canPreviousPage: table.getCanPreviousPage(),
        canNextPage: table.getCanNextPage(),
        previousPage: () => table.previousPage(),
        nextPage: () => table.nextPage(),
        setPageSize: (size) => table.setPageSize(size),
      }}
    />
  );
}
