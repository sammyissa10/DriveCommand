'use client';

import { cn } from '@/lib/utils';
import type { StatusTone } from './StatusPill';

const VALUE_TINT: Record<StatusTone, string> = {
  success: 'text-ds-success',
  accent: 'text-ds-accent',
  warning: 'text-ds-warning',
  danger: 'text-ds-danger',
  neutral: 'text-ds-txt',
  vip: 'text-ds-vip',
};

/** KPI card: value 22 Bold, label below. Height 74, radius 18. Tap = filter. */
export function KPICard({
  value,
  label,
  tone,
  active = false,
  onClick,
}: {
  value: string | number;
  label: string;
  tone?: StatusTone;
  active?: boolean;
  onClick?: () => void;
}) {
  const valueClass = tone ? VALUE_TINT[tone] : 'text-ds-txt';
  const cls = cn(
    'flex h-[74px] flex-1 flex-col justify-center rounded-[18px] px-4 text-left',
    active ? 'bg-ds-elevated' : 'bg-ds-card',
    onClick && 'transition active:opacity-75',
  );
  const inner = (
    <>
      <span className={cn('text-[22px] font-bold', valueClass)}>{value}</span>
      <span className="mt-0.5 text-[12px] text-ds-txt2">{label}</span>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={active} className={cls}>
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
}

/** Row of 2–3 KPICards with the standard 12px card gap. */
export function KPIRow({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-3">{children}</div>;
}
