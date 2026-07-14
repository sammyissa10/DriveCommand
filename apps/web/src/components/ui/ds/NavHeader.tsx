'use client';

import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

/** A tappable text action for the nav bar (Edit / Cancel / Save). */
export function NavTextButton({
  label,
  onClick,
  emphasized = false,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  /** Save-style: accent semibold. */
  emphasized?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'min-h-[44px] px-1 text-[17px] text-ds-accent transition active:opacity-75',
        emphasized ? 'font-semibold' : 'font-normal',
        disabled && 'opacity-35',
      )}
    >
      {label}
    </button>
  );
}

/** Detail-page nav bar: back chevron / left action, centered title, right action. */
export function NavHeader({
  title,
  onBack,
  right,
  left,
}: {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
  /** Replaces the back chevron (e.g. a Cancel button in edit mode). */
  left?: React.ReactNode;
}) {
  return (
    <div className="relative flex h-12 items-center">
      <div className="z-10 flex min-w-[72px] items-center">
        {left ??
          (onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back"
              className="-ml-2 flex h-12 w-12 items-center justify-center transition active:opacity-75"
            >
              <ChevronLeft className="h-6 w-6 text-ds-accent" />
            </button>
          ) : null)}
      </div>
      <span className="pointer-events-none absolute inset-0 mx-[72px] flex items-center justify-center truncate text-[17px] font-semibold text-ds-txt">
        {title}
      </span>
      <div className="z-10 ml-auto flex min-w-[72px] items-center justify-end">{right}</div>
    </div>
  );
}
