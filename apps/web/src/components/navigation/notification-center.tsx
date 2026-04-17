"use client"

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Truck,
  Package,
  DollarSign,
  FileText,
  AlertTriangle,
  UserPlus,
} from 'lucide-react';
import type { InAppNotificationType } from '@/generated/prisma';

interface InAppNotification {
  id: string;
  orgId: string;
  userId: string | null;
  type: InAppNotificationType;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  read: boolean;
  createdAt: string;
}

interface NotificationCenterProps {
  onClose: () => void;
  onMarkedAllRead?: () => void;
}

/** Format a timestamp as relative time (e.g. "2m ago", "3h ago", "5d ago") */
function relativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const months = Math.floor(diffDays / 30);

  if (diffMins < 2) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return `${months}mo ago`;
}

function NotificationIcon({ type }: { type: InAppNotificationType }) {
  const cls = 'h-4 w-4 flex-shrink-0';
  switch (type) {
    case 'dispatch_assigned':
      return <Truck className={`${cls} text-blue-500`} />;
    case 'load_delivered':
      return <Package className={`${cls} text-green-500`} />;
    case 'pay_record_ready':
      return <DollarSign className={`${cls} text-emerald-500`} />;
    case 'invoice_generated':
      return <FileText className={`${cls} text-purple-500`} />;
    case 'compliance_alert':
      return <AlertTriangle className={`${cls} text-amber-500`} />;
    case 'needs_assignment':
      return <UserPlus className={`${cls} text-orange-500`} />;
    default:
      return <Bell className={`${cls} text-muted-foreground`} />;
  }
}

/** Resolve the deep-link URL for a notification based on entityType */
function resolveLink(entityType: string, entityId: string): string {
  switch (entityType) {
    case 'dispatch':
      return `/carrier/dispatches/${entityId}`;
    case 'load':
      return `/carrier/loads/${entityId}`;
    case 'driver_pay_record':
      return `/carrier/reports/driver-pay`;
    case 'driver':
      return `/carrier/fleet/drivers`;
    case 'truck':
      return `/carrier/fleet/trucks`;
    case 'invoice':
      return `/carrier/loads/${entityId}`;
    default:
      return `/carrier/compliance`;
  }
}

export function NotificationCenter({ onClose, onMarkedAllRead }: NotificationCenterProps) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchNotifications() {
    try {
      const res = await fetch('/api/v1/carrier/notifications?limit=20');
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications ?? []);
    } catch {
      // Silently fail — UI degrades gracefully
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchNotifications();
  }, []);

  async function handleMarkAllRead() {
    try {
      await fetch('/api/v1/carrier/notifications/mark-read', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      // Optimistically mark all as read in local state
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      onMarkedAllRead?.();
    } catch {
      // Silently fail
    }
  }

  async function handleNotificationClick(notification: InAppNotification) {
    // Mark as read
    try {
      await fetch('/api/v1/carrier/notifications/mark-read', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [notification.id] }),
      });
    } catch {
      // Silently fail
    }

    // Navigate to entity
    const link = resolveLink(notification.entityType, notification.entityId);
    router.push(link);
    onClose();
  }

  return (
    <div className="w-[380px] max-h-[480px] overflow-y-auto bg-popover border rounded-lg shadow-lg z-50 flex flex-col">
      {/* Sticky header */}
      <div className="sticky top-0 bg-popover border-b px-4 py-3 flex items-center justify-between z-10">
        <span className="font-semibold text-sm text-foreground">Notifications</span>
        <button
          onClick={handleMarkAllRead}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Mark all read
        </button>
      </div>

      {/* Notification list */}
      <div className="flex-1">
        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : notifications.length === 0 ? (
          <div className="px-4 py-12 flex flex-col items-center gap-2 text-muted-foreground">
            <Bell className="h-8 w-8 opacity-30" />
            <span className="text-sm">No notifications</span>
          </div>
        ) : (
          <>
            {notifications.map((notification) => (
              <button
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                className="w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0"
              >
                {/* Unread indicator stripe */}
                <div
                  className={`absolute left-0 top-0 h-full w-0.5 ${
                    notification.read ? 'bg-transparent' : 'bg-primary'
                  }`}
                />
                <div
                  className={`self-stretch w-0.5 flex-shrink-0 rounded-full ${
                    notification.read ? 'bg-transparent' : 'bg-primary'
                  }`}
                />
                <div className="mt-0.5">
                  <NotificationIcon type={notification.type} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium leading-tight ${notification.read ? 'text-muted-foreground' : 'text-foreground'}`}>
                    {notification.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                    {notification.message}
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    {relativeTime(notification.createdAt)}
                  </p>
                </div>
              </button>
            ))}

            {notifications.length >= 20 && (
              <div className="px-4 py-3 text-center text-xs text-muted-foreground border-t">
                View all notifications
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
