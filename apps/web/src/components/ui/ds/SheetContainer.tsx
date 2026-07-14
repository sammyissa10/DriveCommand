'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

export interface SheetContainerProps {
  open: boolean;
  /** Called by the Cancel button, backdrop tap, and Escape. */
  onCancel: () => void;
  title: string;
  /** One-line purpose subtitle that sets expectations. */
  subtitle?: string;
  cancelLabel?: string;
  children: React.ReactNode;
}

/**
 * Bottom sheet for Quick Create: dimmed 45% backdrop, `ds.sheet` fill, top
 * radius 24, 36×5 grabber, Cancel top-left, centered title, one-line subtitle.
 * The single PrimaryButton lives in `children`. No FAB anywhere in the app.
 */
export function SheetContainer({
  open,
  onCancel,
  title,
  subtitle,
  cancelLabel = 'Cancel',
  children,
}: SheetContainerProps) {
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const raf = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onCancel]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[2000] flex flex-col justify-end">
      <div
        aria-hidden
        onClick={onCancel}
        className={cn('absolute inset-0 bg-black/45 transition-opacity', shown ? 'opacity-100' : 'opacity-0')}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative max-h-[90dvh] overflow-y-auto rounded-t-[24px] bg-ds-sheet px-5 pb-6 pt-2.5',
          'transition-transform duration-300 ease-out',
          shown ? 'translate-y-0' : 'translate-y-full',
        )}
      >
        {/* Grabber */}
        <div className="mx-auto mb-2 h-[5px] w-9 rounded-full bg-ds-txt3" />

        {/* Header: Cancel left, centered title */}
        <div className="relative flex h-11 items-center">
          <button
            type="button"
            onClick={onCancel}
            className="z-10 min-h-[44px] text-[17px] text-ds-accent"
          >
            {cancelLabel}
          </button>
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[17px] font-semibold text-ds-txt">
            {title}
          </span>
        </div>

        {subtitle ? (
          <p className="pb-4 text-center text-[13px] text-ds-txt2">{subtitle}</p>
        ) : (
          <div className="pb-2" />
        )}

        {children}
      </div>
    </div>,
    document.body,
  );
}
