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
import type { DueStatus } from '@/lib/utils/maintenance-utils';

interface ScheduledService {
  id: string;
  serviceType: string;
  intervalDays: number | null;
  intervalMiles: number | null;
  baselineDate: Date | string;
  baselineOdometer: number;
  dueStatus: DueStatus;
}

interface ScheduledServiceListProps {
  schedules: ScheduledService[];
  onDelete: (id: string) => void;
}

export function ScheduledServiceList({ schedules, onDelete }: ScheduledServiceListProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const handleDelete = (id: string, serviceType: string) => {
    if (window.confirm(`Are you sure you want to delete this scheduled service? (${serviceType})`)) {
      onDelete(id);
    }
  };

  const getStatusBadge = (dueStatus: DueStatus) => {
    if (dueStatus.isDue) {
      return <span className="inline-block px-2 py-1 text-xs font-semibold rounded bg-red-100 text-red-800">Due</span>;
    }

    // Check if upcoming (within 14 days or 500 miles)
    const isUpcomingByDate = dueStatus.daysUntilDue !== null && dueStatus.daysUntilDue <= 14;
    const isUpcomingByMileage = dueStatus.milesUntilDue !== null && dueStatus.milesUntilDue <= 500;

    if (isUpcomingByDate || isUpcomingByMileage) {
      return <span className="inline-block px-2 py-1 text-xs font-semibold rounded bg-yellow-100 text-yellow-800">Upcoming</span>;
    }

    return <span className="inline-block px-2 py-1 text-xs font-semibold rounded bg-green-100 text-green-800">OK</span>;
  };

  const getIntervalText = (intervalDays: number | null, intervalMiles: number | null) => {
    const parts: string[] = [];
    if (intervalDays !== null) {
      parts.push(`Every ${intervalDays.toLocaleString()} days`);
    }
    if (intervalMiles !== null) {
      parts.push(`Every ${intervalMiles.toLocaleString()} mi`);
    }
    return parts.join(' / ') || '—';
  };

  const columns: ColumnDef<ScheduledService>[] = [
    {
      accessorKey: 'serviceType',
      header: 'Service Type',
      cell: (info) => info.getValue(),
    },
    {
      accessorKey: 'interval',
      header: 'Interval',
      cell: ({ row }) => getIntervalText(row.original.intervalDays, row.original.intervalMiles),
    },
    {
      accessorKey: 'dueStatus.nextDueDate',
      header: 'Next Due Date',
      cell: ({ row }) => {
        const nextDueDate = row.original.dueStatus.nextDueDate;
        return nextDueDate ? new Date(nextDueDate).toLocaleDateString() : '—';
      },
    },
    {
      accessorKey: 'dueStatus.daysUntilDue',
      header: 'Days Until Due',
      cell: ({ row }) => {
        const days = row.original.dueStatus.daysUntilDue;
        if (days === null) return '—';

        const colorClass = days <= 0 ? 'text-red-600 font-semibold' : days <= 14 ? 'text-yellow-600 font-semibold' : '';
        return <span className={colorClass}>{days}</span>;
      },
    },
    {
      accessorKey: 'dueStatus.nextDueMileage',
      header: 'Next Due Mileage',
      cell: ({ row }) => {
        const nextDueMileage = row.original.dueStatus.nextDueMileage;
        return nextDueMileage !== null ? `${nextDueMileage.toLocaleString()} mi` : '—';
      },
    },
    {
      accessorKey: 'dueStatus.milesUntilDue',
      header: 'Miles Until Due',
      cell: ({ row }) => {
        const miles = row.original.dueStatus.milesUntilDue;
        if (miles === null) return '—';

        const colorClass = miles <= 0 ? 'text-red-600 font-semibold' : miles <= 500 ? 'text-yellow-600 font-semibold' : '';
        return <span className={colorClass}>{miles.toLocaleString()}</span>;
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => getStatusBadge(row.original.dueStatus),
      sortingFn: (rowA, rowB) => {
        // Sort by status: Due > Upcoming > OK
        const statusA = rowA.original.dueStatus.isDue ? 2 :
          (rowA.original.dueStatus.daysUntilDue !== null && rowA.original.dueStatus.daysUntilDue <= 14) ||
          (rowA.original.dueStatus.milesUntilDue !== null && rowA.original.dueStatus.milesUntilDue <= 500) ? 1 : 0;
        const statusB = rowB.original.dueStatus.isDue ? 2 :
          (rowB.original.dueStatus.daysUntilDue !== null && rowB.original.dueStatus.daysUntilDue <= 14) ||
          (rowB.original.dueStatus.milesUntilDue !== null && rowB.original.dueStatus.milesUntilDue <= 500) ? 1 : 0;
        return statusB - statusA; // Descending: higher priority first
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
    data: schedules,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    initialState: {
      sorting: [{ id: 'status', desc: false }], // Due items first
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (schedules.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
        <p className="text-gray-500 text-lg">
          No scheduled services found. Schedule your first service to get started.
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
          placeholder="Search scheduled services..."
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
