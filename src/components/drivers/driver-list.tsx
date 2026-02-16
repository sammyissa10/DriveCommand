'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, Eye, Pencil, UserX, UserCheck, Users as UsersIcon } from 'lucide-react';
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
      cell: (info) => <span className="font-medium text-foreground">{info.getValue() as string}</span>,
    },
    {
      accessorKey: 'lastName',
      header: 'Last Name',
      cell: (info) => <span className="font-medium text-foreground">{info.getValue() as string}</span>,
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: (info) => <span className="text-muted-foreground">{info.getValue() as string}</span>,
    },
    {
      accessorKey: 'licenseNumber',
      header: 'License',
      cell: (info) => {
        const value = info.getValue() as string | null;
        return value ? (
          <span className="font-mono text-xs">{value}</span>
        ) : (
          <span className="text-muted-foreground/50">—</span>
        );
      },
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: (info) => {
        const isActive = info.getValue() as boolean;
        return isActive ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            Deactivated
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const driver = row.original;
        return (
          <div className="flex items-center justify-end gap-1">
            <Link
              href={`/drivers/${driver.id}`}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Eye className="h-3.5 w-3.5" />
              View
            </Link>
            <Link
              href={`/drivers/${driver.id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Link>
            {driver.isActive ? (
              <button
                onClick={() => handleDeactivate(driver.id, driver.firstName || '', driver.lastName || '')}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
              >
                <UserX className="h-3.5 w-3.5" />
                Deactivate
              </button>
            ) : (
              <button
                onClick={() => handleReactivate(driver.id, driver.firstName || '', driver.lastName || '')}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
              >
                <UserCheck className="h-3.5 w-3.5" />
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
      <div className="rounded-xl border border-border bg-card p-16 text-center">
        <UsersIcon className="mx-auto h-12 w-12 text-muted-foreground/30 mb-4" />
        <p className="text-lg font-medium text-muted-foreground">
          No drivers yet
        </p>
        <p className="mt-1 text-sm text-muted-foreground/70">
          Invite your first driver to get started.
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
          placeholder="Search drivers..."
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
