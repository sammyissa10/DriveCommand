'use client';

import { ChevronRight } from 'lucide-react';

/** Tint for the meta line — muted by default, warning/danger for at-risk stats. */
export type MetaTone = 'muted' | 'warning' | 'danger';

const META_TONE: Record<MetaTone, string> = {
  muted: 'text-ds-txt3',
  warning: 'text-ds-warning',
  danger: 'text-ds-danger',
};

/**
 * Standard entity list row — a full card (fill, radius 20, no border). Left
 * avatar/chip, middle 3-line stack, right pill (top) or chevron (centered).
 * Whole card is the tap target with a pressed state.
 */
export function EntityRow({
  leading,
  title,
  titleAccessory,
  subline,
  meta,
  metaTone = 'muted',
  pill,
  onClick,
  ariaLabel,
}: {
  leading: React.ReactNode;
  title: string;
  titleAccessory?: React.ReactNode;
  subline?: string;
  meta?: string;
  /** Tints the meta line (e.g. warning/danger when a license is expiring/expired). */
  metaTone?: MetaTone;
  /** A StatusPill. When present the chevron is dropped (whole card taps). */
  pill?: React.ReactNode;
  onClick: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? title}
      className="flex min-h-[92px] w-full items-center gap-3 rounded-[20px] bg-ds-card p-4 text-left transition active:opacity-75"
    >
      {leading}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[17px] font-semibold text-ds-txt">{title}</span>
          {titleAccessory}
        </div>
        {subline ? <div className="mt-0.5 truncate text-[15px] text-ds-txt2">{subline}</div> : null}
        {meta ? <div className={`mt-0.5 truncate text-[13px] ${META_TONE[metaTone]}`}>{meta}</div> : null}
      </div>

      {pill ? (
        <div className="shrink-0 self-start pt-0.5">{pill}</div>
      ) : (
        <ChevronRight className="h-5 w-5 shrink-0 text-ds-txt3" />
      )}
    </button>
  );
}
