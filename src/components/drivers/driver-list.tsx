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
import type { User } from '@/generated/prisma/client';

interface DriverListProps {
  drivers: User[];
  onDeactivate: (id: string) => void;
  onReactivate: (id: string) => void;
}

export function DriverList({ drivers, onDeactivate, onReactivate }: DriverListProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const handleDeactivate = (id: string, firstName: string, lastName: string) => {
    if (window.confirm(`Deactivate driver ${firstName} ${lastName}? They will be logged out immediately.`)) {
      onDeactivate(id);
    }
  };

  const handleReactivate = (id: string, firstName: string, lastName: string) => {
    if (window.confirm(`Reactivate driver ${firstName} ${lastName}?`)) {
      onReactivate(id);
    }
  };

  const columns: ColumnDef<User>[] = [
    {
      accessorKey: 'firstName',
      header: 'First Name',
      cell: (info) => info.getValue(),
    },
    {
      accessorKey: 'lastName',
      header: 'Last Name',
      cell: (info) => info.getValue(),
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: (info) => info.getValue(),
    },
    {
      accessorKey: 'licenseNumber',
      header: 'License',
      cell: (info) => {
        const value = info.getValue() as string | null;
        return value || '—';
      },
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: (info) => {
        const isActive = info.getValue() as boolean;
        return isActive ? (
          <span className="text-green-600 font-medium">Active</span>
        ) : (
          <span className="text-red-600 font-medium">Deactivated</span>
        );
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const driver = row.original;
        return (
          <div className="flex gap-2">
            <Link
              href={`/drivers/${driver.id}`}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              View
            </Link>
            <Link
              href={`/drivers/${driver.id}/edit`}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              Edit
            </Link>
            {driver.isActive ? (
              <button
                onClick={() => handleDeactivate(driver.id, driver.firstName || '', driver.lastName || '')}
                className="text-red-600 hover:text-red-800 font-medium"
              >
                Deactivate
              </button>
            ) : (
              <button
                onClick={() => handleReactivate(driver.id, driver.firstName || '', driver.lastName || '')}
                className="text-green-600 hover:text-green-800 font-medium"
              >
                Reactivate
              </button>
            )}
          </div>
        );
      },
    },
  ];

  const table = useReactTable({
    data: drivers,
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

  if (drivers.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
        <p className="text-gray-500 text-lg">
          No drivers yet. Invite your first driver to get started.
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
          placeholder="Search drivers..."
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
