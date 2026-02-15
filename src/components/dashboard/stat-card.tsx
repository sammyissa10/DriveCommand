'use client';

import Link from 'next/link';

interface StatCardProps {
  label: string;
  value: number;
  href: string;
  variant?: 'default' | 'warning';
}

export function StatCard({ label, value, href, variant = 'default' }: StatCardProps) {
  const borderColor = variant === 'warning' ? 'border-yellow-300' : 'border-gray-200';
  const bgColor = variant === 'warning' ? 'bg-yellow-50' : 'bg-white';

  return (
    <Link
      href={href}
      className={`block rounded-lg border p-6 shadow-sm transition-shadow hover:shadow-md ${borderColor} ${bgColor}`}
    >
      <div className="text-sm font-medium text-gray-600">{label}</div>
      <div className="mt-2 text-3xl font-bold text-gray-900">{value}</div>
    </Link>
  );
}
