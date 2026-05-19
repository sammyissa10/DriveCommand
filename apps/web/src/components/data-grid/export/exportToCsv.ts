/**
 * CSV export utilities using papaparse.
 *
 * Three modes:
 * 1. exportVisible - immediate download of visible rows
 * 2. exportSelected - immediate download of selected rows
 * 3. exportAll - async with progress, paginated fetch, 50k row cap
 */

import { unparse } from 'papaparse';
import { format } from 'date-fns';
import { toast } from 'sonner';
import type { ExtendedColumnDef, ServerDataFetcher, ServerFetchParams } from '../core/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_EXPORT_ROWS = 50000;
const EXPORT_PAGE_SIZE = 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get value from row for a column, respecting custom exportValue formatter.
 */
function getColumnValue<TData>(
  row: TData,
  column: ExtendedColumnDef<TData>
): string {
  // Use custom exportValue if provided
  if (column.meta?.exportValue) {
    return column.meta.exportValue(row);
  }

  // Extract value using accessorKey or accessorFn
  let value: unknown;

  if ('accessorKey' in column && typeof column.accessorKey === 'string') {
    // Handle nested keys like "user.name"
    const keys = column.accessorKey.split('.');
    value = keys.reduce((obj, key) => {
      if (obj && typeof obj === 'object') {
        return (obj as Record<string, unknown>)[key];
      }
      return undefined;
    }, row as unknown);
  } else if ('accessorFn' in column && column.accessorFn) {
    value = column.accessorFn(row, 0);
  }

  // Convert to string
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return format(value, 'yyyy-MM-dd');
  return String(value);
}

/**
 * Get column label for export header.
 */
function getColumnLabel<TData>(column: ExtendedColumnDef<TData>): string {
  if (typeof column.header === 'string') return column.header;
  if ('accessorKey' in column) return String(column.accessorKey);
  return column.id ?? 'Column';
}

/**
 * Filter columns to only exportable ones.
 */
function getExportableColumns<TData>(
  columns: ExtendedColumnDef<TData>[]
): ExtendedColumnDef<TData>[] {
  return columns.filter((col) => {
    // Exclude if explicitly marked non-exportable
    if (col.meta?.exportable === false) return false;
    // Include if has accessor
    return 'accessorKey' in col || 'accessorFn' in col;
  });
}

/**
 * Download CSV file.
 */
function downloadCsv(csvContent: string, filename: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Export Functions
// ---------------------------------------------------------------------------

/**
 * Export visible rows (in-memory, immediate download).
 */
export function exportVisible<TData>(
  rows: TData[],
  columns: ExtendedColumnDef<TData>[],
  gridId: string
) {
  const exportableColumns = getExportableColumns(columns);

  // Build headers
  const headers = exportableColumns.map((col) => getColumnLabel(col));

  // Build data rows
  const data = rows.map((row) => {
    return exportableColumns.map((col) => getColumnValue(row, col));
  });

  // Generate CSV
  const csv = unparse({
    fields: headers,
    data,
  });

  // Download
  const filename = `${gridId}-export-${format(new Date(), 'yyyy-MM-dd')}.csv`;
  downloadCsv(csv, filename);

  toast.success(`Exported ${rows.length} rows`);
}

/**
 * Export selected rows (in-memory, immediate download).
 */
export function exportSelected<TData>(
  selectedIds: Set<string>,
  allRows: TData[],
  columns: ExtendedColumnDef<TData>[],
  gridId: string,
  rowIdAccessor: (row: TData) => string
) {
  // Filter to selected rows
  const selectedRows = allRows.filter((row) => selectedIds.has(rowIdAccessor(row)));

  if (selectedRows.length === 0) {
    toast.error('No rows selected');
    return;
  }

  exportVisible(selectedRows, columns, gridId);
}

/**
 * Export all rows with server-side pagination and progress.
 * Hard cap at 50k rows.
 */
export async function exportAll<TData>(
  dataFetcher: ServerDataFetcher<TData>,
  columns: ExtendedColumnDef<TData>[],
  gridId: string,
  currentFilters: ServerFetchParams['filters'],
  currentSort: ServerFetchParams['sort'],
  currentSearch: string
) {
  const exportableColumns = getExportableColumns(columns);

  // Fetch first page to get total count
  const firstPage = await dataFetcher({
    sort: currentSort,
    page: 0,
    pageSize: EXPORT_PAGE_SIZE,
    filters: currentFilters,
    search: currentSearch,
  });

  const totalRows = firstPage.total;

  // Check row cap
  if (totalRows > MAX_EXPORT_ROWS) {
    toast.error(
      `Export limited to ${MAX_EXPORT_ROWS.toLocaleString()} rows. Current query has ${totalRows.toLocaleString()} rows. Please apply filters to reduce the result set.`
    );
    return;
  }

  if (totalRows === 0) {
    toast.error('No rows to export');
    return;
  }

  // Start progress toast
  const toastId = toast.loading(`Exporting 0 / ${totalRows.toLocaleString()} rows...`);

  try {
    // Collect all rows
    const allRows: TData[] = [...firstPage.rows];
    const totalPages = Math.ceil(totalRows / EXPORT_PAGE_SIZE);

    for (let page = 1; page < totalPages; page++) {
      const pageData = await dataFetcher({
        sort: currentSort,
        page,
        pageSize: EXPORT_PAGE_SIZE,
        filters: currentFilters,
        search: currentSearch,
      });

      allRows.push(...pageData.rows);

      // Update progress
      toast.loading(
        `Exporting ${allRows.length.toLocaleString()} / ${totalRows.toLocaleString()} rows...`,
        { id: toastId }
      );
    }

    // Build headers
    const headers = exportableColumns.map((col) => getColumnLabel(col));

    // Build data rows
    const data = allRows.map((row) => {
      return exportableColumns.map((col) => getColumnValue(row, col));
    });

    // Generate CSV
    const csv = unparse({
      fields: headers,
      data,
    });

    // Download
    const filename = `${gridId}-export-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    downloadCsv(csv, filename);

    toast.success(`Exported ${allRows.length.toLocaleString()} rows`, { id: toastId });
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : 'Export failed',
      { id: toastId }
    );
  }
}
