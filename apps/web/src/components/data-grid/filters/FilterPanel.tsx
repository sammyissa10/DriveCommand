'use client';

/**
 * FilterPanel - Slide-out panel for managing grid filters.
 *
 * 400px wide slide-out from right with filter builder UI:
 * - Add filter button with column picker
 * - Active filters with remove capability
 * - Apply button to commit changes
 */

import * as React from 'react';
import { X, Plus, Filter as FilterIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TextFilter } from './filterTypes/TextFilter';
import { SelectFilter } from './filterTypes/SelectFilter';
import { DateRangeFilter } from './filterTypes/DateRangeFilter';
import { NumberRangeFilter } from './filterTypes/NumberRangeFilter';
import type {
  GridFilter,
  ExtendedColumnDef,
  FilterType,
  TextFilterOperator,
  SelectFilterOperator,
  DateFilterOperator,
  NumberFilterOperator,
} from '../core/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FilterPanelProps<TData> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: ExtendedColumnDef<TData>[];
  filters: GridFilter[];
  onFiltersChange: (filters: GridFilter[]) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDefaultOperator(filterType: FilterType): string {
  switch (filterType) {
    case 'text':
      return 'contains';
    case 'select':
      return 'anyOf';
    case 'number':
      return 'eq';
    case 'date':
      return 'is';
    case 'boolean':
      return 'equals';
    default:
      return 'equals';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FilterPanel<TData>({
  open,
  onOpenChange,
  columns,
  filters,
  onFiltersChange,
}: FilterPanelProps<TData>) {
  // Local state for editing filters before applying
  const [localFilters, setLocalFilters] = React.useState<GridFilter[]>(filters);

  // Sync local filters when external filters change
  React.useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  // Get filterable columns
  const filterableColumns = React.useMemo(() => {
    return columns.filter((col) => {
      const filterType = col.meta?.filterType;
      return filterType !== undefined;
    });
  }, [columns]);

  // Get column label
  const getColumnLabel = (columnId: string) => {
    const column = filterableColumns.find((col) => {
      const colId = 'accessorKey' in col ? String(col.accessorKey) : col.id;
      return colId === columnId;
    });
    if (!column) return columnId;
    return typeof column.header === 'string' ? column.header : columnId;
  };

  // Get column filter type
  const getColumnFilterType = (columnId: string): FilterType => {
    const column = filterableColumns.find((col) => {
      const colId = 'accessorKey' in col ? String(col.accessorKey) : col.id;
      return colId === columnId;
    });
    return column?.meta?.filterType ?? 'text';
  };

  // Get filter options for select type
  const getColumnFilterOptions = (columnId: string) => {
    const column = filterableColumns.find((col) => {
      const colId = 'accessorKey' in col ? String(col.accessorKey) : col.id;
      return colId === columnId;
    });
    return column?.meta?.filterOptions ?? [];
  };

  // Add new filter
  const handleAddFilter = (columnId: string) => {
    const filterType = getColumnFilterType(columnId);
    const operator = getDefaultOperator(filterType);

    const newFilter: GridFilter = {
      columnId,
      operator: operator as GridFilter['operator'],
      value: filterType === 'select' ? [] : '',
    };

    setLocalFilters([...localFilters, newFilter]);
  };

  // Remove filter
  const handleRemoveFilter = (index: number) => {
    setLocalFilters(localFilters.filter((_, i) => i !== index));
  };

  // Update filter operator
  const handleUpdateOperator = (index: number, operator: string) => {
    const updated = [...localFilters];
    updated[index] = { ...updated[index], operator: operator as GridFilter['operator'] };
    setLocalFilters(updated);
  };

  // Update filter value
  const handleUpdateValue = (index: number, value: unknown) => {
    const updated = [...localFilters];
    updated[index] = { ...updated[index], value };
    setLocalFilters(updated);
  };

  // Apply filters
  const handleApply = () => {
    onFiltersChange(localFilters);
    onOpenChange(false);
  };

  // Clear all filters
  const handleClearAll = () => {
    setLocalFilters([]);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px] sm:w-[400px]">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Add and configure filters for this grid</SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-200px)] pr-4">
          <div className="space-y-4 py-4">
            {/* Active filters */}
            {localFilters.map((filter, index) => {
              const filterType = getColumnFilterType(filter.columnId);
              const filterOptions = getColumnFilterOptions(filter.columnId);

              return (
                <div key={index} className="border border-border rounded-lg p-3 space-y-3">
                  {/* Header: column name + remove button */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {getColumnLabel(filter.columnId)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveFilter(index)}
                      aria-label="Remove filter"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Filter type-specific UI */}
                  {filterType === 'text' && (
                    <TextFilter
                      value={String(filter.value ?? '')}
                      onChange={(val) => handleUpdateValue(index, val)}
                      operator={filter.operator as TextFilterOperator}
                      onOperatorChange={(op) => handleUpdateOperator(index, op)}
                    />
                  )}

                  {filterType === 'select' && (
                    <SelectFilter
                      value={Array.isArray(filter.value) ? filter.value : []}
                      onChange={(val) => handleUpdateValue(index, val)}
                      operator={filter.operator as SelectFilterOperator}
                      onOperatorChange={(op) => handleUpdateOperator(index, op)}
                      options={filterOptions}
                    />
                  )}

                  {filterType === 'number' && (
                    <NumberRangeFilter
                      value={
                        typeof filter.value === 'object' && filter.value !== null
                          ? (filter.value as { min?: number; max?: number })
                          : { min: undefined, max: undefined }
                      }
                      onChange={(val) => handleUpdateValue(index, val)}
                      operator={filter.operator as NumberFilterOperator}
                      onOperatorChange={(op) => handleUpdateOperator(index, op)}
                    />
                  )}

                  {filterType === 'date' && (
                    <DateRangeFilter
                      value={
                        typeof filter.value === 'object' && filter.value !== null
                          ? (filter.value as { from?: Date; to?: Date; days?: number })
                          : { from: undefined, to: undefined }
                      }
                      onChange={(val) => handleUpdateValue(index, val)}
                      operator={filter.operator as DateFilterOperator}
                      onOperatorChange={(op) => handleUpdateOperator(index, op)}
                    />
                  )}
                </div>
              );
            })}

            {/* Add filter button */}
            <Select onValueChange={handleAddFilter}>
              <SelectTrigger className="w-full">
                <div className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  <span>Add filter</span>
                </div>
              </SelectTrigger>
              <SelectContent>
                {filterableColumns.map((column) => {
                  const colId = 'accessorKey' in column ? String(column.accessorKey) : column.id;
                  if (!colId) return null;

                  // Skip if already filtered
                  if (localFilters.some((f) => f.columnId === colId)) return null;

                  const label = typeof column.header === 'string' ? column.header : colId;

                  return (
                    <SelectItem key={colId} value={colId}>
                      {label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </ScrollArea>

        <SheetFooter className="flex flex-row justify-between items-center">
          {localFilters.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleClearAll}>
              Clear all
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleApply}>
              <FilterIcon className="mr-2 h-4 w-4" />
              Apply
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
