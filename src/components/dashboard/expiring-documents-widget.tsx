'use client';

/**
 * Dashboard widget showing expiring documents with color-coded urgency.
 */

import Link from 'next/link';
import { FileText, ArrowRight } from 'lucide-react';
import type { ExpiringDocumentItem } from '@/app/(owner)/actions/notifications';

interface ExpiringDocumentsWidgetProps {
  items: ExpiringDocumentItem[];
}

export function ExpiringDocumentsWidget({ items }: ExpiringDocumentsWidgetProps) {
  const displayItems = items.slice(0, 5);
  const remainingCount = items.length - displayItems.length;
  const expiredCount = items.filter((item) => item.isExpired).length;

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
            <FileText className="h-4 w-4 text-blue-600" />
          </div>
          <h2 className="text-lg font-semibold text-card-foreground">Expiring Documents</h2>
        </div>
        {items.length > 0 && (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
              expiredCount > 0
                ? 'bg-red-100 text-red-700'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {items.length}
          </span>
        )}
      </div>

      {/* Items list */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8">
          <FileText className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No expiring documents</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {displayItems.map((item, index) => {
            let urgencyClass = 'border-border bg-card';
            if (item.isExpired) {
              urgencyClass = 'border-red-200 bg-red-50';
            } else if (item.daysUntilExpiry <= 14) {
              urgencyClass = 'border-amber-200 bg-amber-50';
            }

            const expiryDate = new Date(item.expiryDate);
            const formattedDate = expiryDate.toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            });

            return (
              <div
                key={`${item.truckId}-${item.documentType}-${index}`}
                className={`rounded-lg border p-3.5 transition-colors ${urgencyClass}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-semibold text-card-foreground">{item.truckName}</p>
                    <p className="text-sm text-muted-foreground">{item.documentType}</p>
                  </div>
                  <div className="text-right">
                    {item.isExpired ? (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
                        EXPIRED
                      </span>
                    ) : (
                      <div className="text-sm text-muted-foreground">
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
            <p className="pt-1 text-center text-sm text-muted-foreground">
              and {remainingCount} more...
            </p>
          )}
        </div>
      )}

      {/* Footer link */}
      <div className="mt-5 border-t border-border pt-4">
        <Link
          href="/trucks"
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
        >
          View all trucks
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}
