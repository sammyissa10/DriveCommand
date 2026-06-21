'use client';

import * as React from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/**
 * SearchBar — Wide search field with inline filter button.
 *
 * Design rules:
 * - Generously sized with comfortably large, readable text
 * - Filter button at right edge opens advanced/saved filters
 * - Clear button appears when there's input
 * - Text must never overflow or clip
 *
 * @example
 * <SearchBar
 *   value={search}
 *   onChange={setSearch}
 *   placeholder="Search trucks by unit # or VIN..."
 *   onFilterClick={() => setFilterOpen(true)}
 *   filterCount={activeFilters.length}
 * />
 */

export interface SearchBarProps {
  /** Current search value */
  value: string;
  /** Change handler */
  onChange: (value: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Handler for filter button click */
  onFilterClick?: () => void;
  /** Number of active filters (shows badge on filter button) */
  filterCount?: number;
  /** Show filter button */
  showFilterButton?: boolean;
  /** Additional className */
  className?: string;
  /** Auto focus on mount */
  autoFocus?: boolean;
}

export function SearchBar({
  value,
  onChange,
  placeholder = 'Search...',
  onFilterClick,
  filterCount = 0,
  showFilterButton = true,
  className,
  autoFocus = false,
}: SearchBarProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleClear = () => {
    onChange('');
    inputRef.current?.focus();
  };

  return (
    <div
      className={cn(
        'relative flex items-center w-full',
        'rounded-lg border border-border bg-card',
        'focus-within:ring-2 focus-within:ring-ring focus-within:border-primary',
        'transition-all duration-fast',
        className
      )}
    >
      {/* Search icon */}
      <div className="pl-4 flex items-center pointer-events-none">
        <Search
          className="h-5 w-5 text-muted-foreground"
          strokeWidth={1.5}
        />
      </div>

      {/* Input */}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={cn(
          'flex-1 h-12 px-3 bg-transparent',
          'text-base text-foreground placeholder:text-muted-foreground',
          'focus:outline-none',
          'min-w-0' // Prevent overflow
        )}
      />

      {/* Clear button */}
      {value && (
        <button
          type="button"
          onClick={handleClear}
          className={cn(
            'p-2 rounded-md',
            'text-muted-foreground hover:text-foreground',
            'hover:bg-muted',
            'transition-colors duration-fast'
          )}
          aria-label="Clear search"
        >
          <X className="h-4 w-4" strokeWidth={1.5} />
        </button>
      )}

      {/* Filter button */}
      {showFilterButton && onFilterClick && (
        <div className="pr-2 flex items-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onFilterClick}
            className="relative gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <SlidersHorizontal className="h-4 w-4" strokeWidth={1.5} />
            <span className="hidden sm:inline">Filters</span>
            {filterCount > 0 && (
              <span
                className={cn(
                  'absolute -top-1 -right-1',
                  'min-w-[18px] h-[18px] px-1',
                  'flex items-center justify-center',
                  'rounded-full bg-primary text-primary-foreground',
                  'text-[10px] font-medium'
                )}
              >
                {filterCount}
              </span>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * ActiveFilters — Displays active filter pills with clear functionality.
 *
 * @example
 * <ActiveFilters
 *   filters={[
 *     { id: 'status', label: 'Status: Active' },
 *     { id: 'type', label: 'Type: Semi' },
 *   ]}
 *   onRemove={(id) => removeFilter(id)}
 *   onClearAll={() => clearAllFilters()}
 * />
 */
export interface ActiveFilter {
  id: string;
  label: string;
}

export interface ActiveFiltersProps {
  filters: ActiveFilter[];
  onRemove: (id: string) => void;
  onClearAll: () => void;
  className?: string;
}

export function ActiveFilters({
  filters,
  onRemove,
  onClearAll,
  className,
}: ActiveFiltersProps) {
  if (filters.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {filters.map((filter) => (
        <button
          key={filter.id}
          type="button"
          onClick={() => onRemove(filter.id)}
          className={cn(
            'inline-flex items-center gap-1.5',
            'px-2.5 py-1 rounded-md',
            'bg-muted text-sm text-foreground',
            'hover:bg-muted/80',
            'transition-colors duration-fast',
            'group'
          )}
        >
          <span>{filter.label}</span>
          <X
            className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground"
            strokeWidth={1.5}
          />
        </button>
      ))}

      <button
        type="button"
        onClick={onClearAll}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        Clear all
      </button>
    </div>
  );
}
