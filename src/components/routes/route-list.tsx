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
      let bgColor = 'bg-muted';
      let textColor = 'text-muted-foreground';

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
        <div className="flex items-center gap-1">
          <Link
            href={`/routes/${route.id}`}
            className="inline-flex items-center rounded px-2 py-1.5 text-sm text-primary hover:bg-muted transition-colors"
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
            className="inline-flex items-center rounded px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
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
      <div className="rounded-lg bg-card p-8 text-center shadow">
        <p className="text-muted-foreground">
          No routes found. Create your first route to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter UI */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="text"
          value={globalFilter ?? ''}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Search routes..."
          className="rounded-md border border-border px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 bg-background text-foreground"
        />
        <select
          value={(table.getColumn('status')?.getFilterValue() as string) ?? ''}
          onChange={(e) =>
            table.getColumn('status')?.setFilterValue(e.target.value || undefined)
          }
          className="rounded-md border border-border px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 bg-background text-foreground"
        >
          <option value="">All Statuses</option>
          <option value="PLANNED">Planned</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="COMPLETED">Completed</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border shadow">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 sm:px-6 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
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
          <tbody className="divide-y divide-border bg-card">
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="hover:bg-muted/50">
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 text-sm text-foreground"
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
