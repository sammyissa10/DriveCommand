'use client';

import Link from 'next/link';
import { MapPin, MessageSquare, Clock, FileText, AlertTriangle } from 'lucide-react';

const actions = [
  {
    href: '/my-route',
    label: 'My Route',
    icon: MapPin,
    bgClass: 'bg-blue-50 dark:bg-blue-950',
    iconClass: 'text-blue-600 dark:text-blue-400',
  },
  {
    href: '/messages',
    label: 'Messages',
    icon: MessageSquare,
    bgClass: 'bg-green-50 dark:bg-green-950',
    iconClass: 'text-green-600 dark:text-green-400',
  },
  {
    href: '/hours',
    label: 'Hours',
    icon: Clock,
    bgClass: 'bg-purple-50 dark:bg-purple-950',
    iconClass: 'text-purple-600 dark:text-purple-400',
  },
  {
    // TODO: Create /documents page; linking to /hours as placeholder until then
    href: '/hours',
    label: 'Documents',
    icon: FileText,
    bgClass: 'bg-orange-50 dark:bg-orange-950',
    iconClass: 'text-orange-600 dark:text-orange-400',
  },
  {
    href: '/incidents',
    label: 'Incidents',
    icon: AlertTriangle,
    bgClass: 'bg-red-50 dark:bg-red-950',
    iconClass: 'text-red-600 dark:text-red-400',
  },
];

export function DriverQuickActions() {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
        Quick Actions
      </p>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
        {actions.map(({ href, label, icon: Icon, bgClass, iconClass }) => (
          <Link
            key={`${href}-${label}`}
            href={href}
            className={`min-w-[100px] flex-shrink-0 rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-center min-h-[80px] transition-transform active:scale-95 ${bgClass}`}
          >
            <Icon className={`h-6 w-6 ${iconClass}`} />
            <span className="text-xs font-medium text-foreground leading-tight">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
