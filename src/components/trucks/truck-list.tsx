'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, Eye, Pencil, Trash2, Truck as TruckIcon } from 'lucide-react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
} from '@tanstack/react-table';
import type { Truck } from '@/generated/prisma/client';

interface TruckListProps {
  trucks: Truck[];
  onDelete: (id: string) => void;
}

export function TruckList({ trucks, onDelete }: TruckListProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const handleDelete = (id: string, make: string, model: string) => {
    if (window.confirm(`Are you sure you want to delete this truck? (${make} ${model})`)) {
      onDelete(id);
    }
  };

  const columns: ColumnDef<Truck>[] = [
    {
      accessorKey: 'make',
      header: 'Make',
      cell: (info) => <span className="font-medium text-foreground">{info.getValue() as string}</span>,
    },
    {
      accessorKey: 'model',
      header: 'Model',
      cell: (info) => info.getValue(),
    },
    {
      accessorKey: 'year',
      header: 'Year',
      cell: (info) => info.getValue(),
    },
    {
      accessorKey: 'vin',
      header: 'VIN',
      cell: (info) => <span className="font-mono text-xs">{info.getValue() as string}</span>,
    },
    {
      accessorKey: 'licensePlate',
      header: 'License Plate',
      cell: (info) => (
        <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
          {info.getValue() as string}
        </span>
      ),
    },
    {
      accessorKey: 'odometer',
      header: 'Odometer',
      cell: (info) => {
        const value = info.getValue() as number;
        return `${value.toLocaleString()} mi`;
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <Link
            href={`/trucks/${row.original.id}`}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Eye className="h-3.5 w-3.5" />
            View
          </Link>
          <Link
            href={`/trucks/${row.original.id}/edit`}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Link>
          <button
            onClick={() => handleDelete(row.original.id, row.original.make, row.original.model)}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      ),
    },
  ];

  const table = useReactTable({
    data: trucks,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (trucks.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-16 text-center">
        <TruckIcon className="mx-auto h-12 w-12 text-muted-foreground/30 mb-4" />
        <p className="text-lg font-medium text-muted-foreground">
          No trucks found
        </p>
        <p className="mt-1 text-sm text-muted-foreground/70">
          Add your first truck to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={globalFilter ?? ''}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Search trucks..."
          className="w-full rounded-lg border border-input bg-card pl-10 pr-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors"
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <table className="w-full">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border bg-muted/50">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground px-6 py-3.5"
                  >
                    {header.isPlaceholder ? null : (
                      <div
                        className={
                          header.column.getCanSort()
                            ? 'cursor-pointer select-none flex items-center gap-1.5 hover:text-foreground transition-colors'
                            : ''
                        }
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === 'asc' ? ' ↑' : ''}
                        {header.column.getIsSorted() === 'desc' ? ' ↓' : ''}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-border">
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-6 py-4 text-sm">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
