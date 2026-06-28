'use client';

import * as React from 'react';
import { useState, useMemo, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Eye,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
} from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import {
  SearchBar,
  ActiveFilters,
  StatusTabs,
  StatusBadge,
  type ActiveFilter,
  type StatusTab,
} from '@/components/design-system';
import {
  computeClientStatus,
  getStatusTabValue,
  type ClientWithRelations,
  type ClientStatusTabValue,
} from '@/lib/clients/compute-client-status';
import { SamplePill } from '@/components/onboarding/sample-pill';
import { cn } from '@/lib/utils';

/**
 * ClientsDataGrid — Main data grid for clients overview.
 *
 * Features:
 * - Segmented tabs with counts (All/Active/On Hold/Inactive)
 * - Wide search field with filter button
 * - Sortable columns
 * - Clickable rows (whole row opens record)
 * - Quiet bulk-select checkboxes
 * - Desktop = table, Mobile = cards
 */

interface ClientsDataGridProps {
  clients: ClientWithRelations[];
  onDelete?: (id: string) => void;
}

export function ClientsDataGrid({ clients, onDelete }: ClientsDataGridProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // State
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [activeTab, setActiveTab] = useState<ClientStatusTabValue>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);

  // Compute tab counts
  const tabCounts = useMemo(() => {
    const counts = { all: 0, active: 0, on_hold: 0, inactive: 0 };
    clients.forEach((client) => {
      counts.all++;
      const tabValue = getStatusTabValue(client);
      counts[tabValue]++;
    });
    return counts;
  }, [clients]);

  // Filter clients by active tab
  const filteredClients = useMemo(() => {
    if (activeTab === 'all') return clients;
    return clients.filter((client) => getStatusTabValue(client) === activeTab);
  }, [clients, activeTab]);

  // Build tab definitions
  const tabs: StatusTab[] = [
    { value: 'all', label: 'All', count: tabCounts.all },
    { value: 'active', label: 'Active', count: tabCounts.active },
    { value: 'on_hold', label: 'On Hold', count: tabCounts.on_hold },
    { value: 'inactive', label: 'Inactive', count: tabCounts.inactive },
  ];

  // Selection handlers
  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredClients.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredClients.map((c) => c.id)));
    }
  };

  // Navigate to client detail
  const handleRowClick = (client: ClientWithRelations) => {
    startTransition(() => {
      router.push(`/clients/${client.id}`);
    });
  };

  // Columns definition
  const columns: ColumnDef<ClientWithRelations>[] = useMemo(
    () => [
      {
        id: 'select',
        header: () => (
          <Checkbox
            checked={
              selectedIds.size > 0 &&
              selectedIds.size === filteredClients.length
            }
            onCheckedChange={toggleSelectAll}
            aria-label="Select all"
            className="opacity-50 hover:opacity-100 transition-opacity"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={selectedIds.has(row.original.id)}
            onCheckedChange={() => toggleSelection(row.original.id)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select ${row.original.name}`}
            className="opacity-50 hover:opacity-100 transition-opacity"
          />
        ),
        enableSorting: false,
        size: 40,
      },
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <SortableHeader column={column}>Company</SortableHeader>
        ),
        cell: ({ row }) => (
          <span className="font-medium text-foreground truncate flex items-center gap-2">
            {row.original.name}
            {row.original.isSample && <SamplePill />}
          </span>
        ),
      },
      {
        accessorKey: 'primaryContact',
        header: ({ column }) => (
          <SortableHeader column={column}>Contact</SortableHeader>
        ),
        cell: ({ row }) => (
          <span className="truncate">
            {row.original.primaryContact || '—'}
          </span>
        ),
      },
      {
        accessorKey: 'email',
        header: 'Email',
        cell: ({ row }) => (
          <span className="truncate max-w-[180px] inline-block text-muted-foreground">
            {row.original.email || '—'}
          </span>
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'phone',
        header: 'Phone',
        cell: ({ row }) => (
          <span className="truncate">{row.original.phone || '—'}</span>
        ),
        enableSorting: false,
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const { status, variant } = computeClientStatus(row.original);
          return <StatusBadge variant={variant}>{status}</StatusBadge>;
        },
        enableSorting: false,
      },
      {
        accessorKey: 'paymentTerms',
        header: ({ column }) => (
          <SortableHeader column={column}>Payment Terms</SortableHeader>
        ),
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.paymentTerms} days</span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Link
            href={`/clients/${row.original.id}`}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5',
              'text-sm font-medium text-muted-foreground',
              'hover:text-foreground hover:bg-muted transition-colors'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <Eye className="h-3.5 w-3.5" />
            Manage
          </Link>
        ),
        enableSorting: false,
        size: 100,
      },
    ],
    [selectedIds, filteredClients.length]
  );

  const table = useReactTable({
    data: filteredClients,
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

  // Filter handlers
  const removeFilter = (id: string) => {
    setActiveFilters((prev) => prev.filter((f) => f.id !== id));
  };

  const clearAllFilters = () => {
    setActiveFilters([]);
    setGlobalFilter('');
  };

  // Empty state
  if (clients.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-16 text-center">
        <Building2 className="mx-auto h-12 w-12 text-muted-foreground/30 mb-4" />
        <p className="text-lg font-medium text-muted-foreground">
          No clients found
        </p>
        <p className="mt-1 text-sm text-muted-foreground/70">
          Add your first client to get started.
        </p>
      </div>
    );
  }

  const rows = table.getRowModel().rows;

  return (
    <div className="space-y-4">
      {/* Status Tabs */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <StatusTabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as ClientStatusTabValue)}
          tabs={tabs}
        />
      </div>

      {/* Search Bar */}
      <SearchBar
        value={globalFilter}
        onChange={setGlobalFilter}
        placeholder="Search by company name, contact, email..."
        onFilterClick={() => {
          // TODO: Open filter panel (Phase 2)
        }}
        filterCount={activeFilters.length}
      />

      {/* Active Filters */}
      <ActiveFilters
        filters={activeFilters}
        onRemove={removeFilter}
        onClearAll={clearAllFilters}
      />

      {/* Desktop Table */}
      <div className="hidden md:block rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr
                  key={headerGroup.id}
                  className="border-b border-border bg-muted/50"
                >
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground px-4 py-3"
                      style={{
                        width: header.getSize() !== 150 ? header.getSize() : undefined,
                      }}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    'hover:bg-muted/30 transition-colors cursor-pointer',
                    selectedIds.has(row.original.id) && 'bg-primary/5'
                  )}
                  onClick={() => handleRowClick(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 text-sm">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card List */}
      <div className="md:hidden divide-y divide-border rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        {rows.map((row) => {
          const client = row.original;
          const { status, variant } = computeClientStatus(client);

          return (
            <div
              key={client.id}
              onClick={() => handleRowClick(client)}
              className={cn(
                'flex items-start gap-3 px-4 py-4 active:bg-muted/50 cursor-pointer min-h-[72px]',
                selectedIds.has(client.id) && 'bg-primary/5'
              )}
            >
              {/* Checkbox */}
              <div className="pt-0.5">
                <Checkbox
                  checked={selectedIds.has(client.id)}
                  onCheckedChange={() => toggleSelection(client.id)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Select ${client.name}`}
                  className="opacity-50"
                />
              </div>

              {/* Client icon avatar */}
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-muted">
                <Building2 className="h-5 w-5 text-muted-foreground" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Primary info */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-foreground truncate">
                    {client.name}
                  </span>
                  {client.isSample && <SamplePill />}
                </div>

                {/* Secondary info */}
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <StatusBadge variant={variant}>{status}</StatusBadge>
                  {client.primaryContact && (
                    <span className="text-xs text-muted-foreground truncate">
                      {client.primaryContact}
                    </span>
                  )}
                  {!client.primaryContact && client.email && (
                    <span className="text-xs text-muted-foreground truncate">
                      {client.email}
                    </span>
                  )}
                </div>
              </div>

              <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/50 mt-3" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Sortable header component
function SortableHeader({
  column,
  children,
}: {
  column: any;
  children: React.ReactNode;
}) {
  const sorted = column.getIsSorted();

  return (
    <button
      type="button"
      className="flex items-center gap-1 hover:text-foreground transition-colors -ml-1 px-1"
      onClick={() => column.toggleSorting()}
    >
      {children}
      {sorted === 'asc' ? (
        <ArrowUp className="h-3.5 w-3.5" />
      ) : sorted === 'desc' ? (
        <ArrowDown className="h-3.5 w-3.5" />
      ) : (
        <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />
      )}
    </button>
  );
}
