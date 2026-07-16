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

/**
 * `dropdown` = the desktop bell's anchored panel (self-contained chrome).
 * `sheet` = the mobile-web ds bottom sheet body; the surrounding
 * `SheetContainer` owns the fill/radius/grabber/title, so this renders bare on
 * `ds` tokens. The fetch + mark-read + navigation logic is shared across both.
 */
type NotificationVariant = 'dropdown' | 'sheet';

interface NotificationCenterProps {
  onClose: () => void;
  onMarkedAllRead?: () => void;
  variant?: NotificationVariant;
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

function NotificationIcon({ type, className }: { type: InAppNotificationType; className?: string }) {
  // Match Quick Create icon styling: muted gray, consistent size
  const cls = className ?? 'h-4 w-4 shrink-0 text-[hsl(220_10%_60%)]';
  switch (type) {
    case 'dispatch_assigned':
      return <Truck className={cls} strokeWidth={1.75} />;
    case 'load_delivered':
      return <Package className={cls} strokeWidth={1.75} />;
    case 'pay_record_ready':
      return <DollarSign className={cls} strokeWidth={1.75} />;
    case 'invoice_generated':
      return <FileText className={cls} strokeWidth={1.75} />;
    case 'compliance_alert':
      return <AlertTriangle className={cls} strokeWidth={1.75} />;
    case 'needs_assignment':
      return <UserPlus className={cls} strokeWidth={1.75} />;
    default:
      return <Bell className={cls} strokeWidth={1.75} />;
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

/**
 * A single notification row. The `dropdown` branch reproduces the desktop
 * panel's exact classes (no visual change on lg+); the `sheet` branch renders
 * the same content on `ds` tokens at mobile touch sizes.
 */
function NotificationRow({
  notification,
  variant,
  onClick,
}: {
  notification: InAppNotification;
  variant: NotificationVariant;
  onClick: () => void;
}) {
  const sheet = variant === 'sheet';
  return (
    <button
      onClick={onClick}
      className={
        sheet
          ? 'relative w-full text-left flex items-start gap-3 px-3 py-3 rounded-[14px] hover:bg-ds-card active:opacity-80 transition'
          : 'relative w-full text-left flex items-start gap-3 px-3 py-2.5 mx-1 rounded-lg cursor-pointer hover:bg-[hsl(220_28%_18%)] transition-none'
      }
    >
      {/* Unread indicator - accent left border */}
      <div
        className={`absolute left-0 top-1 bottom-1 w-0.5 rounded-full ${
          notification.read ? 'bg-transparent' : sheet ? 'bg-ds-accent' : 'bg-blue-500'
        }`}
      />
      <div className="mt-0.5">
        <NotificationIcon
          type={notification.type}
          className={sheet ? 'h-[18px] w-[18px] shrink-0 text-ds-txt2' : undefined}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p
            className={
              sheet
                ? `text-[15px] leading-tight text-ds-txt ${notification.read ? 'font-normal' : 'font-semibold'}`
                : `text-sm leading-tight text-[hsl(0_0%_92%)] ${notification.read ? 'font-normal' : 'font-medium'}`
            }
          >
            {notification.title}
          </p>
          <span
            className={
              sheet
                ? 'text-[12px] text-ds-txt3 font-mono shrink-0'
                : 'text-[11px] text-[hsl(220_10%_50%)] font-mono shrink-0'
            }
          >
            {relativeTime(notification.createdAt)}
          </span>
        </div>
        <p
          className={
            sheet
              ? 'text-[13px] text-ds-txt2 mt-0.5 line-clamp-2 leading-relaxed'
              : 'text-xs text-[hsl(220_10%_60%)] mt-0.5 line-clamp-2 leading-relaxed'
          }
        >
          {notification.message}
        </p>
      </div>
    </button>
  );
}

export function NotificationCenter({ onClose, onMarkedAllRead, variant = 'dropdown' }: NotificationCenterProps) {
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

  // ── Mobile-web ds bottom-sheet body ──────────────────────────────────────
  // SheetContainer supplies the fill, radius, grabber, Cancel and centered
  // "Notifications" title, so this renders only the mark-all action + the list.
  if (variant === 'sheet') {
    return (
      <div className="pb-2">
        <div className="flex items-center justify-end pb-1">
          <button
            onClick={handleMarkAllRead}
            className="min-h-[36px] px-1 text-[15px] text-ds-accent active:opacity-70"
          >
            Mark all read
          </button>
        </div>

        {loading ? (
          <div className="px-3 py-10 text-center text-[15px] text-ds-txt2">Loading…</div>
        ) : notifications.length === 0 ? (
          <div className="px-3 py-14 flex flex-col items-center gap-2 text-ds-txt2">
            <Bell className="h-8 w-8 opacity-30" strokeWidth={1.75} />
            <span className="text-[15px]">No notifications</span>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {notifications.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                variant="sheet"
                onClick={() => handleNotificationClick(notification)}
              />
            ))}
            {notifications.length >= 20 && (
              <div className="px-3 py-3 text-center text-[13px] text-ds-txt3">Showing latest 20</div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Desktop anchored dropdown (unchanged) ────────────────────────────────
  return (
    <div className="w-[calc(100vw-2rem)] sm:w-[380px] max-h-[calc(100dvh-140px)] overflow-y-auto bg-[hsl(220_32%_11%)] border border-[hsl(220_25%_18%)] rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.15),_0_24px_48px_-12px_rgba(0,0,0,0.4)] z-[1001] flex flex-col">
      {/* Sticky header - Quick Create section label style */}
      <div className="sticky top-0 bg-[hsl(220_32%_11%)] px-3 py-2 flex items-center justify-between z-10 border-b border-[hsl(220_25%_18%)]">
        <span className="text-[11px] font-medium uppercase tracking-wider text-[hsl(220_10%_50%)]">
          Notifications
        </span>
        <button
          onClick={handleMarkAllRead}
          className="text-[11px] text-[hsl(220_10%_50%)] hover:text-[hsl(0_0%_98%)] transition-colors"
        >
          Mark all read
        </button>
      </div>

      {/* Notification list */}
      <div className="flex-1">
        {loading ? (
          <div className="px-3 py-8 text-center text-sm text-[hsl(220_10%_50%)]">Loading...</div>
        ) : notifications.length === 0 ? (
          <div className="px-3 py-12 flex flex-col items-center gap-2 text-[hsl(220_10%_50%)]">
            <Bell className="h-8 w-8 opacity-30" strokeWidth={1.75} />
            <span className="text-sm">No notifications</span>
          </div>
        ) : (
          <>
            {notifications.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                variant="dropdown"
                onClick={() => handleNotificationClick(notification)}
              />
            ))}

            {notifications.length >= 20 && (
              <div className="px-3 py-2.5 text-center border-t border-[hsl(220_25%_18%)]">
                <span className="text-[11px] text-[hsl(220_10%_50%)] hover:text-[hsl(0_0%_98%)] cursor-pointer transition-colors">
                  View all notifications
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
