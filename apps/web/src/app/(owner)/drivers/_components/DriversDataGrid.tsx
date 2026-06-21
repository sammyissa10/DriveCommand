'use client';

import * as React from 'react';
import { useState, useMemo, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Users as UsersIcon,
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
  AlertBadge,
  getExpiryVariant,
  formatExpiryMessage,
  type ActiveFilter,
  type StatusTab,
} from '@/components/design-system';
import {
  computeDriverStatus,
  getDriverComplianceAlerts,
  type DriverWithRelations,
} from '@/lib/drivers/compute-driver-status';
import { SamplePill } from '@/components/onboarding/sample-pill';
import { cn } from '@/lib/utils';

/**
 * DriversDataGrid — Main data grid for drivers overview.
 *
 * Features:
 * - Segmented tabs with counts (All/Active/Expiring/Deactivated)
 * - Wide search field with filter button
 * - Sortable columns
 * - Clickable rows (whole row opens record)
 * - Quiet bulk-select checkboxes
 * - Desktop = table, Mobile = cards
 */

// Map driver status to tab values
type StatusTabValue = 'all' | 'active' | 'expiring' | 'deactivated';

function getStatusTabValue(driver: DriverWithRelations): StatusTabValue {
  const { status } = computeDriverStatus(driver);
  switch (status) {
    case 'Active':
      return 'active';
    case 'Expiring Soon':
    case 'Expired Docs':
      return 'expiring'; // Group both with expiring for tabs
    case 'Deactivated':
      return 'deactivated';
    default:
      return 'active';
  }
}

// Map status variant to StatusBadge variant
function mapStatusVariant(
  variant: 'success' | 'warning' | 'danger' | 'neutral'
): 'success' | 'warning' | 'danger' | 'neutral' {
  return variant;
}

interface DriversDataGridProps {
  drivers: DriverWithRelations[];
  onDelete?: (id: string) => void;
}

