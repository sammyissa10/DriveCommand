'use client';

import { useRouter } from 'next/navigation';
import { MapPin, MessageSquare, Clock, FileText, AlertTriangle, LucideIcon } from 'lucide-react';

interface QuickActionBadges {
  stopsRemaining: number;
  unreadMessages: number;
  hosStatus: string;
  expiringDocs: number;
}

interface Action {
  href: string;
  label: string;
  icon: LucideIcon;
  color: string;
  getBadge: (badges: QuickActionBadges) => string;
}

const actions: Action[] = [
  {
    href: '/my-route',
    label: 'My Route',
    icon: MapPin,
    color: '#3B82F6',
    getBadge: (b) =>
      b.stopsRemaining > 0 ? `${b.stopsRemaining} stops remaining` : 'No active route',
  },
  {
    href: '/messages',
    label: 'Messages',
    icon: MessageSquare,
    color: '#10B981',
    getBadge: (b) =>
      b.unreadMessages > 0 ? `${b.unreadMessages} unread` : 'No new messages',
  },
  {
    href: '/hours',
    label: 'Hours',
    icon: Clock,
    color: '#8B5CF6',
    getBadge: (b) => b.hosStatus,
  },
  {
    // /documents does not exist yet — linking to /hours as placeholder
    href: '/hours',
    label: 'Documents',
    icon: FileText,
    color: '#F59E0B',
    getBadge: (b) =>
      b.expiringDocs > 0 ? `${b.expiringDocs} expiring` : 'All current',
  },
  {
    href: '/incidents',
    label: 'Report Incident',
    icon: AlertTriangle,
    color: '#EF4444',
    getBadge: () => 'Tap to report',
  },
];

interface DriverQuickActionsProps {
  quickActionBadges: QuickActionBadges;
}

export function DriverQuickActions({ quickActionBadges }: DriverQuickActionsProps) {
  const router = useRouter();

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
        Quick Actions
      </p>
      {/* CSS scroll-snap carousel — one tile centered, adjacent tiles peek 20px */}
      <div
        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-4"
        style={{
          paddingInline: 'calc(50% - 80px)',
          scrollPaddingInline: 'calc(50% - 80px)',
        }}
      >
        {actions.map(({ href, label, icon: Icon, color, getBadge }) => (
          <div
            key={`${href}-${label}`}
            className="snap-center shrink-0 w-40 h-32 rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer active:scale-95 transition-transform select-none"
            style={{ backgroundColor: color }}
            onClick={() => router.push(href)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && router.push(href)}
            aria-label={label}
          >
            <Icon className="w-8 h-8 text-white" />
            <span className="text-white font-semibold text-sm leading-tight text-center">
              {label}
            </span>
            <span className="text-white/80 text-xs text-center px-2">
              {getBadge(quickActionBadges)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
