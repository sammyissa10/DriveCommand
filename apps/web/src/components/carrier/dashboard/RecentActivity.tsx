'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Truck, MapPin, Package, CreditCard, FileText, Send } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActivityItem {
  type: string;
  description: string;
  timestamp: string;
  href: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

function getTypeIcon(type: string) {
  switch (type) {
    case 'dispatch_update':
      return Truck;
    case 'stop_completed':
      return MapPin;
    case 'new_load':
      return Package;
    case 'pay_record':
      return CreditCard;
    case 'document_uploaded':
      return FileText;
    case 'new_dispatch':
      return Send;
    default:
      return Truck;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RecentActivity() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/carrier/dashboard/activity')
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((json) => setItems(Array.isArray(json) ? json : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Recent Activity</h2>
      </div>

      {loading ? (
        <div className="divide-y divide-border">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
              <div className="h-7 w-7 rounded-full bg-muted flex-shrink-0" />
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="h-3.5 w-3/4 bg-muted rounded" />
                <div className="h-3 w-1/4 bg-muted rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
          No recent activity
        </div>
      ) : (
        <div className="divide-y divide-border">
          {items.map((item, idx) => {
            const Icon = getTypeIcon(item.type);
            return (
              <Link
                key={`${item.type}-${idx}`}
                href={item.href}
                className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors group"
              >
                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground truncate group-hover:text-foreground">
                    {item.description}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {relativeTime(item.timestamp)}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
