'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
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
  name: string | null;
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
  onRowDoubleClick: (id: string) => void;
}

const columnHelper = createColumnHelper<Route>();

const columns = [
  columnHelper.accessor('name', {
    header: 'Route Name',
    size: 140,
    cell: (info) => {
      const value = info.getValue();
      return value ? (
        <span className="font-medium text-foreground truncate block" title={value}>{value}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  }),
  columnHelper.accessor('origin', {
    header: 'Origin',
    size: 180,
    cell: (info) => (
      <span className="truncate block" title={info.getValue()}>{info.getValue()}</span>
    ),
  }),
  columnHelper.accessor('destination', {
    header: 'Destination',
    size: 180,
    cell: (info) => (
      <span className="truncate block" title={info.getValue()}>{info.getValue()}</span>
    ),
  }),
  columnHelper.accessor('scheduledDate', {
    header: 'Date',
    size: 100,
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
    size: 130,
    cell: (info) => (
      <span className="truncate block" title={info.getValue()}>{info.getValue()}</span>
    ),
  }),
  columnHelper.accessor((row) => `${row.truck.make} ${row.truck.model} (${row.truck.licensePlate})`, {
    id: 'truck',
    header: 'Truck',
    size: 140,
    cell: (info) => (
      <span className="truncate block" title={info.getValue()}>{info.getValue()}</span>
    ),
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    size: 110,
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
    size: 110,
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
                  `Are you sure you want to archive the route from ${route.origin} to ${route.destination}? (recoverable within 30 days)`
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

function getRouteStatusClasses(status: string): { bgColor: string; textColor: string } {
  if (status === 'IN_PROGRESS') return { bgColor: 'bg-blue-100', textColor: 'text-blue-800' };
  if (status === 'COMPLETED') return { bgColor: 'bg-green-100', textColor: 'text-green-800' };
  return { bgColor: 'bg-muted', textColor: 'text-muted-foreground' };
}

export function RouteList({ routes, onDelete }: RouteListProps) {
  const router = useRouter();
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
      onRowDoubleClick: (id: string) => router.push(`/routes/${id}`),
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

      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-border shadow">
        <table className="w-full min-w-[900px] divide-y divide-border">
          <thead className="bg-muted/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
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
              <tr
                key={row.id}
                className="hover:bg-muted/50 cursor-pointer"
                onDoubleClick={() => (table.options.meta as RouteTableMeta)?.onRowDoubleClick(row.original.id)}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="px-3 py-3 text-sm text-foreground"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List */}
      <div className="md:hidden divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
        {table.getRowModel().rows.map((row) => {
          const route = row.original;
          const { bgColor, textColor } = getRouteStatusClasses(route.status);
          const displayDate = new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }).format(new Date(route.scheduledDate));
          return (
            <div
              key={route.id}
              onClick={() => router.push(`/routes/${route.id}`)}
              className="flex items-center gap-3 px-4 py-3.5 active:bg-muted/50 cursor-pointer"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground truncate">
                    {route.name || 'Unnamed Route'}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium flex-shrink-0 ${bgColor} ${textColor}`}
                  >
                    {route.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <span className="truncate">{route.origin}</span>
                  <span>&rarr;</span>
                  <span className="truncate">{route.destination}</span>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">{displayDate}</div>
              </div>
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/50" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
