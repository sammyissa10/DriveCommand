'use client';

/**
 * Dashboard widget showing expiring documents with color-coded urgency.
 */

import Link from 'next/link';
import type { ExpiringDocumentItem } from '@/app/(owner)/actions/notifications';

interface ExpiringDocumentsWidgetProps {
  items: ExpiringDocumentItem[];
}

export function ExpiringDocumentsWidget({ items }: ExpiringDocumentsWidgetProps) {
  const displayItems = items.slice(0, 5);
  const remainingCount = items.length - displayItems.length;
  const expiredCount = items.filter((item) => item.isExpired).length;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Expiring Documents</h2>
        {items.length > 0 && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              expiredCount > 0
                ? 'bg-red-100 text-red-800'
                : 'bg-gray-100 text-gray-800'
            }`}
          >
            {items.length}
          </span>
        )}
      </div>

      {/* Items list */}
      {items.length === 0 ? (
        <p className="text-center text-sm text-gray-500">No expiring documents</p>
      ) : (
        <div className="space-y-3">
          {displayItems.map((item, index) => {
            // Determine urgency color
            let urgencyClass = 'border-gray-200 bg-white';
            if (item.isExpired) {
              urgencyClass = 'border-red-300 bg-red-50';
            } else if (item.daysUntilExpiry <= 14) {
              urgencyClass = 'border-yellow-300 bg-yellow-50';
            }

            // Format expiry date
            const expiryDate = new Date(item.expiryDate);
            const formattedDate = expiryDate.toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            });

            return (
              <div
                key={`${item.truckId}-${item.documentType}-${index}`}
                className={`rounded-md border p-3 ${urgencyClass}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{item.truckName}</p>
                    <p className="text-sm text-gray-600">{item.documentType}</p>
                  </div>
                  <div className="text-right">
                    {item.isExpired ? (
                      <span className="text-sm font-bold text-red-700">EXPIRED</span>
                    ) : (
                      <div className="text-sm text-gray-700">
                        <div>{formattedDate}</div>
                        <div>
                          {item.daysUntilExpiry} day{item.daysUntilExpiry !== 1 ? 's' : ''}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {remainingCount > 0 && (
            <p className="pt-2 text-center text-sm text-gray-500">
              and {remainingCount} more...
            </p>
          )}
        </div>
      )}

      {/* Footer link */}
      <div className="mt-4 border-t border-gray-200 pt-4">
        <Link
          href="/trucks"
          className="text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          View all trucks &rarr;
        </Link>
      </div>
    </div>
  );
}
