/**
 * EmptyState Component
 *
 * Clean, minimal empty state for grids with no data or filtered results.
 * Vercel/Apple crisp-minimal aesthetic.
 */

import { Inbox, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  /** Type of empty state */
  variant?: 'no-data' | 'filtered';
  /** Custom title */
  title?: string;
  /** Custom description */
  description?: string;
  /** Optional CTA button text */
  ctaText?: string;
  /** Optional CTA button callback */
  onCta?: () => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * EmptyState displays a clean, minimal message when grid has no rows.
 *
 * Design: Centered layout with icon, title, description, optional CTA
 * Icons: Lucide with strokeWidth={1.5}
 * Typography: text-sm with font-medium titles
 *
 * @example
 * <EmptyState variant="no-data" />
 * <EmptyState variant="filtered" ctaText="Clear filters" onCta={() => {}} />
 */
export function EmptyState({
  variant = 'no-data',
  title,
  description,
  ctaText,
  onCta,
  className,
}: EmptyStateProps) {
  const Icon = variant === 'filtered' ? Search : Inbox;

  const defaultTitle = variant === 'filtered' ? 'No results found' : 'No data';
  const defaultDescription =
    variant === 'filtered'
      ? 'Try adjusting your filters or search query'
      : 'There are no items to display';

  return (
    <div className={cn('flex flex-col items-center justify-center py-16', className)}>
      {/* Icon container */}
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
      </div>

      {/* Title */}
      <h3 className="text-sm font-medium text-foreground">{title || defaultTitle}</h3>

      {/* Description */}
      <p className="mt-1 text-sm text-muted-foreground">
        {description || defaultDescription}
      </p>

      {/* Optional CTA button */}
      {ctaText && onCta && (
        <Button variant="outline" size="sm" onClick={onCta} className="mt-4">
          {ctaText}
        </Button>
      )}
    </div>
  );
}
