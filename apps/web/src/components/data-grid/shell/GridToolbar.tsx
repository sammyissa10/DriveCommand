'use client';

/**
 * GridToolbar - Sticky toolbar for DataGrid.
 *
 * Provides search input (debounced 300ms), density toggle, column visibility,
 * CSV export, and optional "New" button.
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
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useDataGridContext } from '../core/DataGrid';
import type { DensityMode } from '../core/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GridToolbarProps {
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

export function GridToolbar({
  onNew,
  showNew = false,
  searchPlaceholder = 'Search...',
  exportFilename = 'export',
  className,
  onSearch,
  searchValue: controlledSearchValue,
}: GridToolbarProps) {
  const { table, preferences, density } = useDataGridContext();

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
    // Note: In a real implementation, this would call preferences.setDensity
    console.log('Set density:', value);
  };

  // Handle export
  const handleExport = () => {
    // Get visible data
    const rows = table.getRowModel().rows;
    const columns = table.getVisibleLeafColumns();

    // Build CSV content
    const headers = columns.map((col) => {
      const header = col.columnDef.header;
      if (typeof header === 'string') return header;
      return col.id;
    });

    const csvRows = rows.map((row) => {
      return columns.map((col) => {
        const value = row.getValue(col.id);
        if (value === null || value === undefined) return '';
        const stringValue = String(value);
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      });
    });

    const csvContent = [headers.join(','), ...csvRows.map((row) => row.join(','))].join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${exportFilename}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <TooltipProvider>
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
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExport}
              aria-label="Export to CSV"
            >
              <Download className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Export to CSV</TooltipContent>
        </Tooltip>

        {/* New button */}
        {showNew && (
          <Button variant="default" size="sm" onClick={onNew}>
            <Plus className="h-4 w-4 mr-1" />
            New
          </Button>
        )}
      </div>
    </TooltipProvider>
  );
}
