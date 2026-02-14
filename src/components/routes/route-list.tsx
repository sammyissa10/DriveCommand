'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  createColumnHelper,
  flexRender,
  type SortingState,
  type ColumnFiltersState,
  type TableMeta,
} from '@tanstack/react-table';

interface Driver {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

interface Truck {
  id: string;
  make: string;
  model: string;
  licensePlate: string;
}

interface Route {
  id: string;
  origin: string;
  destination: string;
  scheduledDate: Date;
  status: string;
  driver: Driver;
  truck: Truck;
}

interface RouteListProps {
  routes: Route[];
  onDelete: (id: string) => void;
}

interface RouteTableMeta extends TableMeta<Route> {
  onDelete: (id: string) => void;
}

const columnHelper = createColumnHelper<Route>();

const columns = [
  columnHelper.accessor('origin', {
    header: 'Origin',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('destination', {
    header: 'Destination',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('scheduledDate', {
    header: 'Scheduled Date',
    cell: (info) => {
      const value = info.getValue();
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date(value));
    },
  }),
  columnHelper.accessor((row) => `${row.driver.firstName || ''} ${row.driver.lastName || ''}`.trim(), {
    id: 'driver',
    header: 'Driver',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor((row) => `${row.truck.make} ${row.truck.model} (${row.truck.licensePlate})`, {
    id: 'truck',
    header: 'Truck',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    cell: (info) => {
      const status = info.getValue();
      let bgColor = 'bg-gray-100';
      let textColor = 'text-gray-800';

      if (status === 'IN_PROGRESS') {
        bgColor = 'bg-blue-100';
        textColor = 'text-blue-800';
      } else if (status === 'COMPLETED') {
        bgColor = 'bg-green-100';
        textColor = 'text-green-800';
      }

      const displayText = status.replace(/_/g, ' ');

      return (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${bgColor} ${textColor}`}
        >
          {displayText}
        </span>
      );
    },
  }),
  columnHelper.display({
    id: 'actions',
    header: 'Actions',
    cell: (info) => {
      const route = info.row.original;
      return (
        <div className="flex items-center space-x-2">
          <Link
            href={`/routes/${route.id}`}
            className="text-blue-600 hover:text-blue-800"
          >
            View
          </Link>
          <button
            onClick={() => {
              if (
                window.confirm(
                  `Are you sure you want to delete the route from ${route.origin} to ${route.destination}?`
                )
              ) {
                (info.table.options.meta as RouteTableMeta)?.onDelete(route.id);
              }
            }}
            className="text-red-600 hover:text-red-800"
          >
            Delete
          </button>
        </div>
      );
    },
  }),
];

export function RouteList({ routes, onDelete }: RouteListProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const table = useReactTable({
    data: routes,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    meta: {
      onDelete,
    },
  });

  if (routes.length === 0) {
    return (
      <div className="rounded-lg bg-white p-8 text-center shadow">
        <p className="text-gray-600">
          No routes found. Create your first route to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter UI */}
      <div className="flex items-center space-x-4">
        <input
          type="text"
          value={globalFilter ?? ''}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Search routes..."
          className="rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <select
          value={(table.getColumn('status')?.getFilterValue() as string) ?? ''}
          onChange={(e) =>
            table.getColumn('status')?.setFilterValue(e.target.value || undefined)
          }
          className="rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">All Statuses</option>
          <option value="PLANNED">Planned</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="COMPLETED">Completed</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                  >
                    {header.isPlaceholder ? null : (
                      <div
                        className={
                          header.column.getCanSort()
                            ? 'flex cursor-pointer select-none items-center space-x-1'
                            : ''
                        }
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <span>
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                        </span>
                        {header.column.getCanSort() && (
                          <span>
                            {{
                              asc: ' ↑',
                              desc: ' ↓',
                            }[header.column.getIsSorted() as string] ?? ' ↕'}
                          </span>
                        )}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50">
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="whitespace-nowrap px-6 py-4 text-sm text-gray-900"
                  >
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
