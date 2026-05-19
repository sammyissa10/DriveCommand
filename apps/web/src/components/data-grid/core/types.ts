/**
 * DataGrid type definitions.
 *
 * Provides comprehensive types for the headless DataGrid component system,
 * including column definitions, grid state, preferences, and server-side data fetching.
 */

import type { ColumnDef, Row, Table } from '@tanstack/react-table';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Enums & Base Types
// ---------------------------------------------------------------------------

/**
 * Filter types supported by columns.
 */
export type FilterType = 'text' | 'number' | 'date' | 'select' | 'boolean';

/**
 * Display density modes for the grid.
 */
export type DensityMode = 'compact' | 'normal' | 'comfortable';

/**
 * Sort direction for URL state.
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Parsed sort state from URL.
 */
export interface SortState {
  field: string;
  direction: SortDirection;
}

// ---------------------------------------------------------------------------
// Column Definition Extensions
// ---------------------------------------------------------------------------

/**
 * Additional DataGrid-specific column properties.
 */
export interface DataGridColumnMeta {
  /** Whether this column can be frozen (pinned left) */
  freezable?: boolean;
  /** Whether this column should be frozen by default */
  defaultFrozen?: boolean;
  /** Filter type for this column */
  filterType?: FilterType;
  /** Options for select filter type */
  filterOptions?: Array<{ value: string; label: string }>;
  /** Whether this column is editable inline */
  editable?: boolean;
  /** Type of inline editor ('text' | 'select' | 'date') */
  editType?: 'text' | 'select' | 'date';
  /** Whether this column should be included in CSV export */
  exportable?: boolean;
  /** Custom export value formatter */
  exportValue?: <TData>(row: TData) => string;
  /** Minimum column width in pixels */
  minWidth?: number;
  /** Maximum column width in pixels */
  maxWidth?: number;
  /** Default column width in pixels */
  defaultWidth?: number;
}

/**
 * Extended column definition with DataGrid-specific properties.
 * Combines TanStack Table's ColumnDef with DataGrid metadata.
 */
export type ExtendedColumnDef<TData> = ColumnDef<TData, unknown> & {
  /** DataGrid-specific metadata */
  meta?: DataGridColumnMeta;
};

// ---------------------------------------------------------------------------
// Grid State & Filtering
// ---------------------------------------------------------------------------

/**
 * Text filter operators.
 */
export type TextFilterOperator =
  | 'contains'
  | 'equals'
  | 'startsWith'
  | 'endsWith'
  | 'isEmpty'
  | 'isNotEmpty';

/**
 * Select filter operators.
 */
export type SelectFilterOperator = 'anyOf' | 'noneOf' | 'isEmpty';

/**
 * Number filter operators.
 */
export type NumberFilterOperator = 'eq' | 'neq' | 'gt' | 'lt' | 'between' | 'isEmpty';

/**
 * Date filter operators.
 */
export type DateFilterOperator =
  | 'is'
  | 'before'
  | 'after'
  | 'between'
  | 'inLastNDays'
  | 'isEmpty';

/**
 * All filter operator types combined.
 */
export type FilterOperator =
  | TextFilterOperator
  | SelectFilterOperator
  | NumberFilterOperator
  | DateFilterOperator;

/**
 * Single filter definition.
 */
export interface GridFilter {
  columnId: string;
  operator: FilterOperator;
  value: unknown;
  /** Second value for 'between' operator */
  valueTo?: unknown;
}

/**
 * Pagination state.
 */
export interface PaginationState {
  pageIndex: number;
  pageSize: number;
}

/**
 * Combined grid state for data fetching.
 */
export interface GridState {
  sorting: SortState | null;
  pagination: PaginationState;
  filters: GridFilter[];
  search: string;
  selection: Set<string>;
}

/**
 * Serializable grid view state for saved views.
 */
