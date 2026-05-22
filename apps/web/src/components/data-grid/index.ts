/**
 * Single-source DataGrid widget. Visual or behavior changes here propagate to every consumer. Do not fork.
 *
 * @example
 * import { DataGrid, useDataGrid, useDataGridContext } from '@/components/data-grid';
 */

// Main component
export { DataGrid, useDataGridContext } from './core/DataGrid';

// Orchestration hook
export { useDataGrid } from './core/useDataGrid';

// Individual hooks for advanced use
export { useGridPreferences } from './core/useGridPreferences';
export { useGridUrlState, parseSortString, formatSortString } from './core/useGridUrlState';
export { useGridSelection, computeSelectionRange } from './core/useGridSelection';

// Types
export type {
  // Column definitions
  FilterType,
  DensityMode,
  SortDirection,
  SortState,
  DataGridColumnMeta,
  ExtendedColumnDef,
  // Grid state
  FilterOperator,
  TextFilterOperator,
  SelectFilterOperator,
  NumberFilterOperator,
  DateFilterOperator,
  GridFilter,
  PaginationState,
  GridState,
  GridViewState,
  // Server-side
  ServerFetchParams,
  ServerFetchResult,
  ServerDataFetcher,
  // Preferences
  GridPreferences,
  // Render props
  RenderHeaderFn,
  RenderRowFn,
  RenderEmptyFn,
  RenderLoadingFn,
  // Component props
  DataGridProps,
  DataGridRef,
  DataGridContextValue,
  // Hook returns
  UseGridPreferencesReturn,
  UseGridUrlStateReturn,
  UseGridSelectionReturn,
  UseDataGridReturn,
} from './core/types';

// Default preferences constant
export { DEFAULT_GRID_PREFERENCES } from './core/types';

// Shell components (visual layer)
export * from './shell';

// Filter system
export * from './filters';

// Saved views
export * from './views';

// Inline edit
export * from './inline-edit';

// CSV export
export * from './export';
