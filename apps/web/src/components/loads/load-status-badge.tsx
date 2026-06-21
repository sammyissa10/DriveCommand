'use client';

import { StatusBadge, getStatusVariant } from '@/components/design-system';

/**
 * LoadStatusBadge — Status indicator for load records.
 *
 * Uses the consolidated StatusBadge from the design system.
 * Maps load status strings to semantic badge variants.
 */

const statusLabels: Record<string, string> = {
  PENDING: 'Pending',
  DISPATCHED: 'Dispatched',
  PICKED_UP: 'Picked Up',
  IN_TRANSIT: 'In Transit',
  DELIVERED: 'Delivered',
  INVOICED: 'Invoiced',
  CANCELLED: 'Cancelled',
};

export function LoadStatusBadge({ status }: { status: string }) {
  const variant = getStatusVariant(status);
  const label = statusLabels[status] ?? status.replace(/_/g, ' ');

  return <StatusBadge variant={variant}>{label}</StatusBadge>;
}
