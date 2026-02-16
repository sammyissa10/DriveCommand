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
    bg: 'bg-blue-50',
    icon: 'text-blue-600',
  },
  'Active Drivers': {
    bg: 'bg-emerald-50',
    icon: 'text-emerald-600',
  },
  'Active Routes': {
    bg: 'bg-violet-50',
    icon: 'text-violet-600',
  },
  'Maintenance Alerts': {
    bg: 'bg-amber-50',
    icon: 'text-amber-600',
  },
};

export function StatCard({ label, value, href, variant = 'default' }: StatCardProps) {
  const Icon = iconMap[label] || Truck;
  const colors = colorMap[label] || colorMap['Total Trucks'];

  return (
    <Link
      href={href}
      className={`group block rounded-xl border bg-card p-6 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 ${
        variant === 'warning' ? 'border-amber-200 ring-1 ring-amber-100' : 'border-border'
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
