'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * RecordLayout — Detail page layout with sections and right rail.
 *
 * Design rules:
 * - Main content area with sections on the left
 * - Summary rail on the right (sticky on desktop)
 * - Collapses to single column on mobile
 * - Supports view/edit mode switching
 *
 * @example
 * <RecordLayout
 *   rail={<ComplianceSummary truck={truck} />}
 *   railTitle="Summary"
 * >
 *   <RecordSection title="Vehicle Information">
 *     <RecordField label="Make" value={truck.make} />
 *     <RecordField label="Model" value={truck.model} />
 *   </RecordSection>
 * </RecordLayout>
 */

export interface RecordLayoutProps {
  /** Main content (sections) */
  children: React.ReactNode;
  /** Right rail content */
  rail?: React.ReactNode;
  /** Rail title */
  railTitle?: string;
  /** Additional className for main content */
  className?: string;
}

export function RecordLayout({
  children,
  rail,
  railTitle,
  className,
}: RecordLayoutProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
      {/* Main content */}
      <div className={cn('space-y-6 min-w-0', className)}>{children}</div>

      {/* Right rail */}
      {rail && (
        <aside className="lg:sticky lg:top-6 h-fit">
          <div className="rounded-lg border border-border bg-card p-4 space-y-4">
            {railTitle && (
              <h3 className="text-sm font-semibold text-foreground">
                {railTitle}
              </h3>
            )}
            {rail}
          </div>
        </aside>
      )}
    </div>
  );
}

/**
 * RecordSection — Titled section within a record detail page.
 *
 * @example
 * <RecordSection title="Vehicle Information" actions={<EditButton />}>
 *   <RecordField label="Make" value={truck.make} />
 * </RecordSection>
 */
export interface RecordSectionProps {
  /** Section title */
  title: string;
  /** Optional action buttons (e.g., Edit) */
  actions?: React.ReactNode;
  /** Section content */
  children: React.ReactNode;
  /** Additional className */
  className?: string;
}

export function RecordSection({
  title,
  actions,
  children,
  className,
}: RecordSectionProps) {
  return (
    <section
      className={cn('rounded-lg border border-border bg-card', className)}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {actions}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

/**
 * RecordField — Single field display in a record detail view.
 *
 * @example
 * <RecordField label="VIN" value={truck.vin} mono />
 * <RecordField label="Status" value={<StatusBadge variant="success">Active</StatusBadge>} />
 */
export interface RecordFieldProps {
  /** Field label */
  label: string;
  /** Field value (string, number, or React node) */
  value: React.ReactNode;
  /** Use monospace font for value */
  mono?: boolean;
  /** Additional className */
  className?: string;
}

export function RecordField({
  label,
  value,
  mono = false,
  className,
}: RecordFieldProps) {
  const isEmpty = value === null || value === undefined || value === '';

  return (
    <div className={cn('py-2', className)}>
      <dt className="text-xs font-medium text-muted-foreground mb-0.5">
        {label}
      </dt>
      <dd
        className={cn(
          'text-sm text-foreground',
          mono && 'font-mono',
          isEmpty && 'text-muted-foreground'
        )}
      >
        {isEmpty ? '—' : value}
      </dd>
    </div>
  );
}

/**
 * RecordFieldGrid — Grid layout for multiple fields.
 *
 * @example
 * <RecordFieldGrid columns={2}>
 *   <RecordField label="Make" value={truck.make} />
 *   <RecordField label="Model" value={truck.model} />
 * </RecordFieldGrid>
 */
export interface RecordFieldGridProps {
  children: React.ReactNode;
  columns?: 1 | 2 | 3 | 4;
  className?: string;
}

export function RecordFieldGrid({
  children,
  columns = 2,
  className,
}: RecordFieldGridProps) {
  const gridCols = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  };

  return (
    <dl className={cn('grid gap-x-6 gap-y-1', gridCols[columns], className)}>
      {children}
    </dl>
  );
}

/**
 * RecordHeader — Page header for a record detail/edit page.
 *
 * @example
 * <RecordHeader
 *   title={truck.displayName}
 *   subtitle={truck.vin}
 *   badge={<StatusBadge variant="success">Active</StatusBadge>}
 *   actions={<Button>Edit</Button>}
 * />
 */
export interface RecordHeaderProps {
  /** Record title (e.g., unit number) */
  title: string;
  /** Subtitle (e.g., VIN) */
  subtitle?: string;
  /** Status badge */
  badge?: React.ReactNode;
  /** Action buttons */
  actions?: React.ReactNode;
  /** Additional className */
  className?: string;
}

export function RecordHeader({
  title,
  subtitle,
  badge,
  actions,
  className,
}: RecordHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-center justify-between gap-4',
        className
      )}
    >
      <div className="space-y-1 min-w-0">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground truncate">
            {title}
          </h1>
          {badge}
        </div>
        {subtitle && (
          <p className="text-sm text-muted-foreground font-mono truncate">
            {subtitle}
          </p>
        )}
      </div>

      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
