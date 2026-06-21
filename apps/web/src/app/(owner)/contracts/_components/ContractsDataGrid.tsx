'use client';

import * as React from 'react';
import { useState, useMemo, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FileText,
  Eye,
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
  type ActiveFilter,
  type StatusTab,
} from '@/components/design-system';
import {
  computeContractStatus,
  getStatusTabValue,
  type ContractWithRelations,
  type ContractStatusTabValue,
} from '@/lib/contracts/compute-contract-status';
import { formatRate } from '@/lib/contracts/format-rate';
import { cn } from '@/lib/utils';

/**
 * ContractsDataGrid — Main data grid for contracts overview.
 *
 * Features:
 * - Segmented tabs with counts (All/Active/Expiring/Expired/Draft)
 * - Wide search field with filter button
 * - Sortable columns
 * - Clickable rows (whole row opens record)
 * - Quiet bulk-select checkboxes
 * - Desktop = table, Mobile = cards
 */

interface ContractsDataGridProps {
  contracts: ContractWithRelations[];
  onDelete?: (id: string) => void;
}

// Sortable header component
function SortableHeader({
  column,
  children,
}: {
  column: any;
  children: React.ReactNode;
}) {
  const isSorted = column.getIsSorted();

  return (
    <button
      onClick={() => column.toggleSorting()}
      className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
    >
      {children}
      {isSorted === 'asc' ? (
        <ArrowUp className="h-3 w-3" />
      ) : isSorted === 'desc' ? (
        <ArrowDown className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );
}

export function ContractsDataGrid({ contracts, onDelete }: ContractsDataGridProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // State
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [activeTab, setActiveTab] = useState<ContractStatusTabValue>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);

  // Compute tab counts
  const tabCounts = useMemo(() => {
    const counts = { all: 0, active: 0, expiring: 0, expired: 0, draft: 0 };
    contracts.forEach((contract) => {
      counts.all++;
      const tabValue = getStatusTabValue(contract);
      counts[tabValue]++;
    });
    return counts;
  }, [contracts]);

  // Filter contracts by active tab
  const filteredContracts = useMemo(() => {
    if (activeTab === 'all') return contracts;
    return contracts.filter((contract) => getStatusTabValue(contract) === activeTab);
  }, [contracts, activeTab]);

  // Build tab definitions
  const tabs: StatusTab[] = [
    { value: 'all', label: 'All', count: tabCounts.all },
    { value: 'active', label: 'Active', count: tabCounts.active },
    { value: 'expiring', label: 'Expiring', count: tabCounts.expiring },
    { value: 'expired', label: 'Expired', count: tabCounts.expired },
    { value: 'draft', label: 'Draft', count: tabCounts.draft },
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
    if (selectedIds.size === filteredContracts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredContracts.map((c) => c.id)));
    }
  };

  // Navigate to contract detail
  const handleRowClick = (contract: ContractWithRelations) => {
    startTransition(() => {
      router.push(`/contracts/${contract.id}`);
    });
  };

  // Columns definition
  const columns: ColumnDef<ContractWithRelations>[] = useMemo(
    () => [
      {
        id: 'select',
        header: () => (
          <Checkbox
            checked={
              selectedIds.size > 0 &&
              selectedIds.size === filteredContracts.length
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
            aria-label={`Select ${row.original.contractNumber}`}
            className="opacity-50 hover:opacity-100 transition-opacity"
          />
        ),
        enableSorting: false,
        size: 40,
      },
      {
        accessorKey: 'contractNumber',
        header: ({ column }) => (
          <SortableHeader column={column}>Contract #</SortableHeader>
        ),
        cell: ({ row }) => (
          <span className="font-mono text-sm font-medium text-foreground">
            {row.original.contractNumber}
          </span>
        ),
      },
      {
        accessorKey: 'contractName',
        header: ({ column }) => (
          <SortableHeader column={column}>Name</SortableHeader>
        ),
        cell: ({ row }) => (
          <span className="truncate max-w-[180px] inline-block">
            {row.original.contractName || '—'}
          </span>
        ),
      },
      {
        id: 'client',
        accessorFn: (row) => row.client?.name,
        header: ({ column }) => (
          <SortableHeader column={column}>Client</SortableHeader>
        ),
        cell: ({ row }) => {
          const client = row.original.client;
          if (!client) return <span className="text-muted-foreground">—</span>;

          return (
            <Link
              href={`/clients/${client.id}`}
              className="truncate max-w-[160px] inline-block text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {client.name}
            </Link>
          );
        },
      },
      {
        accessorKey: 'contractType',
        header: 'Type',
        cell: ({ row }) => {
          const type = row.original.contractType;
          const labels: Record<string, string> = {
            spot: 'Spot',
            dedicated: 'Dedicated',
            volume: 'Volume',
            broker: 'Broker',
          };
          return (
            <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium">
              {labels[type] || type}
            </span>
          );
        },
        enableSorting: false,
      },
      {
        id: 'rate',
        header: 'Rate',
        cell: ({ row }) => {
          const { baseRate, rateType } = row.original;
          return (
            <span className="tabular-nums text-sm">
              {formatRate(baseRate, rateType)}
            </span>
          );
        },
        enableSorting: false,
      },
      {
        accessorKey: 'effectiveDate',
        header: ({ column }) => (
          <SortableHeader column={column}>Effective</SortableHeader>
        ),
        cell: ({ row }) => {
          const date = row.original.effectiveDate;
          if (!date) return <span className="text-muted-foreground">—</span>;
          return (
            <span className="text-sm">
              {new Date(date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          );
        },
      },
      {
        accessorKey: 'expirationDate',
        header: ({ column }) => (
          <SortableHeader column={column}>Expiration</SortableHeader>
        ),
        cell: ({ row }) => {
          const date = row.original.expirationDate;
          const { alert } = computeContractStatus(row.original);

          if (!date) return <span className="text-muted-foreground">—</span>;

          return (
            <div className="flex items-center gap-2">
              <span className="text-sm">
                {new Date(date).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
              {alert && (
                <AlertBadge variant={alert.variant}>
                  {alert.message}
                </AlertBadge>
              )}
            </div>
          );
        },
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const { status, variant } = computeContractStatus(row.original);
          return <StatusBadge variant={variant}>{status}</StatusBadge>;
        },
        enableSorting: false,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Link
            href={`/contracts/${row.original.id}`}
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
    [selectedIds, filteredContracts.length]
  );

  const table = useReactTable({
    data: filteredContracts,
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
    globalFilterFn: (row, columnId, filterValue) => {
      const contract = row.original;
      const search = filterValue.toLowerCase();

      // Search across contract number, name, and client name
      return (
        contract.contractNumber.toLowerCase().includes(search) ||
        (contract.contractName?.toLowerCase().includes(search) ?? false) ||
        (contract.client?.name.toLowerCase().includes(search) ?? false)
      );
    },
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
  if (contracts.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-16 text-center">
        <FileText className="mx-auto h-12 w-12 text-muted-foreground/30 mb-4" />
        <p className="text-lg font-medium text-muted-foreground">
          No contracts found
        </p>
        <p className="mt-1 text-sm text-muted-foreground/70">
          Add your first contract to get started.
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
          onValueChange={(v) => setActiveTab(v as ContractStatusTabValue)}
          tabs={tabs}
        />
      </div>

      {/* Search Bar */}
      <SearchBar
        value={globalFilter}
        onChange={setGlobalFilter}
        placeholder="Search by contract number, name, or client..."
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
          <table className="w-full min-w-[1100px]">
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
          const contract = row.original;
          const { status, variant, alert } = computeContractStatus(contract);

          return (
            <div
              key={contract.id}
              onClick={() => handleRowClick(contract)}
              className={cn(
                'flex items-start gap-3 px-4 py-4 active:bg-muted/50 cursor-pointer min-h-[72px]',
                selectedIds.has(contract.id) && 'bg-primary/5'
              )}
            >
              {/* Checkbox */}
              <div className="pt-0.5">
                <Checkbox
                  checked={selectedIds.has(contract.id)}
                  onCheckedChange={() => toggleSelection(contract.id)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Select ${contract.contractNumber}`}
                  className="opacity-50"
                />
              </div>

              {/* Contract icon avatar */}
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-muted">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Primary info */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-medium text-foreground">
                    {contract.contractNumber}
                  </span>
                  {contract.contractName && (
                    <span className="text-sm text-muted-foreground truncate">
                      {contract.contractName}
                    </span>
                  )}
                </div>

                {/* Secondary info */}
                <div className="mt-1 text-xs text-muted-foreground">
                  {contract.client?.name || 'No client'}
                </div>

                {/* Status row */}
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <StatusBadge variant={variant}>{status}</StatusBadge>
                  {alert && (
                    <AlertBadge variant={alert.variant}>
                      {alert.message}
                    </AlertBadge>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
