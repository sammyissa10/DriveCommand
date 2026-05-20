'use client';

/**
 * GridToolbar - Sticky toolbar for DataGrid.
 *
 * Provides search input (debounced 300ms), filter panel, saved views, density toggle,
 * column visibility, CSV export with multiple options, and optional "New" button.
 */

import * as React from 'react';
import {
  Search,
  Rows2,
  Rows3,
  Rows4,
  Columns3,
  Download,
  Plus,
  Filter as FilterIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useDataGridContext } from '../core/DataGrid';
import { FilterPanel } from '../filters/FilterPanel';
import { FilterChip } from '../filters/FilterChip';
import type { DensityMode, ExtendedColumnDef, ServerDataFetcher, GridFilter } from '../core/types';
import { exportVisible, exportSelected, exportAll } from '../export';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GridToolbarProps<TData> {
  /** Callback when "New" button is clicked */
  onNew?: () => void;
  /** Whether to show the "New" button */
  showNew?: boolean;
  /** Placeholder text for search input */
  searchPlaceholder?: string;
  /** Filename for CSV export (without extension) */
  exportFilename?: string;
  /** Additional CSS class */
  className?: string;
  /** Local search state setter (if not using URL sync) */
  onSearch?: (query: string) => void;
  /** Local search value */
  searchValue?: string;
  /** Grid columns for filter panel */
  columns?: ExtendedColumnDef<TData>[];
  /** Data fetcher for "export all" mode */
  dataFetcher?: ServerDataFetcher<TData>;
  /** Current filters */
  filters?: GridFilter[];
  /** Filters change callback */
  onFiltersChange?: (filters: GridFilter[]) => void;
  /** Current sort state */
  sort?: { field: string; direction: 'asc' | 'desc' } | null;
  /** Current search term */
  search?: string;
  /** Row ID accessor for export selected */
  rowIdAccessor?: (row: TData) => string;
  /** Density setter from preferences hook */
  setDensity?: (density: DensityMode) => void;
}

// ---------------------------------------------------------------------------
// Debounce hook
// ---------------------------------------------------------------------------

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState<T>(value);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

// ---------------------------------------------------------------------------
// Density icons
// ---------------------------------------------------------------------------

const densityIcons: Record<DensityMode, React.ReactNode> = {
  compact: <Rows2 className="h-4 w-4" />,
  normal: <Rows3 className="h-4 w-4" />,
  comfortable: <Rows4 className="h-4 w-4" />,
};

