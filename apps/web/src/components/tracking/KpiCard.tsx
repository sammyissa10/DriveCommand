'use client';

import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KpiCardProps {
  label: string;
  value: string;
  delta?: { value: number; isPositive: boolean } | null;
  variant?: 'success' | 'warning' | 'danger' | 'neutral';
  indicator?: boolean;
}

const variantStyles = {
  success: 'text-status-success',
  warning: 'text-status-warning',
  danger: 'text-status-danger',
  neutral: 'text-foreground',
};

export default function KpiCard({
  label,
  value,
  delta,
  variant = 'neutral',
  indicator = false,
}: KpiCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="relative rounded-lg border border-border bg-card p-5"
    >
      {/* Label with optional indicator */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {indicator && (
          <span className="h-2 w-2 rounded-full bg-status-danger animate-pulse" />
        )}
      </div>

      {/* Value */}
      <div className={cn('text-[28px] font-semibold leading-none', variantStyles[variant])}>
        {value}
      </div>

      {/* Delta */}
      {delta && (
        <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
          {delta.isPositive ? (
            <TrendingUp className="h-3 w-3 text-status-success" />
          ) : (
            <TrendingDown className="h-3 w-3 text-status-danger" />
          )}
          <span>
            {delta.isPositive ? '+' : ''}
            {delta.value} vs yesterday
          </span>
        </div>
      )}
    </motion.div>
  );
}
