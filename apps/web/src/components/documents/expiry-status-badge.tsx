'use client';

/**
 * ExpiryStatusBadge — Compliance expiry indicator for documents.
 *
 * Uses the consolidated AlertBadge from the design system.
 * Shows icon + text for accessibility (color never used alone).
 */

import { differenceInDays } from 'date-fns';
import {
  AlertBadge,
  getExpiryVariant,
  formatExpiryMessage,
} from '@/components/design-system';

interface ExpiryStatusBadgeProps {
  expiryDate: Date | string | null;
}

export function ExpiryStatusBadge({ expiryDate }: ExpiryStatusBadgeProps) {
  if (!expiryDate) {
    return null;
  }

  const expiryDateObj =
    typeof expiryDate === 'string' ? new Date(expiryDate) : expiryDate;
  const now = new Date();
  const daysUntilExpiry = differenceInDays(expiryDateObj, now);

  const variant = getExpiryVariant(daysUntilExpiry);
  const message = formatExpiryMessage(daysUntilExpiry);

  return <AlertBadge variant={variant}>{message}</AlertBadge>;
}
