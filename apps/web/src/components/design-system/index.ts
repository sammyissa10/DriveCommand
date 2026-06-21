/**
 * DriveCommand Design System
 *
 * Consolidated, reusable components built on shadcn/ui primitives.
 * See DESIGN_SYSTEM.md in the repo root for usage guidelines.
 */

// Form components
export { FormField, getFieldErrors, type FormFieldProps } from './FormField';
export {
  FormSection,
  FormRow,
  type FormSectionProps,
  type FormRowProps,
} from './FormSection';

// Status & alerts
export {
  AlertBadge,
  getExpiryVariant,
  formatExpiryMessage,
  type AlertBadgeProps,
} from './AlertBadge';

// Data display
export {
  KPICard,
  KPICardGrid,
  type KPICardProps,
  type KPITrend,
} from './KPICard';

// Search & filters
export {
  SearchBar,
  ActiveFilters,
  type SearchBarProps,
  type ActiveFilter,
  type ActiveFiltersProps,
} from './SearchBar';

// Record layouts
export {
  RecordLayout,
  RecordSection,
  RecordField,
  RecordFieldGrid,
  RecordHeader,
  type RecordLayoutProps,
  type RecordSectionProps,
  type RecordFieldProps,
  type RecordFieldGridProps,
  type RecordHeaderProps,
} from './RecordLayout';

// Re-export StatusBadge from data-grid (canonical source)
export {
  StatusBadge,
  getStatusVariant,
  type StatusBadgeProps,
  type StatusBadgeVariant,
} from '@/components/data-grid/shell/shared/StatusBadge';
