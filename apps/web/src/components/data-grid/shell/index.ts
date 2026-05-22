/**
 * DataGrid shell components (visual layer).
 *
 * DriveCommand brand aesthetic.
 * Signal Blue accent, JetBrains Mono for data, Inter for UI.
 * Responsive design with desktop table and mobile card views.
 */

// Import CSS tokens
import '../tokens/grid-tokens.css';

// Shared components
export { StatusBadge, getStatusVariant, type StatusBadgeVariant } from './shared/StatusBadge';
export { EmptyState } from './shared/EmptyState';
export { LoadingSkeleton } from './shared/LoadingSkeleton';
export { ErrorState } from './shared/ErrorState';
export { GridToolbar } from './shared/GridToolbar';
export { BulkActionsBar, type BulkAction } from './shared/BulkActionsBar';
export { QuickActions, type QuickAction } from './shared/QuickActions';
export { ColumnsMenu } from './shared/ColumnsMenu';
export { ColumnDragHandle } from './shared/ColumnDragHandle';

// Desktop components
export { GridHeader } from './desktop/GridHeader';
export { GridCell } from './desktop/GridCell';
export { GridRow } from './desktop/GridRow';
export { GridBody } from './desktop/GridBody';
export { GridFooter } from './desktop/GridFooter';

// Mobile components (iOS HIG compliant)
export { GridCard, type GridCardProps } from './mobile/GridCard';
export { GridCardList, type GridCardListProps } from './mobile/GridCardList';
export { MobileToolbar, type MobileToolbarProps } from './mobile/MobileToolbar';
export { MobileFAB, type MobileFABProps } from './mobile/MobileFAB';
export { MobileBottomSheet, type MobileBottomSheetProps } from './mobile/MobileBottomSheet';
export { MobileSortSheet, type MobileSortSheetProps } from './mobile/MobileSortSheet';
export { MobileColumnsSheet, type MobileColumnsSheetProps } from './mobile/MobileColumnsSheet';
export { MobileBulkActionsBar, type MobileBulkActionsBarProps } from './mobile/MobileBulkActionsBar';

// Main shell
export { GridShell, useGridShellContext, getDensityRowHeight } from './GridShell';

// Hooks
export { useBreakpoint } from '../hooks/useBreakpoint';
export { useSwipeGesture } from '../hooks/useSwipeGesture';
export { useLongPress } from '../hooks/useLongPress';
export { useColumnSizing, ColumnSizingProvider } from '../hooks/useColumnSizing';
export type { ColumnSizingContextValue } from '../hooks/useColumnSizing';
