'use client';

import { useState } from 'react';
import Link from 'next/link';
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
      cell: (info) => info.getValue(),
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
      cell: (info) => info.getValue(),
    },
    {
      accessorKey: 'licensePlate',
      header: 'License Plate',
      cell: (info) => info.getValue(),
    },
    {
      accessorKey: 'odometer',
      header: 'Odometer',
      cell: (info) => {
        const value = info.getValue() as number;
        return `${value.toLocaleString()} miles`;
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Link
            href={`/trucks/${row.original.id}`}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            View
          </Link>
          <Link
            href={`/trucks/${row.original.id}/edit`}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            Edit
          </Link>
          <button
            onClick={() => handleDelete(row.original.id, row.original.make, row.original.model)}
            className="text-red-600 hover:text-red-800 font-medium"
          >
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
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
        <p className="text-gray-500 text-lg">
          No trucks found. Add your first truck to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div>
        <input
          type="text"
          value={globalFilter ?? ''}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Search trucks..."
          className="w-full max-w-md border border-gray-300 rounded-md px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full border-collapse">
          <thead className="bg-gray-50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="text-left text-sm font-medium text-gray-500 uppercase px-6 py-3"
                  >
                    {header.isPlaceholder ? null : (
                      <div
                        className={
                          header.column.getCanSort()
                            ? 'cursor-pointer select-none flex items-center gap-2'
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
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b hover:bg-gray-50">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-6 py-4">
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
