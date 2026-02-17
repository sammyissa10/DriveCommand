'use client';

/**
 * Expiry status badge for driver documents.
 * Shows color-coded status: valid (green), expiring soon (yellow), or expired (red).
 */

import { differenceInDays } from 'date-fns';

interface ExpiryStatusBadgeProps {
  expiryDate: Date | string | null;
}

export function ExpiryStatusBadge({ expiryDate }: ExpiryStatusBadgeProps) {
  if (!expiryDate) {
    return null;
  }

  const expiryDateObj = typeof expiryDate === 'string' ? new Date(expiryDate) : expiryDate;
  const now = new Date();
  const daysUntilExpiry = differenceInDays(expiryDateObj, now);

  // Determine status and badge styling
  let badgeColor: string;
  let text: string;

  if (daysUntilExpiry < 0) {
    // Expired
    badgeColor = 'bg-red-100 text-red-800';
    text = `Expired ${Math.abs(daysUntilExpiry)} day${Math.abs(daysUntilExpiry) === 1 ? '' : 's'} ago`;
  } else if (daysUntilExpiry <= 30) {
    // Expiring soon (within 30 days)
    badgeColor = 'bg-yellow-100 text-yellow-800';
    text = `Expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'}`;
  } else {
    // Valid (more than 30 days)
    badgeColor = 'bg-green-100 text-green-800';
    text = `Valid (${daysUntilExpiry} days)`;
  }

  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeColor}`}>
      {text}
    </span>
  );
}
