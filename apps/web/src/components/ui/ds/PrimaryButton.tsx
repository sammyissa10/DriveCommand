'use client';

import { cn } from '@/lib/utils';

/** Full-width accent button, 50 high, radius 15. Disabled = 35% opacity. */
export function PrimaryButton({
  label,
  onClick,
  type = 'button',
  disabled = false,
  loading = false,
}: {
  label: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  loading?: boolean;
}) {
  const off = disabled || loading;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={off}
      className={cn(
        'h-[50px] w-full rounded-[15px] bg-ds-accent text-[17px] font-semibold text-white transition active:opacity-75',
        off && 'opacity-35',
      )}
    >
      {label}
    </button>
  );
}
