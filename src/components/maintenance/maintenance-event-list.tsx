'use client';

import { useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
} from '@tanstack/react-table';

interface MaintenanceEvent {
  id: string;
  serviceType: string;
  serviceDate: Date | string;
  odometerAtService: number;
  cost: number | null;
  provider: string | null;
}

interface MaintenanceEventListProps {
  events: MaintenanceEvent[];
  onDelete: (id: string) => void;
}

export function MaintenanceEventList({ events, onDelete }: MaintenanceEventListProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'serviceDate', desc: true }
  ]);
  const [globalFilter, setGlobalFilter] = useState('');

  const handleDelete = (id: string, serviceType: string) => {
    if (window.confirm(`Are you sure you want to delete this maintenance event? (${serviceType})`)) {
      onDelete(id);
    }
  };

  const columns: ColumnDef<MaintenanceEvent>[] = [
    {
      accessorKey: 'serviceDate',
      header: 'Date',
      cell: (info) => {
        const value = info.getValue() as Date | string;
        return new Date(value).toLocaleDateString();
      },
    },
    {
      accessorKey: 'serviceType',
      header: 'Service Type',
      cell: (info) => info.getValue(),
    },
    {
      accessorKey: 'odometerAtService',
      header: 'Odometer',
      cell: (info) => {
        const value = info.getValue() as number;
        return `${value.toLocaleString()} mi`;
      },
    },
    {
      accessorKey: 'provider',
      header: 'Provider',
      cell: (info) => {
        const value = info.getValue() as string | null;
        return value || '—';
      },
    },
    {
      accessorKey: 'cost',
      header: 'Cost',
      cell: (info) => {
        const value = info.getValue() as number | null;
        return value !== null ? `$${value.toFixed(2)}` : '—';
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <button
          onClick={() => handleDelete(row.original.id, row.original.serviceType)}
          className="text-red-600 hover:text-red-800 font-medium"
        >
          Delete
        </button>
      ),
    },
  ];

  const table = useReactTable({
    data: events,
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

  if (events.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
        <p className="text-gray-500 text-lg">
          No service history found. Log your first maintenance event to get started.
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
          placeholder="Search service history..."
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