export function DriversDataGrid({ drivers, onDelete }: DriversDataGridProps) {
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
    const counts = { all: 0, active: 0, expiring: 0, deactivated: 0 };
    drivers.forEach((driver) => {
      counts.all++;
      const tabValue = getStatusTabValue(driver);
      counts[tabValue]++;
    });
    return counts;
  }, [drivers]);

  // Filter drivers by active tab
  const filteredDrivers = useMemo(() => {
    if (activeTab === 'all') return drivers;
    return drivers.filter((driver) => getStatusTabValue(driver) === activeTab);
  }, [drivers, activeTab]);

  // Build tab definitions
  const tabs: StatusTab[] = [
    { value: 'all', label: 'All', count: tabCounts.all },
    { value: 'active', label: 'Active', count: tabCounts.active },
    { value: 'expiring', label: 'Expiring', count: tabCounts.expiring },
    { value: 'deactivated', label: 'Deactivated', count: tabCounts.deactivated },
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
    if (selectedIds.size === filteredDrivers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredDrivers.map((d) => d.id)));
    }
  };

  // Navigate to driver detail
  const handleRowClick = (driver: DriverWithRelations) => {
    startTransition(() => {
      router.push(`/drivers/${driver.id}`);
    });
  };

  // Get the primary compliance alert for a driver
  const getPrimaryAlert = (driver: DriverWithRelations) => {
    const alerts = getDriverComplianceAlerts(driver);
    if (alerts.length === 0) return null;
    // Find the most urgent (smallest days value or negative)
    return alerts.reduce((most, current) => {
      if (most.days === null) return current;
      if (current.days === null) return most;
      return current.days < most.days ? current : most;
    }, alerts[0]);
  };

  // Columns definition
  const columns: ColumnDef<DriverWithRelations>[] = useMemo(
    () => [
      {
        id: 'select',
        header: () => (
          <Checkbox
            checked={
              selectedIds.size > 0 &&
              selectedIds.size === filteredDrivers.length
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
            aria-label={`Select ${row.original.firstName} ${row.original.lastName}`}
            className="opacity-50 hover:opacity-100 transition-opacity"
          />
        ),
        enableSorting: false,
        size: 40,
      },
      {
        accessorKey: 'firstName',
        header: ({ column }) => (
          <SortableHeader column={column}>Name</SortableHeader>
        ),
        cell: ({ row }) => (
          <span className="font-medium text-foreground truncate flex items-center gap-1">
            {row.original.firstName} {row.original.lastName}
            {row.original.isSample && <SamplePill />}
          </span>
        ),
      },
      {
        accessorKey: 'email',
        header: ({ column }) => (
          <SortableHeader column={column}>Email</SortableHeader>
        ),
        cell: ({ row }) => (
          <span className="truncate text-muted-foreground">
            {row.original.email}
          </span>
        ),
      },
      {
        accessorKey: 'licenseNumber',
        header: 'License',
        cell: ({ row }) => (
          <span className="font-mono text-xs truncate">
            {row.original.licenseNumber || '—'}
          </span>
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'phoneNumber',
        header: 'Phone',
        cell: ({ row }) => (
          <span className="truncate text-muted-foreground">
            {row.original.phoneNumber || '—'}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const { status, variant } = computeDriverStatus(row.original);
          return (
            <StatusBadge variant={mapStatusVariant(variant)}>{status}</StatusBadge>
          );
        },
        enableSorting: false,
      },
      {
        id: 'compliance',
        header: 'Compliance',
        cell: ({ row }) => {
          const alert = getPrimaryAlert(row.original);
          if (!alert || alert.days === null) {
            return <span className="text-xs text-muted-foreground">—</span>;
          }
          return (
            <AlertBadge variant={getExpiryVariant(alert.days)}>
              {formatExpiryMessage(alert.days)}
            </AlertBadge>
          );
        },
        enableSorting: false,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Link
            href={`/drivers/${row.original.id}`}
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
    [selectedIds, filteredDrivers.length]
  );

  const table = useReactTable({
    data: filteredDrivers,
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
  if (drivers.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-16 text-center">
        <UsersIcon className="mx-auto h-12 w-12 text-muted-foreground/30 mb-4" />
        <p className="text-lg font-medium text-muted-foreground">
          No drivers found
        </p>
        <p className="mt-1 text-sm text-muted-foreground/70">
          Invite your first driver to get started.
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
        placeholder="Search by name, email, license..."
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
          const driver = row.original;
          const { status, variant } = computeDriverStatus(driver);
          const alert = getPrimaryAlert(driver);

          return (
            <div
              key={driver.id}
              onClick={() => handleRowClick(driver)}
              className={cn(
                'flex items-start gap-3 px-4 py-4 active:bg-muted/50 cursor-pointer',
                selectedIds.has(driver.id) && 'bg-primary/5'
              )}
            >
              {/* Checkbox */}
              <div className="pt-0.5">
                <Checkbox
                  checked={selectedIds.has(driver.id)}
                  onCheckedChange={() => toggleSelection(driver.id)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Select ${driver.firstName} ${driver.lastName}`}
                  className="opacity-50"
                />
              </div>

              {/* Avatar placeholder */}
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-muted">
                <UsersIcon className="h-5 w-5 text-muted-foreground" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Compliance alert (most prominent) */}
                {alert && alert.days !== null && (
                  <AlertBadge
                    variant={getExpiryVariant(alert.days)}
                    className="mb-2"
                  >
                    {formatExpiryMessage(alert.days)}
                  </AlertBadge>
                )}

                {/* Primary info */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-foreground">
                    {driver.firstName} {driver.lastName}
                  </span>
                  {driver.isSample && <SamplePill />}
                </div>

                {/* Secondary info */}
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <StatusBadge variant={mapStatusVariant(variant)}>
                    {status}
                  </StatusBadge>
                  <span className="text-xs text-muted-foreground truncate">
                    {driver.email}
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
