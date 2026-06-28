'use client';

import * as React from 'react';
import { useState, useMemo, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Truck as TruckIcon,
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
  type Row,
} from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import {
  SearchBar,
  ActiveFilters,
  StatusTabs,
  StatusBadge,
  AlertBadge,
  getExpiryVariant,
  formatExpiryMessage,
  type ActiveFilter,
  type StatusTab,
} from '@/components/design-system';
import {
  computeTruckStatus,
  type TruckWithRelations,
} from '@/lib/trucks/compute-truck-status';
import { SamplePill } from '@/components/onboarding/sample-pill';
import { cn } from '@/lib/utils';

/**
 * TrucksDataGrid — Main data grid for trucks overview.
 *
 * Features:
 * - Segmented tabs with counts (All/Active/In Shop/Out of Service)
 * - Wide search field with filter button
 * - Sortable columns
 * - Clickable rows (whole row opens record)
 * - Quiet bulk-select checkboxes
 * - Desktop = table, Mobile = cards
 */

// Map truck status to tab values
type StatusTabValue = 'all' | 'active' | 'maintenance' | 'expired';

function getStatusTabValue(truck: TruckWithRelations): StatusTabValue {
  const { status } = computeTruckStatus(truck);
  switch (status) {
    case 'In Use':
    case 'Ready to Use':
      return 'active';
    case 'In Maintenance':
      return 'maintenance';
    case 'Expired Docs':
      return 'expired';
    default:
      return 'active';
  }
}

// Map status variant to StatusBadge variant
function mapStatusVariant(
  variant: 'blue' | 'amber' | 'red' | 'green'
): 'info' | 'warning' | 'danger' | 'success' {
  const map = {
    blue: 'info' as const,
    amber: 'warning' as const,
    red: 'danger' as const,
    green: 'success' as const,
  };
  return map[variant];
}

interface TrucksDataGridProps {
  trucks: TruckWithRelations[];
  onDelete?: (id: string) => void;
}

