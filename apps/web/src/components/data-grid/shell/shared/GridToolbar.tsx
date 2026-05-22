/**
 * GridToolbar Component (Responsive) — DriveCommand Brand
 *
 * Responsive toolbar that renders desktop or mobile variants based on breakpoint.
 * Desktop: inline controls. Mobile: delegates to MobileToolbar.
 * Paper white surface, Signal Blue accents.
 */

'use client';

import { useState } from 'react';
import { Search, Filter, Download, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { MobileToolbar } from '../mobile/MobileToolbar';
import { FilterSheet } from './FilterSheet';
import { ColumnsMenu } from './ColumnsMenu';
import { exportVisible, exportSelected, exportAll } from '../../export/exportToCsv';
import { cn } from '@/lib/utils';
import type { ExtendedColumnDef, GridFilter, ServerDataFetcher } from '../../core/types';

export interface GridToolbarProps<TData> {
  /** Grid ID for export filename */
  gridId?: string;
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
  /** Column order (for reordering) */
  columnOrder?: string[];
  /** Column order change handler */
  onColumnOrderChange?: (order: string[]) => void;
  /** Current sort (for mobile sort sheet) */
  currentSort?: { id: string; desc: boolean } | null;
  /** Sort change handler (for mobile sort sheet) */
  onSortChange?: (sort: { id: string; desc: boolean } | null) => void;
  /** Mobile view mode (cards or table) */
  viewMode?: 'cards' | 'table';
  /** View mode change handler */
  onViewModeChange?: (mode: 'cards' | 'table') => void;
  /** Export filename */
  exportFilename?: string;
  /** Data fetcher for export all */
  dataFetcher?: ServerDataFetcher<TData>;
  /** Row ID accessor for export selected */
  rowIdAccessor?: (row: TData) => string;
  /** Visible rows for export */
  visibleRows?: TData[];
  /** Selected IDs for export */
  selectedIds?: Set<string>;
  /** Whether to show "New" button */
  showNew?: boolean;
  /** New button click handler */
  onNew?: () => void;
  /** Record name for dynamic button label (e.g., "Client", "Driver") */
  recordName?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * GridToolbar provides responsive controls for DataGrid.
 *
 * Design (DriveCommand Brand):
 * - Desktop (>=768px): Search (w-64) + spacer + Filter + Columns + Export + New
 * - Mobile (<768px): Delegates to MobileToolbar
 * - Background: Paper white (#FFFFFF)
 * - Border-b: N200 at 40%
 * - Search: N200/50 border, Signal Blue/60 focus, no heavy shadow
 * - Filter/Columns/Export: ghost buttons, hover bg-accent/[0.04]
 * - New button: solid Signal Blue #0A21C0, white text, Inter font-medium
 * - All icons: strokeWidth={1.6} (brand icon weight)
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
  gridId = 'grid',
  search,
  onSearchChange,
  searchPlaceholder = 'Search...',
  filters = [],
  onFiltersChange,
  onFilterClick,
  columns = [],
  hiddenColumns = [],
  onHiddenColumnsChange,
  columnOrder = [],
  onColumnOrderChange,
  currentSort,
  onSortChange,
  viewMode,
  onViewModeChange,
  exportFilename,
  dataFetcher,
  rowIdAccessor,
  visibleRows = [],
  selectedIds,
  showNew,
  onNew,
  recordName,
  className,
}: GridToolbarProps<TData>) {
  const { isMobile } = useBreakpoint();
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const activeFiltersCount = filters.length;

  const handleFilterClick = () => {
    setFilterSheetOpen(true);
    onFilterClick?.();
  };

  // Mobile layout - MobileToolbar handles sort/columns internally with bottom sheets
  if (isMobile) {
    // Build column items for MobileColumnsSheet
    const columnItems = columns
      .filter((col) => col.id !== 'select' && col.id !== 'actions')
      .map((col) => {
        const meta = col.meta as { hideable?: boolean } | undefined;
        return {
          id: col.id!,
          name: typeof col.header === 'string' ? col.header : col.id!,
          isHidden: hiddenColumns.includes(col.id!),
          isHideable: meta?.hideable !== false,
        };
      });

    // Build sort options from columns
    const sortOptions = columns
      .filter((col) => col.id !== 'select' && col.id !== 'actions')
      .map((col) => ({
        id: col.id!,
        label: typeof col.header === 'string' ? col.header : col.id!,
      }));

    return (
      <>
        <MobileToolbar
          search={search}
          onSearchChange={onSearchChange}
          searchPlaceholder={searchPlaceholder}
          activeFiltersCount={activeFiltersCount}
          onFilterClick={handleFilterClick}
          columns={columnItems}
          onToggleColumn={(columnId) => {
            if (hiddenColumns.includes(columnId)) {
              onHiddenColumnsChange?.(hiddenColumns.filter((id) => id !== columnId));
            } else {
              onHiddenColumnsChange?.([...hiddenColumns, columnId]);
            }
          }}
          onShowAllColumns={() => {
            const hideableIds = columnItems.filter((c) => c.isHideable).map((c) => c.id);
            onHiddenColumnsChange?.(hiddenColumns.filter((id) => !hideableIds.includes(id)));
          }}
          onHideAllColumns={() => {
            const hideableIds = columnItems.filter((c) => c.isHideable).map((c) => c.id);
            onHiddenColumnsChange?.([...new Set([...hiddenColumns, ...hideableIds])]);
          }}
          sortOptions={sortOptions}
          currentSort={currentSort}
          onSortChange={onSortChange}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          visibleRows={visibleRows}
          gridId={gridId}
          className={className}
        />
        <FilterSheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen} />
      </>
    );
  }

  // Desktop layout
  return (
    <>
      <div
        className={cn(
          'flex items-center gap-3 border-b p-3',
          // Background: Paper white
          'bg-[var(--grid-paper,#FFFFFF)]',
          className
        )}
        style={{
          borderColor: 'var(--grid-border-header)',
          fontFamily: "var(--grid-font-ui, 'Inter', sans-serif)",
        }}
      >
        {/* Search input */}
        <div className="relative w-64">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
            style={{ color: 'var(--grid-n400, #8E909A)' }}
            strokeWidth={1.6}
          />
          <Input
            type="search"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => onSearchChange?.(e.target.value)}
            className={cn(
              'pl-9',
              // Border: N200/50 rest, Signal Blue/60 focus
              'border-[var(--grid-n200,#D0D1D7)]/50',
              'focus:border-[var(--grid-accent,#0A21C0)]/60',
              'focus:ring-0 focus:ring-offset-0',
              // Typography: Inter
              'text-sm'
            )}
            style={{
              fontFamily: "var(--grid-font-ui, 'Inter', sans-serif)",
            }}
          />
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Filter button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleFilterClick}
          className={cn(
            'relative',
            'bg-transparent hover:bg-[var(--grid-toolbar-hover)]',
            'text-[var(--grid-n500,#6B6E78)] hover:text-[var(--grid-ink,#141619)]'
          )}
          style={{
            borderRadius: 'var(--grid-radius-button, 6px)',
            fontFamily: "var(--grid-font-ui, 'Inter', sans-serif)",
          }}
        >
          <Filter className="mr-2 h-4 w-4" strokeWidth={1.6} />
          Filter
          {activeFiltersCount > 0 && (
            <Badge
              variant="secondary"
              className="ml-2 h-5 min-w-[20px] rounded-full px-1 text-xs"
              style={{
                backgroundColor: 'var(--grid-accent-l50, #E7EAFF)',
                color: 'var(--grid-accent, #0A21C0)',
              }}
            >
              {activeFiltersCount}
            </Badge>
          )}
        </Button>

        {/* Columns menu with drag-to-reorder */}
        <ColumnsMenu
          columns={columns}
          hiddenColumns={hiddenColumns}
          onHiddenColumnsChange={onHiddenColumnsChange || (() => {})}
          columnOrder={columnOrder}
          onColumnOrderChange={onColumnOrderChange || (() => {})}
        />

        {/* Export dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'bg-transparent hover:bg-[var(--grid-toolbar-hover)]',
                'text-[var(--grid-n500,#6B6E78)] hover:text-[var(--grid-ink,#141619)]'
              )}
              style={{
                borderRadius: 'var(--grid-radius-button, 6px)',
                fontFamily: "var(--grid-font-ui, 'Inter', sans-serif)",
              }}
            >
              <Download className="mr-2 h-4 w-4" strokeWidth={1.6} />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Export to CSV</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                exportVisible(visibleRows, columns, gridId);
              }}
            >
              Visible rows ({visibleRows.length})
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                if (selectedIds && selectedIds.size > 0 && rowIdAccessor) {
                  exportSelected(selectedIds, visibleRows, columns, gridId, rowIdAccessor);
                } else {
                  // If no rowIdAccessor, use id field as default
                  exportSelected(
                    selectedIds || new Set(),
                    visibleRows,
                    columns,
                    gridId,
                    (row: TData) => (row as { id: string }).id
                  );
                }
              }}
              disabled={!selectedIds || selectedIds.size === 0}
            >
              Selected rows {selectedIds && selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                if (dataFetcher) {
                  exportAll(dataFetcher, columns, gridId, filters, null, search || '');
                } else {
                  // No server fetcher, just export all visible rows
                  exportVisible(visibleRows, columns, gridId);
                }
              }}
            >
              All rows
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* New button — solid Signal Blue, white text */}
        {showNew && onNew && (
          <Button
            onClick={onNew}
            size="sm"
            className="text-white font-medium"
            style={{
              backgroundColor: 'var(--grid-accent, #0A21C0)',
              borderRadius: 'var(--grid-radius-button, 6px)',
              fontFamily: "var(--grid-font-ui, 'Inter', sans-serif)",
            }}
          >
            <Plus className="mr-2 h-4 w-4" strokeWidth={1.6} />
            {recordName ? `Add New ${recordName}` : 'New'}
          </Button>
        )}
      </div>

      {/* FilterSheet */}
      <FilterSheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen} />
    </>
  );
}
