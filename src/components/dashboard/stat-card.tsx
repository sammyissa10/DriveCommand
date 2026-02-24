'use client';

import Link from 'next/link';
import {
  Truck,
  Users,
  Route,
  AlertTriangle,
  DollarSign,
  Package,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  href: string;
  variant?: 'default' | 'warning' | 'danger';
  subtitle?: string;
}

const iconMap: Record<string, LucideIcon> = {
  'Total Trucks': Truck,
  'Active Drivers': Users,
  'Active Routes': Route,
  'Maintenance Alerts': AlertTriangle,
  'Unpaid Invoices': DollarSign,
  'Active Loads': Package,
  'Revenue / Mile': TrendingUp,
};

const colorMap: Record<string, { bg: string; icon: string }> = {
  'Total Trucks': {
    bg: 'bg-status-info-bg',
    icon: 'text-status-info-foreground',
  },
  'Active Drivers': {
    bg: 'bg-status-success-bg',
    icon: 'text-status-success-foreground',
  },
  'Active Routes': {
    bg: 'bg-status-purple-bg',
    icon: 'text-status-purple-foreground',
  },
  'Maintenance Alerts': {
    bg: 'bg-status-warning-bg',
    icon: 'text-status-warning-foreground',
  },
  'Unpaid Invoices': {
    bg: 'bg-status-danger-bg',
    icon: 'text-status-danger-foreground',
  },
  'Active Loads': {
    bg: 'bg-status-info-bg',
    icon: 'text-status-info-foreground',
  },
  'Revenue / Mile': {
    bg: 'bg-status-success-bg',
    icon: 'text-status-success-foreground',
  },
};

export function StatCard({ label, value, href, variant = 'default', subtitle }: StatCardProps) {
  const Icon = iconMap[label] || Truck;
  const colors = colorMap[label] || colorMap['Total Trucks'];

  const borderClass =
    variant === 'danger'
      ? 'border-status-danger/30 ring-1 ring-status-danger/10'
      : variant === 'warning'
        ? 'border-status-warning/30 ring-1 ring-status-warning/10'
        : 'border-border';

  return (
    <Link
      href={href}
      className={`group block rounded-xl border bg-card p-6 shadow-sm card-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${borderClass}`}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-card-foreground truncate">{value}</p>
          {subtitle && (
            <p className="mt-1 text-xs font-medium text-status-danger-foreground truncate">{subtitle}</p>
          )}
        </div>
        <div className={`ml-4 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${colors.bg} transition-transform group-hover:scale-110`}>
          <Icon className={`h-6 w-6 ${colors.icon}`} />
        </div>
      </div>
    </Link>
  );
}