const densityLabels: Record<DensityMode, string> = {
  compact: 'Compact',
  normal: 'Normal',
  comfortable: 'Comfortable',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GridToolbar<TData>({
  onNew,
  showNew = false,
  searchPlaceholder = 'Search...',
  exportFilename = 'export',
  className,
  onSearch,
  searchValue: controlledSearchValue,
  columns = [],
  dataFetcher,
  filters = [],
  onFiltersChange,
  sort = null,
  search = '',
  rowIdAccessor,
  setDensity,
}: GridToolbarProps<TData>) {
  // Ensure filters and columns are always arrays
  const safeFilters = filters ?? [];
  const safeColumns = columns ?? [];
  const { table, preferences, density, selection, gridId } = useDataGridContext<TData>();
  const [filterPanelOpen, setFilterPanelOpen] = React.useState(false);

  // Local search state
  const [localSearch, setLocalSearch] = React.useState(controlledSearchValue ?? '');
  const debouncedSearch = useDebounce(localSearch, 300);

  // Sync debounced search to callback
  React.useEffect(() => {
    if (onSearch) {
      onSearch(debouncedSearch);
    }
  }, [debouncedSearch, onSearch]);

  // Get all columns for visibility toggle
  const allColumns = table.getAllLeafColumns();
  const visibleColumnIds = table.getVisibleLeafColumns().map((col) => col.id);

  // Handle column visibility toggle
  const handleColumnVisibilityChange = (columnId: string, visible: boolean) => {
    const column = table.getColumn(columnId);
    if (column) {
      column.toggleVisibility(visible);
    }
  };

  // Handle density change
  const handleDensityChange = (value: string) => {
    setDensity?.(value as DensityMode);
  };

  // Get column label for filter chip
  const getColumnLabel = (columnId: string) => {
    const column = safeColumns.find((col) => {
      const colId = 'accessorKey' in col ? String(col.accessorKey) : col.id;
      return colId === columnId;
    });
    if (!column) return columnId;
    return typeof column.header === 'string' ? column.header : columnId;
  };

  // Remove filter
  const handleRemoveFilter = (index: number) => {
    const updated = safeFilters.filter((_, i) => i !== index);
    onFiltersChange?.(updated);
  };

  // Export handlers
  const handleExportVisible = () => {
    const rows = table.getRowModel().rows.map((row) => row.original);
    exportVisible(rows, safeColumns, gridId);
  };

  const handleExportSelected = () => {
    const rows = table.getRowModel().rows.map((row) => row.original);
    const accessor = rowIdAccessor ?? ((row: TData) => String((row as { id?: unknown }).id ?? ''));
    exportSelected(selection.selectedIds, rows, safeColumns, gridId, accessor);
  };

  const handleExportAll = async () => {
    if (!dataFetcher) {
      // Fall back to export visible if no data fetcher
      handleExportVisible();
      return;
    }

    await exportAll(
      dataFetcher,
      safeColumns,
      gridId,
      safeFilters,
      sort ?? null,
      search ?? ''
    );
  };

  return (
    <TooltipProvider>
      <div className="space-y-2">
        <div
          className={cn(
            'flex items-center gap-2 p-2 border-b border-border bg-background',
            className
          )}
        >
          {/* Search input */}
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={searchPlaceholder}
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="pl-9 h-9"
              aria-label="Search"
            />
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Filter button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={safeFilters.length > 0 ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setFilterPanelOpen(true)}
                aria-label="Open filters"
              >
                <FilterIcon className="h-4 w-4" />
                {safeFilters.length > 0 && (
                  <span className="ml-1">{safeFilters.length}</span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Filters</TooltipContent>
          </Tooltip>

        {/* Density toggle */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" aria-label="Change density">
                  {densityIcons[density]}
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Row density</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Density</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={density} onValueChange={handleDensityChange}>
              <DropdownMenuRadioItem value="compact">
                <Rows2 className="mr-2 h-4 w-4" />
                Compact
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="normal">
                <Rows3 className="mr-2 h-4 w-4" />
                Normal
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="comfortable">
                <Rows4 className="mr-2 h-4 w-4" />
                Comfortable
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Column visibility */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" aria-label="Toggle columns">
                  <Columns3 className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Toggle columns</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {allColumns
              .filter((col) => col.getCanHide())
              .map((column) => {
                const header = column.columnDef.header;
                const label = typeof header === 'string' ? header : column.id;
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={visibleColumnIds.includes(column.id)}
                    onCheckedChange={(checked) =>
                      handleColumnVisibilityChange(column.id, checked)
                    }
                  >
                    {label}
                  </DropdownMenuCheckboxItem>
                );
              })}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Export CSV */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" aria-label="Export">
                  <Download className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Export to CSV</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Export</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleExportVisible}>
              Export visible rows ({table.getRowModel().rows.length})
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleExportSelected}
              disabled={selection.selectedCount === 0}
            >
              Export selected rows ({selection.selectedCount})
            </DropdownMenuItem>
            {dataFetcher && (
              <DropdownMenuItem onClick={handleExportAll}>
                Export all rows (current filters)
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

          {/* New button */}
          {showNew && (
            <Button variant="default" size="sm" onClick={onNew}>
              <Plus className="h-4 w-4 mr-1" />
              New
            </Button>
          )}
        </div>

        {/* Filter chips row */}
        {safeFilters.length > 0 && (
          <div className="flex items-center gap-2 px-2 pb-2 flex-wrap">
            {safeFilters.map((filter, index) => (
              <FilterChip
                key={index}
                filter={filter}
                columnLabel={getColumnLabel(filter.columnId)}
                onRemove={() => handleRemoveFilter(index)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Filter panel */}
      <FilterPanel
        open={filterPanelOpen}
        onOpenChange={setFilterPanelOpen}
        columns={safeColumns}
        filters={safeFilters}
        onFiltersChange={onFiltersChange ?? (() => {})}
      />
    </TooltipProvider>
  );
}
