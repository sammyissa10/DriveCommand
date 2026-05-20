/**
 * MobileToolbar Component
 *
 * Compact toolbar for mobile DataGrid controls.
 * Vertical layout with search and action buttons.
 */

'use client';

import { Search, Filter, ArrowUpDown, Columns } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface MobileToolbarProps {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  activeFiltersCount?: number;
  onFilterClick?: () => void;
  onSortClick?: () => void;
  onColumnsClick?: () => void;
  className?: string;
}

/**
 * MobileToolbar provides compact controls for mobile DataGrid.
 *
 * Design:
 * - Layout: vertical stack with gap-2
 * - Search: full width, h-10, rounded-lg
 * - Button hierarchy: Filter is primary (variant="default", flex-1), Sort/Columns are ghost icon-only
 * - Active filter count badge (if filters > 0)
 * - Typography: text-sm
 * - Icons: strokeWidth={1.5}
 *
 * @example
 * <MobileToolbar
 *   search={search}
 *   onSearchChange={setSearch}
 *   activeFiltersCount={2}
 *   onFilterClick={() => {}}
 *   onSortClick={() => {}}
 *   onColumnsClick={() => {}}
 * />
 */
export function MobileToolbar({
  search,
  onSearchChange,
  searchPlaceholder = 'Search...',
  activeFiltersCount = 0,
  onFilterClick,
  onSortClick,
  onColumnsClick,
  className,
}: MobileToolbarProps) {
  return (
    <div className={cn('flex flex-col gap-2 p-3', className)}>
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.5} />
        <Input
          type="search"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => onSearchChange?.(e.target.value)}
          className="h-10 pl-9"
        />
      </div>

      {/* Action buttons - Filter primary, Sort/Columns secondary */}
      <div className="flex items-center gap-2">
        {/* Filter button - primary with text label (takes flex space) */}
        <Button
          variant="default"
          size="sm"
          onClick={onFilterClick}
          className="flex-1"
        >
          <Filter className="mr-2 h-4 w-4" strokeWidth={1.5} />
          Filter
          {activeFiltersCount > 0 && (
            <Badge variant="secondary" className="ml-2 h-5 min-w-[20px] rounded-full px-1 text-xs bg-background/20 text-primary-foreground">
              {activeFiltersCount}
            </Badge>
          )}
        </Button>

        {/* Sort button - ghost icon-only */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onSortClick}
          aria-label="Sort"
        >
          <ArrowUpDown className="h-4 w-4" strokeWidth={1.5} />
        </Button>

        {/* Columns button - ghost icon-only */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onColumnsClick}
          aria-label="Columns"
        >
          <Columns className="h-4 w-4" strokeWidth={1.5} />
        </Button>
      </div>
    </div>
  );
}
