'use client';

/**
 * Hook for syncing grid state (sort, page, pageSize, search, filters) to URL via nuqs.
 *
 * Enables shareable views and browser back/forward navigation.
 */

import { useCallback, useMemo } from 'react';
import { parseAsInteger, parseAsString, parseAsJson, useQueryState } from 'nuqs';
import type { GridFilter, SortState, UseGridUrlStateReturn } from './types';

// ---------------------------------------------------------------------------
// Sort String Parsing
// ---------------------------------------------------------------------------

/**
 * Parse sort string (e.g., "name:asc") into SortState object.
 */
export function parseSortString(sortStr: string | null): SortState | null {
  if (!sortStr) return null;
  const [field, direction] = sortStr.split(':');
  if (!field || (direction !== 'asc' && direction !== 'desc')) {
    return null;
  }
  return { field, direction };
}

/**
 * Format SortState object into sort string (e.g., "name:asc").
 */
export function formatSortString(sort: SortState | null): string | null {
  if (!sort) return null;
  return `${sort.field}:${sort.direction}`;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGridUrlState(enabled: boolean = true): UseGridUrlStateReturn {
  // Sort: "field:asc" or "field:desc"
  const [sortStr, setSortStr] = useQueryState(
    'sort',
    parseAsString.withOptions({ shallow: false, history: 'push' })
  );

  // Page number (1-indexed for URL, but we store 0-indexed internally)
  const [pageParam, setPageParam] = useQueryState(
    'page',
    parseAsInteger.withDefault(1).withOptions({ shallow: false, history: 'push' })
  );

  // Page size
  const [pageSizeParam, setPageSizeParam] = useQueryState(
    'pageSize',
    parseAsInteger.withDefault(25).withOptions({ shallow: false, history: 'push' })
  );

  // Search query
  const [searchParam, setSearchParam] = useQueryState(
    'q',
    parseAsString.withDefault('').withOptions({ shallow: false, history: 'push' })
  );

  // Filters (JSON serialized) - validator ensures type safety
  const filtersValidator = (value: unknown): GridFilter[] | null => {
    if (!Array.isArray(value)) return null;
    // Basic validation - each item should have columnId, operator, value
    const isValid = value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        'columnId' in item &&
        'operator' in item &&
        'value' in item
    );
    return isValid ? (value as GridFilter[]) : null;
  };
  const [filtersParam, setFiltersParam] = useQueryState(
    'filters',
    parseAsJson(filtersValidator).withDefault([]).withOptions({ shallow: false, history: 'push' })
  );

  // Derived values
  const sort = useMemo(() => (enabled ? parseSortString(sortStr) : null), [enabled, sortStr]);
  const page = enabled ? pageParam - 1 : 0; // Convert to 0-indexed
  const pageSize = enabled ? pageSizeParam : 25;
  const search = enabled ? searchParam : '';
  const filters = enabled ? filtersParam : [];

  // Setters
  const setSort = useCallback(
    (newSort: SortState | null) => {
      if (!enabled) return;
      void setSortStr(formatSortString(newSort));
    },
    [enabled, setSortStr]
  );

  const setPage = useCallback(
    (newPage: number) => {
      if (!enabled) return;
      // Convert from 0-indexed to 1-indexed for URL
      void setPageParam(newPage + 1);
    },
    [enabled, setPageParam]
  );

  const setPageSize = useCallback(
    (newSize: number) => {
      if (!enabled) return;
      void setPageSizeParam(newSize);
      // Reset to first page when page size changes
      void setPageParam(1);
    },
    [enabled, setPageSizeParam, setPageParam]
  );

  const setSearch = useCallback(
    (newSearch: string) => {
      if (!enabled) return;
      void setSearchParam(newSearch || null);
      // Reset to first page when search changes
      void setPageParam(1);
    },
    [enabled, setSearchParam, setPageParam]
  );

  const setFilters = useCallback(
    (newFilters: GridFilter[]) => {
      if (!enabled) return;
      void setFiltersParam(newFilters.length > 0 ? newFilters : null);
      // Reset to first page when filters change
      void setPageParam(1);
    },
    [enabled, setFiltersParam, setPageParam]
  );

  return {
    sort,
    setSort,
    page,
    setPage,
    pageSize,
    setPageSize,
    search,
    setSearch,
    filters,
    setFilters,
  };
}
