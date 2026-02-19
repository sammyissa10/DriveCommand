'use client';

import Link from 'next/link';
import { Truck, Users, Route, AlertTriangle, type LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: number;
  href: string;
  variant?: 'default' | 'warning';
}

const iconMap: Record<string, LucideIcon> = {
  'Total Trucks': Truck,
  'Active Drivers': Users,
  'Active Routes': Route,
  'Maintenance Alerts': AlertTriangle,
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
};

export function StatCard({ label, value, href, variant = 'default' }: StatCardProps) {
  const Icon = iconMap[label] || Truck;
  const colors = colorMap[label] || colorMap['Total Trucks'];

  return (
    <Link
      href={href}
      className={`group block rounded-xl border bg-card p-6 shadow-sm card-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
        variant === 'warning' ? 'border-status-warning/30 ring-1 ring-status-warning/10' : 'border-border'
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-card-foreground">{value}</p>
        </div>
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${colors.bg} transition-transform group-hover:scale-110`}>
          <Icon className={`h-6 w-6 ${colors.icon}`} />
        </div>
      </div>
    </Link>
  );
}
