/**
 * DataGrid shell components (visual layer).
 *
 * These components consume the headless foundation from core/
 * and provide the styled, accessible UI.
 */

// Core layout components
export { GridShell, useGridShellContext, getDensityRowHeight } from './GridShell';
export { GridHeader } from './GridHeader';
export { GridBody } from './GridBody';
export { GridRow } from './GridRow';
export { GridCell } from './GridCell';
export { GridFooter } from './GridFooter';
export { GridToolbar } from './GridToolbar';

// Interaction components
export { BulkActionsBar, type BulkAction } from './BulkActionsBar';
export { QuickActions, type QuickAction } from './QuickActions';
export { ColumnDragHandle } from './ColumnDragHandle';
export { DeleteConfirmDialog } from './DeleteConfirmDialog';

// State components
export { EmptyState as GridEmptyState } from './EmptyState';
export { LoadingSkeleton as GridLoadingSkeleton } from './LoadingSkeleton';
export { ErrorState as GridErrorState } from './ErrorState';
