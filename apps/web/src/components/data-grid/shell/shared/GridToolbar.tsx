/**
 * GridToolbar Component (Responsive)
 *
 * Responsive toolbar that renders desktop or mobile variants based on breakpoint.
 * Desktop: inline controls. Mobile: delegates to MobileToolbar.
 */

'use client';

import { Search, Filter, Columns3, Download, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { MobileToolbar } from '../mobile/MobileToolbar';
import { cn } from '@/lib/utils';
import type { ExtendedColumnDef, GridFilter, ServerDataFetcher } from '../../core/types';

export interface GridToolbarProps<TData> {
  /** Search value */
  search?: string;
  /** Search change handler */
  onSearchChange?: (value: string) => void;
  /** Search placeholder */
  searchPlaceholder?: string;
  /** Active filters */
  filters?: GridFilter[];
  /** Filters change handler */
  onFiltersChange?: (filters: GridFilter[]) => void;
  /** Filter click handler (opens filter panel) */
  onFilterClick?: () => void;
  /** Columns for visibility toggle */
  columns?: ExtendedColumnDef<TData>[];
  /** Hidden columns */
  hiddenColumns?: string[];
  /** Hidden columns change handler */
  onHiddenColumnsChange?: (columns: string[]) => void;
  /** Export filename */
  exportFilename?: string;
  /** Data fetcher for export all */
  dataFetcher?: ServerDataFetcher<TData>;
  /** Row ID accessor for export selected */
  rowIdAccessor?: (row: TData) => string;
  /** Whether to show "New" button */
  showNew?: boolean;
  /** New button click handler */
  onNew?: () => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * GridToolbar provides responsive controls for DataGrid.
 *
 * Design:
 * - Desktop (>=768px): Search (w-64) + spacer + Filter + Columns + Export + New
 * - Mobile (<768px): Delegates to MobileToolbar
 * - Border-b border-border/40
 * - Padding: p-3
 * - Buttons: variant="ghost" size="sm"
 * - All icons: strokeWidth={1.5}
 * - NO density toggle (removed per design)
 *
 * @example
 * <GridToolbar
 *   search={search}
 *   onSearchChange={setSearch}
 *   filters={filters}
 *   onFilterClick={() => {}}
 *   columns={columns}
 *   showNew
 *   onNew={() => {}}
 * />
 */
export function GridToolbar<TData>({
  search,
  onSearchChange,
  searchPlaceholder = 'Search...',
  filters = [],
  onFiltersChange,
  onFilterClick,
  columns = [],
  hiddenColumns = [],
  onHiddenColumnsChange,
  exportFilename = 'export',
  dataFetcher,
  rowIdAccessor,
  showNew,
  onNew,
  className,
}: GridToolbarProps<TData>) {
  const { isMobile } = useBreakpoint();

  const activeFiltersCount = filters.length;

  const handleColumnVisibilityChange = (columnId: string, visible: boolean) => {
    if (visible) {
      // Show column (remove from hidden)
      onHiddenColumnsChange?.(hiddenColumns.filter((id) => id !== columnId));
    } else {
      // Hide column (add to hidden)
      onHiddenColumnsChange?.([...hiddenColumns, columnId]);
    }
  };

  // Mobile layout
  if (isMobile) {
    return (
      <MobileToolbar
        search={search}
        onSearchChange={onSearchChange}
        searchPlaceholder={searchPlaceholder}
        activeFiltersCount={activeFiltersCount}
        onFilterClick={onFilterClick}
        onSortClick={() => {}} // Handled by parent
        onColumnsClick={() => {}} // Handled by parent
        className={className}
      />
    );
  }

  // Desktop layout
  return (
    <div className={cn('flex items-center gap-3 border-b border-border/40 p-3', className)}>
      {/* Search input */}
      <div className="relative w-64">
        <Search
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          strokeWidth={1.5}
        />
        <Input
          type="search"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => onSearchChange?.(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Filter button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onFilterClick}
        className="relative"
      >
        <Filter className="mr-2 h-4 w-4" strokeWidth={1.5} />
        Filter
        {activeFiltersCount > 0 && (
          <Badge variant="secondary" className="ml-2 h-5 min-w-[20px] rounded-full px-1 text-xs">
            {activeFiltersCount}
          </Badge>
        )}
      </Button>

      {/* Columns dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <Columns3 className="mr-2 h-4 w-4" strokeWidth={1.5} />
            Columns
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {columns
            .filter((col) => col.id !== 'select' && col.id !== 'actions')
            .map((column) => {
              const isHidden = hiddenColumns.includes(column.id!);
              return (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={!isHidden}
                  onCheckedChange={(checked) =>
                    handleColumnVisibilityChange(column.id!, checked)
                  }
                >
                  {typeof column.header === 'string' ? column.header : column.id}
                </DropdownMenuCheckboxItem>
              );
            })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Export dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <Download className="mr-2 h-4 w-4" strokeWidth={1.5} />
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Export to CSV</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => console.log('Export visible')}>
            Visible rows
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => console.log('Export selected')}>
            Selected rows
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => console.log('Export all')}>
            All rows
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* New button */}
      {showNew && onNew && (
        <Button onClick={onNew} size="sm">
          <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
          New
        </Button>
      )}
    </div>
  );
}
