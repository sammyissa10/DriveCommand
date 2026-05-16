'use client';

import Link from 'next/link';
import type { ChecklistStatusCardProps } from './dashboard.types';

/**
 * Individual status card for the Checklist Status Widget.
 *
 * Displays a single compliance metric (overdue, due today, or expiring) with:
 * - Title (uppercase, muted)
 * - Large count number (color varies by status)
 * - Subtitle context
 * - Optional icon top-right
 *
 * Cards are clickable links with proper keyboard accessibility.
 */
export function ChecklistStatusCard({
  title,
  count,
  subtitle,
  status,
  href,
  icon: Icon,
}: ChecklistStatusCardProps) {
  // Determine count color based on status and whether count > 0
  const getCountColor = () => {
    if (count === 0) {
      return 'text-muted-foreground';
    }
    switch (status) {
      case 'overdue':
        // Restrained red — the data carries urgency, not aggressive color
        return 'text-red-500 dark:text-red-400';
      case 'dueToday':
        // Amber for awareness
        return 'text-amber-500 dark:text-amber-400';
      case 'expiring':
      default:
        // Neutral — informational, not urgent
        return 'text-muted-foreground';
    }
  };

  const ariaLabel = count > 0
    ? `${count} ${title.toLowerCase()}, click to view`
    : `No ${title.toLowerCase()} items, click to view`;

  return (
    <Link
      href={href}
      className="group relative flex flex-col rounded-xl border border-border bg-card p-5 transition-colors duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-border/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none"
      aria-label={ariaLabel}
    >
      {/* Title and optional icon row */}
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        {Icon && (
          <Icon className="h-4 w-4 text-muted-foreground/60" aria-hidden="true" />
        )}
      </div>

      {/* Large count number */}
      <span
        className={`mt-2 text-4xl font-semibold tabular-nums ${getCountColor()}`}
      >
        {count}
      </span>

      {/* Subtitle context */}
      <span className="mt-1 text-sm text-muted-foreground/80">
        {subtitle}
      </span>
    </Link>
  );
}
