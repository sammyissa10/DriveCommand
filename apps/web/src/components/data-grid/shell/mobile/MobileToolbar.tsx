/**
 * MobileToolbar Component — iOS HIG Compliant
 *
 * Quiet toolbar for mobile DataGrid controls.
 * NO solid blue Filter bar — all controls are ghost style.
 * - Full-width search at top
 * - View toggle: Cards | Table
 * - Row of quiet ghost buttons: Filter, Sort, Export, (Columns in Table view only)
 * - Each opens a bottom sheet (iOS action sheet style)
 */

'use client';

import { useState, useEffect } from 'react';
import { Search, Filter, ArrowUpDown, Download, Columns, LayoutGrid, Table2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { MobileSortSheet } from './MobileSortSheet';
import { MobileColumnsSheet } from './MobileColumnsSheet';
import { exportVisible } from '../../export/exportToCsv';
import type { ExtendedColumnDef } from '../../core/types';

export type MobileViewMode = 'cards' | 'table';

export interface MobileToolbarProps<TData = unknown> {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  activeFiltersCount?: number;
  onFilterClick?: () => void;
  // Sort props
  sortOptions?: Array<{ id: string; label: string }>;
  currentSort?: { id: string; desc: boolean } | null;
  onSortChange?: (sort: { id: string; desc: boolean } | null) => void;
  // Columns props (only shown in Table view)
  columns?: Array<{ id: string; name: string; isHidden: boolean; isHideable: boolean }>;
  onToggleColumn?: (columnId: string) => void;
  onShowAllColumns?: () => void;
  onHideAllColumns?: () => void;
  // Export props
  visibleRows?: TData[];
  gridId?: string;
  // View mode (Cards vs Table)
  viewMode?: MobileViewMode;
  onViewModeChange?: (mode: MobileViewMode) => void;
  className?: string;
}

/**
 * MobileToolbar provides quiet, iOS-style controls for mobile DataGrid.
 *
 * Design (iOS HIG):
 * - Search: full-width, bg-surface, 1px border, no heavy shadow
 * - View toggle: Cards | Table segmented control
 * - Controls: row of ghost buttons with icon + label
 * - Filter badge shows count when filters active
 * - Sort/Export always visible, Columns only in Table view
 * - No solid blue bar — content-first, quiet chrome
 */
export function MobileToolbar<TData>({
  search,
  onSearchChange,
  searchPlaceholder = 'Search...',
  activeFiltersCount = 0,
  onFilterClick,
  sortOptions = [],
  currentSort,
  onSortChange,
  columns = [],
  onToggleColumn,
  onShowAllColumns,
  onHideAllColumns,
  visibleRows = [],
  gridId = 'grid',
  viewMode: viewModeProp,
  onViewModeChange,
  className,
}: MobileToolbarProps<TData>) {
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  const [columnsSheetOpen, setColumnsSheetOpen] = useState(false);

  // Local view mode state (falls back to localStorage if no prop)
  const [localViewMode, setLocalViewMode] = useState<MobileViewMode>('cards');

  // Sync with localStorage on mount
  useEffect(() => {
    if (viewModeProp === undefined) {
      const stored = localStorage.getItem(`grid-view-mode-${gridId}`);
      if (stored === 'cards' || stored === 'table') {
        setLocalViewMode(stored);
      }
    }
  }, [gridId, viewModeProp]);

  const viewMode = viewModeProp ?? localViewMode;

  const handleViewModeChange = (mode: MobileViewMode) => {
    if (onViewModeChange) {
      onViewModeChange(mode);
    } else {
      setLocalViewMode(mode);
      localStorage.setItem(`grid-view-mode-${gridId}`, mode);
    }
  };

  // Handle export
  const handleExport = () => {
    // Build column defs from the columns prop for export
    const columnDefs = columns.map((col) => ({
      id: col.id,
      accessorKey: col.id,
      header: col.name,
    })) as ExtendedColumnDef<TData>[];

    exportVisible(visibleRows, columnDefs, gridId);
  };

  return (
    <div
      className={cn(
        'p-3 space-y-2',
        'bg-[var(--grid-paper,#FFFFFF)] dark:bg-[var(--grid-paper,#1A1D23)]',
        'border-b border-[var(--grid-border-header)]',
        className
      )}
    >
      {/* Search input — full width, quiet style */}
      <div className="relative">
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
            'h-10 pl-9 rounded-lg',
            'bg-[var(--grid-paper,#FFFFFF)] dark:bg-[var(--grid-paper,#1A1D23)]',
            'border-[var(--grid-n200,#D0D1D7)]/40',
            'focus:border-[var(--grid-accent,#0A21C0)]/60',
            'focus:ring-0 focus:ring-offset-0'
          )}
          style={{
            fontFamily: "var(--grid-font-ui, 'Inter', sans-serif)",
          }}
        />
      </div>

      {/* View toggle — Cards | Table segmented control */}
      <div className="flex items-center justify-center gap-1 p-1 rounded-lg bg-[var(--grid-n100,#EBEDF0)]/50 dark:bg-[var(--grid-n800,#2A2E36)]/50">
        <button
          type="button"
          onClick={() => handleViewModeChange('cards')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md',
            'text-sm font-medium transition-all duration-150',
            'min-h-[44px]', // iOS HIG touch target
            viewMode === 'cards'
              ? 'bg-[var(--grid-paper,#FFFFFF)] dark:bg-[var(--grid-paper,#1A1D23)] text-[var(--grid-ink,#141619)] shadow-sm'
              : 'text-[var(--grid-n500,#6B6E78)] hover:text-[var(--grid-ink,#141619)]'
          )}
          style={{ fontFamily: "var(--grid-font-ui, 'Inter', sans-serif)" }}
        >
          <LayoutGrid className="h-4 w-4" strokeWidth={1.6} />
          Cards
        </button>
        <button
          type="button"
          onClick={() => handleViewModeChange('table')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md',
            'text-sm font-medium transition-all duration-150',
            'min-h-[44px]', // iOS HIG touch target
            viewMode === 'table'
              ? 'bg-[var(--grid-paper,#FFFFFF)] dark:bg-[var(--grid-paper,#1A1D23)] text-[var(--grid-ink,#141619)] shadow-sm'
              : 'text-[var(--grid-n500,#6B6E78)] hover:text-[var(--grid-ink,#141619)]'
          )}
          style={{ fontFamily: "var(--grid-font-ui, 'Inter', sans-serif)" }}
        >
          <Table2 className="h-4 w-4" strokeWidth={1.6} />
          Table
        </button>
      </div>

      {/* Control buttons — ghost style, horizontal row */}
      <div className="flex items-center gap-2">
        {/* Filter button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onFilterClick}
          className={cn(
            'flex-1 justify-center gap-2 min-h-[44px]',
            'text-[var(--grid-n500,#6B6E78)] hover:text-[var(--grid-ink,#141619)]',
            'hover:bg-[var(--grid-toolbar-hover)]'
          )}
          style={{
            fontFamily: "var(--grid-font-ui, 'Inter', sans-serif)",
          }}
        >
          <Filter className="h-4 w-4" strokeWidth={1.6} />
          <span className="text-sm">Filter</span>
          {activeFiltersCount > 0 && (
            <Badge
              variant="secondary"
              className="h-5 min-w-[20px] rounded-full px-1.5 text-xs"
              style={{
                backgroundColor: 'var(--grid-accent-l50, #E7EAFF)',
                color: 'var(--grid-accent, #0A21C0)',
              }}
            >
              {activeFiltersCount}
            </Badge>
          )}
        </Button>

        {/* Sort button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSortSheetOpen(true)}
          className={cn(
            'flex-1 justify-center gap-2 min-h-[44px]',
            'text-[var(--grid-n500,#6B6E78)] hover:text-[var(--grid-ink,#141619)]',
            'hover:bg-[var(--grid-toolbar-hover)]',
            currentSort && 'text-[var(--grid-accent,#0A21C0)]'
          )}
          style={{
            fontFamily: "var(--grid-font-ui, 'Inter', sans-serif)",
          }}
        >
          <ArrowUpDown className="h-4 w-4" strokeWidth={1.6} />
          <span className="text-sm">Sort</span>
        </Button>

        {/* Export button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleExport}
          className={cn(
            'flex-1 justify-center gap-2 min-h-[44px]',
            'text-[var(--grid-n500,#6B6E78)] hover:text-[var(--grid-ink,#141619)]',
            'hover:bg-[var(--grid-toolbar-hover)]'
          )}
          style={{
            fontFamily: "var(--grid-font-ui, 'Inter', sans-serif)",
          }}
        >
          <Download className="h-4 w-4" strokeWidth={1.6} />
          <span className="text-sm">Export</span>
        </Button>

        {/* Columns button — only shown in Table view */}
        {viewMode === 'table' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setColumnsSheetOpen(true)}
            className={cn(
              'flex-1 justify-center gap-2 min-h-[44px]',
              'text-[var(--grid-n500,#6B6E78)] hover:text-[var(--grid-ink,#141619)]',
              'hover:bg-[var(--grid-toolbar-hover)]'
            )}
            style={{
              fontFamily: "var(--grid-font-ui, 'Inter', sans-serif)",
            }}
          >
            <Columns className="h-4 w-4" strokeWidth={1.6} />
            <span className="text-sm">Columns</span>
          </Button>
        )}
      </div>

      {/* Sort Bottom Sheet */}
      <MobileSortSheet
        open={sortSheetOpen}
        onOpenChange={setSortSheetOpen}
        options={sortOptions}
        currentSort={currentSort}
        onSortChange={onSortChange}
      />

      {/* Columns Bottom Sheet (only rendered in Table view) */}
      {viewMode === 'table' && (
        <MobileColumnsSheet
          open={columnsSheetOpen}
          onOpenChange={setColumnsSheetOpen}
          columns={columns}
          onToggleColumn={onToggleColumn}
          onShowAll={onShowAllColumns}
          onHideAll={onHideAllColumns}
        />
      )}
    </div>
  );
}
