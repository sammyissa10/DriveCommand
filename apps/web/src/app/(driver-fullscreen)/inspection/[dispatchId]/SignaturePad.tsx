'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';

/**
 * A signature pad, in-house.
 *
 * There is no signature component anywhere in `apps/web` and no signature
 * library in `package.json`, and Section 15 locks the stack — so this is a
 * `<canvas>` and about a hundred lines rather than a dependency. Mobile's pad is
 * `react-native-svg` plus `react-native-view-shot`; neither exists for the DOM,
 * and neither is needed, because `canvas.toBlob()` is the rasteriser those two
 * were working around.
 *
 * POINTER EVENTS, not touch events and not mouse events. One code path covers a
 * finger, a stylus and a mouse, which matters because this is signed with a
 * gloved fingertip in a yard and tested with a trackpad at a desk.
 * `touch-action: none` on the canvas is what stops the browser interpreting the
 * signing stroke as a scroll and stealing it mid-letter.
 *
 * The canvas is sized in DEVICE pixels and scaled back down in CSS. A canvas
 * left at its CSS size renders a signature that looks like it was drawn with a
 * marker on a phone with a 3x display, which is most of them.
 */

export interface SignaturePadHandle {
  isEmpty: () => boolean;
  toBlob: () => Promise<Blob | null>;
  clear: () => void;
}

interface Props {
  onHandle: (handle: SignaturePadHandle) => void;
  /** Reported on every stroke so the parent can enable its submit button. */
  onInkChange: (hasInk: boolean) => void;
  disabled?: boolean;
}

export function SignaturePad({ onHandle, onInkChange, disabled = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const hasInkRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  const markInk = useCallback(() => {
    if (hasInkRef.current) return;
    hasInkRef.current = true;
    setHasInk(true);
    onInkChange(true);
  }, [onInkChange]);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInkRef.current = false;
    setHasInk(false);
    onInkChange(false);
  }, [onInkChange]);

  // Size the backing store to the element's real pixel size, once mounted and
  // again on resize (rotating a handset is the common case).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function resize() {
      const el = canvasRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      // Resizing a canvas CLEARS it. Only touch it when the size actually
      // changed, or an on-screen keyboard opening would wipe a finished
      // signature.
      const nextW = Math.max(1, Math.round(rect.width * dpr));
      const nextH = Math.max(1, Math.round(rect.height * dpr));
      if (el.width === nextW && el.height === nextH) return;

      el.width = nextW;
      el.height = nextH;
      const ctx = el.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0f172a'; // slate-900 — ink, not the theme accent
      hasInkRef.current = false;
      setHasInk(false);
      onInkChange(false);
    }

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [onInkChange]);

  useEffect(() => {
    onHandle({
      isEmpty: () => !hasInkRef.current,
      clear,
      toBlob: () =>
        new Promise<Blob | null>((resolve) => {
          const canvas = canvasRef.current;
          if (!canvas || !hasInkRef.current) return resolve(null);
          canvas.toBlob((blob) => resolve(blob), 'image/png');
        }),
    });
  }, [onHandle, clear]);

  function pointFrom(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    // Capture so a stroke that leaves the canvas still ends cleanly rather than
    // leaving the pad stuck in a drawing state.
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const { x, y } = pointFrom(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    // A tap with no drag is still a mark — draw a dot so a full stop counts.
    ctx.lineTo(x + 0.01, y);
    ctx.stroke();
    markInk();
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || disabled) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = pointFrom(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function endStroke(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative rounded-xl bg-white dark:bg-slate-100 overflow-hidden">
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onPointerLeave={endStroke}
          className="block h-44 w-full touch-none"
          style={{ touchAction: 'none' }}
          aria-label="Signature pad. Sign with your finger or a stylus."
          role="img"
        />
        {!hasInk && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="text-sm text-slate-400">Sign here</span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-5 bottom-6 border-b border-slate-300" />
      </div>

      <button
        type="button"
        onClick={clear}
        disabled={disabled || !hasInk}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
      >
        <Eraser className="h-4 w-4" />
        Clear and sign again
      </button>
    </div>
  );
}
