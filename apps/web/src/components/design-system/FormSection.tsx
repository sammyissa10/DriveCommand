'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * FormSection — Titled group of form fields with consistent spacing.
 *
 * Design rules:
 * - Title is uppercase, small, muted, with tracking
 * - Consistent vertical spacing between fields
 * - Optional description below title
 *
 * @example
 * <FormSection title="Vehicle Information">
 *   <FormField label="Make" name="make" required>
 *     <Input name="make" />
 *   </FormField>
 *   <FormField label="Model" name="model" required>
 *     <Input name="model" />
 *   </FormField>
 * </FormSection>
 */

export interface FormSectionProps {
  /** Section title (displayed as uppercase header) */
  title: string;
  /** Optional description below the title */
  description?: string;
  /** Form fields within this section */
  children: React.ReactNode;
  /** Additional className for the wrapper */
  className?: string;
  /** Whether to show a top border (for non-first sections) */
  divider?: boolean;
}

export function FormSection({
  title,
  description,
  children,
  className,
  divider = false,
}: FormSectionProps) {
  return (
    <div
      className={cn(
        'space-y-4',
        divider && 'border-t border-border pt-6',
        className
      )}
    >
      <div className="space-y-1">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>

      <div className="space-y-4">{children}</div>
    </div>
  );
}

/**
 * FormRow — Horizontal layout for multiple fields (e.g., Make + Model).
 *
 * @example
 * <FormRow>
 *   <FormField label="Make" name="make">...</FormField>
 *   <FormField label="Model" name="model">...</FormField>
 * </FormRow>
 */
export interface FormRowProps {
  /** Form fields to display in a row */
  children: React.ReactNode;
  /** Number of columns (default: auto based on children count) */
  columns?: 1 | 2 | 3 | 4;
  /** Additional className */
  className?: string;
}

export function FormRow({ children, columns, className }: FormRowProps) {
  const childCount = React.Children.count(children);
  const cols = (columns ?? Math.min(childCount, 2)) as 1 | 2 | 3 | 4;

  const gridCols: Record<1 | 2 | 3 | 4, string> = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  };

  return (
    <div className={cn('grid gap-4', gridCols[cols], className)}>{children}</div>
  );
}