export interface GridViewState {
  filters: GridFilter[];
  sort: SortState | null;
  columnOrder: string[];
  columnWidths: Record<string, number>;
  hiddenColumns: string[];
  frozenColumns: string[];
  density: DensityMode;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Server-Side Data Fetching
// ---------------------------------------------------------------------------

/**
 * Parameters passed to server-side data fetcher.
 */
export interface ServerFetchParams {
  sort: SortState | null;
  page: number;
  pageSize: number;
  filters: GridFilter[];
  search: string;
}

/**
 * Response from server-side data fetcher.
 */
export interface ServerFetchResult<TData> {
  rows: TData[];
  total: number;
}

/**
 * Server-side data fetcher function type.
 */
export type ServerDataFetcher<TData> = (
  params: ServerFetchParams
) => Promise<ServerFetchResult<TData>>;

// ---------------------------------------------------------------------------
// Grid Preferences
// ---------------------------------------------------------------------------

/**
 * User grid preferences (stored in DB or localStorage).
 */
export interface GridPreferences {
  columnOrder: string[];
  columnWidths: Record<string, number>;
  hiddenColumns: string[];
  frozenColumns: string[];
  density: DensityMode;
  pageSize: number;
}

/**
 * Default grid preferences.
 */
export const DEFAULT_GRID_PREFERENCES: GridPreferences = {
  columnOrder: [],
  columnWidths: {},
  hiddenColumns: [],
  frozenColumns: [],
  density: 'normal',
  pageSize: 25,
};

// ---------------------------------------------------------------------------
// Render Props & Slots
// ---------------------------------------------------------------------------

/**
 * Render function for custom header rendering.
 */
export type RenderHeaderFn<TData> = (table: Table<TData>) => ReactNode;

/**
 * Render function for custom row rendering.
 */
export type RenderRowFn<TData> = (row: Row<TData>, index: number) => ReactNode;

/**
 * Render function for empty state.
 */
export type RenderEmptyFn = () => ReactNode;

/**
 * Render function for loading state.
 */
export type RenderLoadingFn = () => ReactNode;

// ---------------------------------------------------------------------------
// Component Props
// ---------------------------------------------------------------------------

/**
 * Props for the DataGrid component.
 */
export interface DataGridProps<TData> {
  /** Unique identifier for this grid (used for preference storage) */
  gridId: string;
  /** Column definitions */
  columns: ExtendedColumnDef<TData>[];
  /** Static data (mutually exclusive with dataFetcher) */
  data?: TData[];
  /** Server-side data fetcher (mutually exclusive with data) */
  dataFetcher?: ServerDataFetcher<TData>;
  /** Function to get unique row ID from data */
  rowIdAccessor?: (row: TData) => string;
  /** Initial page size (default: 25) */
  initialPageSize?: number;
  /** Enable row selection */
  enableSelection?: boolean;
  /** Enable URL sync for sort/page/filters/search */
  enableUrlSync?: boolean;
  /** Enable preference persistence (DB + localStorage fallback) */
  enablePersistence?: boolean;
  /** Callback when selection changes */
  onSelectionChange?: (selectedIds: Set<string>) => void;
  /** Callback when row is double-clicked */
  onRowDoubleClick?: (row: TData) => void;
  /** Callback when cell is edited inline (returns Promise for async save) */
  onCellEdit?: (
    rowId: string,
    columnId: string,
    newValue: unknown,
    oldValue: unknown
  ) => Promise<void>;
  /** Whether to refresh data after successful cell edit (default: true) */
  refreshAfterEdit?: boolean;
  /** Additional CSS class for the container */
  className?: string;
  /** Custom header renderer */
  renderHeader?: RenderHeaderFn<TData>;
  /** Custom row renderer */
  renderRow?: RenderRowFn<TData>;
  /** Custom empty state renderer */
  renderEmpty?: RenderEmptyFn;
  /** Custom loading state renderer */
  renderLoading?: RenderLoadingFn;
  /** Children for compound component pattern */
  children?: ReactNode;
}

// ---------------------------------------------------------------------------
// Imperative Ref API
// ---------------------------------------------------------------------------

/**
 * Imperative handle exposed via ref.
 */
export interface DataGridRef {
  /** Refresh data (re-fetch if using dataFetcher) */
  refresh: () => void;
  /** Reset all preferences to defaults */
  resetPreferences: () => void;
  /** Clear all selected rows */
  clearSelection: () => void;
  /** Export visible data to CSV */
  exportCsv: (filename?: string) => void;
}

// ---------------------------------------------------------------------------
// Context Value
// ---------------------------------------------------------------------------

/**
 * Value provided by DataGridContext.
 */
export interface DataGridContextValue<TData> {
  /** TanStack Table instance */
  table: Table<TData>;
  /** Whether data is loading */
  isLoading: boolean;
  /** Current preferences */
  preferences: GridPreferences;
  /** Selection state */
  selection: {
    selectedIds: Set<string>;
    selectRow: (id: string, event: React.MouseEvent | React.KeyboardEvent) => void;
    selectAll: () => void;
    clearSelection: () => void;
    isSelected: (id: string) => boolean;
    selectedCount: number;
  };
  /** Current density mode */
  density: DensityMode;
  /** Grid ID */
  gridId: string;
  /** Callback for inline cell editing */
  onCellEdit?: (
    rowId: string,
    columnId: string,
    newValue: unknown,
    oldValue: unknown
  ) => Promise<void>;
  /** Refresh function to re-fetch data */
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Hook Return Types
// ---------------------------------------------------------------------------

/**
 * Return type for useGridPreferences hook.
 */
export interface UseGridPreferencesReturn {
  preferences: GridPreferences;
  setColumnOrder: (order: string[]) => void;
  setColumnWidth: (columnId: string, width: number) => void;
  setHiddenColumns: (columns: string[]) => void;
  setFrozenColumns: (columns: string[]) => void;
  setDensity: (density: DensityMode) => void;
  setPageSize: (size: number) => void;
  resetPreferences: () => void;
  isLoading: boolean;
}

/**
 * Return type for useGridUrlState hook.
 */
export interface UseGridUrlStateReturn {
  sort: SortState | null;
  setSort: (sort: SortState | null) => void;
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  search: string;
  setSearch: (search: string) => void;
  filters: GridFilter[];
  setFilters: (filters: GridFilter[]) => void;
}

/**
 * Return type for useGridSelection hook.
 */
export interface UseGridSelectionReturn {
  selectedIds: Set<string>;
  selectRow: (id: string, event: React.MouseEvent | React.KeyboardEvent, allRowIds?: string[]) => void;
  selectRange: (startId: string, endId: string, allRowIds: string[]) => void;
  selectAll: (allRowIds: string[]) => void;
  clearSelection: () => void;
  isSelected: (id: string) => boolean;
  selectedCount: number;
}

/**
 * Return type for useDataGrid hook.
 */
export interface UseDataGridReturn<TData> {
  table: Table<TData>;
  isLoading: boolean;
  preferences: UseGridPreferencesReturn;
  selection: UseGridSelectionReturn;
  urlState: UseGridUrlStateReturn;
  refresh: () => void;
  resetPreferences: () => void;
  clearSelection: () => void;
  exportCsv: (filename?: string) => void;
}
