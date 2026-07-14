'use client';

import { FileText, ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusPill, type StatusTone } from './StatusPill';

export interface DocumentRowProps {
  title: string;
  /** Second line — date, size, uploader, etc. */
  meta?: string;
  /** Leading glyph. Defaults to a file icon. */
  icon?: LucideIcon;
  /** Optional trailing status pill — e.g. Verified, or an expiry state. */
  pill?: { label: string; tone: StatusTone };
  /** When set, the whole row is a button (opens the file / detail). */
  onOpen?: () => void;
}

/**
 * One document/compliance row. Shared across the fleet — used by Truck Detail
 * and reused verbatim by Driver Detail. Card fill, file glyph, title + meta,
 * optional status pill (Verified / Expired / Expires in Nd), optional open
 * action. Expiry-awareness comes from the caller via `pill.tone`.
 */
export function DocumentRow({ title, meta, icon: Icon = FileText, pill, onOpen }: DocumentRowProps) {
  const body = (
    <>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-ds-elevated">
        <Icon className="h-5 w-5 text-ds-txt2" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[16px] font-medium text-ds-txt">{title}</div>
        {meta ? <div className="mt-0.5 truncate text-[13px] text-ds-txt3">{meta}</div> : null}
      </div>
      {pill ? <StatusPill label={pill.label} tone={pill.tone} /> : null}
      {onOpen ? <ChevronRight className="h-4 w-4 shrink-0 text-ds-txt3" /> : null}
    </>
  );
  const cls = 'flex w-full items-center gap-3 rounded-[20px] bg-ds-card p-4 text-left';
  return onOpen ? (
    <button type="button" onClick={onOpen} className={cn(cls, 'transition active:opacity-75')}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}