export function TrucksDataGrid({ trucks, onDelete }: TrucksDataGridProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // State
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [activeTab, setActiveTab] = useState<StatusTabValue>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);

  // Compute tab counts
  const tabCounts = useMemo(() => {
    const counts = { all: 0, active: 0, maintenance: 0, expired: 0 };
    trucks.forEach((truck) => {
      counts.all++;
      const tabValue = getStatusTabValue(truck);
      counts[tabValue]++;
    });
    return counts;
  }, [trucks]);

  // Filter trucks by active tab
  const filteredTrucks = useMemo(() => {
    if (activeTab === 'all') return trucks;
    return trucks.filter((truck) => getStatusTabValue(truck) === activeTab);
  }, [trucks, activeTab]);

  // Build tab definitions
  const tabs: StatusTab[] = [
    { value: 'all', label: 'All', count: tabCounts.all },
    { value: 'active', label: 'Active', count: tabCounts.active },
    { value: 'maintenance', label: 'In Shop', count: tabCounts.maintenance },
    { value: 'expired', label: 'Out of Service', count: tabCounts.expired },
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
    if (selectedIds.size === filteredTrucks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredTrucks.map((t) => t.id)));
    }
  };

  // Navigate to truck detail
  const handleRowClick = (truck: TruckWithRelations) => {
    startTransition(() => {
      router.push(`/trucks/${truck.id}`);
    });
  };

  // Columns definition
  const columns: ColumnDef<TruckWithRelations>[] = useMemo(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={
              selectedIds.size > 0 &&
              selectedIds.size === filteredTrucks.length
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
            aria-label={`Select ${row.original.make} ${row.original.model}`}
            className="opacity-50 hover:opacity-100 transition-opacity"
          />
        ),
        enableSorting: false,
        size: 40,
      },
      {
        accessorKey: 'make',
        header: ({ column }) => (
          <SortableHeader column={column}>Make</SortableHeader>
        ),
        cell: ({ row }) => (
          <span className="font-medium text-foreground truncate">
            {row.original.make}
            {row.original.isSample && <SamplePill />}
          </span>
        ),
      },
      {
        accessorKey: 'model',
        header: ({ column }) => (
          <SortableHeader column={column}>Model</SortableHeader>
        ),
        cell: ({ row }) => (
          <span className="truncate">{row.original.model}</span>
        ),
      },
      {
        accessorKey: 'year',
        header: ({ column }) => (
          <SortableHeader column={column}>Year</SortableHeader>
        ),
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.year}</span>
        ),
      },
      {
        accessorKey: 'vin',
        header: 'VIN',
        cell: ({ row }) => (
          <span className="font-mono text-xs truncate max-w-[120px] inline-block">
            {row.original.vin}
          </span>
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'licensePlate',
        header: 'License Plate',
        cell: ({ row }) => (
          <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium truncate">
            {row.original.licensePlate}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const { status, variant } = computeTruckStatus(row.original);
          return (
            <StatusBadge variant={mapStatusVariant(variant)}>{status}</StatusBadge>
          );
        },
        enableSorting: false,
      },
      {
        accessorKey: 'odometer',
        header: ({ column }) => (
          <SortableHeader column={column}>Odometer</SortableHeader>
        ),
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.odometer.toLocaleString()} mi
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Link
            href={`/trucks/${row.original.id}`}
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
    [selectedIds, filteredTrucks.length]
  );

  const table = useReactTable({
    data: filteredTrucks,
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

  const rows = table.getRowModel().rows;

  return (
    <div className="space-y-4">
      {/* Status Tabs */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <StatusTabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as StatusTabValue)}
          tabs={tabs}
        />
      </div>

      {/* Search Bar */}
      <SearchBar
        value={globalFilter}
        onChange={setGlobalFilter}
        placeholder="Search by unit #, VIN, make, model..."
        onFilterClick={() => {
          // TODO: Open filter panel
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
          const truck = row.original;
          const { status, variant } = computeTruckStatus(truck);

          // Check for compliance alerts
          const docMeta = truck.documentMetadata as {
            registrationExpiry?: string;
            insuranceExpiry?: string;
          } | null;
          const hasExpiringDocs =
            docMeta?.registrationExpiry || docMeta?.insuranceExpiry;

          return (
            <div
              key={truck.id}
              onClick={() => handleRowClick(truck)}
              className={cn(
                'flex items-start gap-3 px-4 py-4 active:bg-muted/50 cursor-pointer',
                selectedIds.has(truck.id) && 'bg-primary/5'
              )}
            >
              {/* Checkbox */}
              <div className="pt-0.5">
                <Checkbox
                  checked={selectedIds.has(truck.id)}
                  onCheckedChange={() => toggleSelection(truck.id)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Select ${truck.make} ${truck.model}`}
                  className="opacity-50"
                />
              </div>

              {/* Truck icon avatar */}
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-muted">
                <TruckIcon className="h-5 w-5 text-muted-foreground" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Compliance alert (most prominent) */}
                {variant === 'red' && (
                  <AlertBadge variant="danger" className="mb-2">
                    {status}
                  </AlertBadge>
                )}
                {variant === 'amber' && (
                  <AlertBadge variant="warning" className="mb-2">
                    {status}
                  </AlertBadge>
                )}

                {/* Primary info */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-foreground">
                    {truck.year} {truck.make} {truck.model}
                  </span>
                  {truck.isSample && <SamplePill />}
                </div>

                {/* Secondary info */}
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                    {truck.licensePlate}
                  </span>
                  {variant !== 'red' && variant !== 'amber' && (
                    <StatusBadge variant={mapStatusVariant(variant)}>
                      {status}
                    </StatusBadge>
                  )}
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {truck.odometer.toLocaleString()} mi
                  </span>
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
