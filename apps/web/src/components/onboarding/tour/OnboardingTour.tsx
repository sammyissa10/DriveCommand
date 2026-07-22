'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { markTourSeen } from '@/app/(owner)/actions/onboarding-tour';
import { TOUR_STEPS, type TourStep } from './steps';

// ---------------------------------------------------------------------------
// Context — lets the Help page's "Replay walkthrough" restart the tour.
// ---------------------------------------------------------------------------

interface TourContextValue {
  /** Start (or replay) the tour from step 1. */
  start: () => void;
}

const TourContext = createContext<TourContextValue>({ start: () => {} });

export function useOnboardingTour(): TourContextValue {
  return useContext(TourContext);
}

/** First `[data-tour="name"]` element that is actually visible (non-zero rect).
 *  OwnerShell renders desktop + mobile branches (one CSS-hidden), so there can
 *  be two matches — this picks the laid-out one and returns null when absent. */
function resolveTarget(name: string): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const els = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`));
  return (
    els.find((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }) ?? null
  );
}

function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function OnboardingTourProvider({
  tourSeen,
  children,
}: {
  tourSeen: boolean;
  children: React.ReactNode;
}) {
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [index, setIndex] = useState(0);
  const [active, setActive] = useState(false);
  const [mounted, setMounted] = useState(false);
  const autoStartedRef = useRef(false);

  useEffect(() => setMounted(true), []);

  // Build the visible step list (dropping steps whose target isn't present) and
  // begin. Recomputed each start so replay reflects the current page's chrome.
  const begin = useCallback(() => {
    const visible = TOUR_STEPS.filter((s) => s.target === null || resolveTarget(s.target));
    setSteps(visible.length > 0 ? visible : TOUR_STEPS);
    setIndex(0);
    setActive(true);
  }, []);

  // Auto-start exactly once for first-run users, mobile only. A short delay lets
  // the sticky header / bottom nav lay out before we measure them.
  useEffect(() => {
    if (tourSeen || autoStartedRef.current || !isMobileViewport()) return;
    autoStartedRef.current = true;
    const t = setTimeout(begin, 600);
    return () => clearTimeout(t);
  }, [tourSeen, begin]);

  const finish = useCallback(() => {
    setActive(false);
    void markTourSeen();
  }, []);

  const next = useCallback(() => {
    setIndex((i) => {
      if (i + 1 >= steps.length) {
        finish();
        return i;
      }
      return i + 1;
    });
  }, [steps.length, finish]);

  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  const step = steps[index];

  return (
    <TourContext.Provider value={{ start: begin }}>
      {children}
      {mounted && active && step
        ? createPortal(
            <TourOverlay
              step={step}
              index={index}
              total={steps.length}
              onNext={next}
              onPrev={prev}
              onSkip={finish}
            />,
            document.body,
          )
        : null}
    </TourContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Overlay — spotlight + coach-mark card. Hand-rolled, no dependency.
// ---------------------------------------------------------------------------

const SPOTLIGHT_PAD = 6;
const CARD_GAP = 12;
const DIM = 'rgba(2, 6, 23, 0.72)';

function TourOverlay({
  step,
  index,
  total,
  onNext,
  onPrev,
  onSkip,
}: {
  step: TourStep;
  index: number;
  total: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (!step.target) {
      setRect(null);
      return;
    }
    const measure = () => {
      const el = resolveTarget(step.target as string);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    const raf = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [step]);

  const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
  const isLast = index + 1 >= total;

  // Card sits above the target when the target is in the lower half of the
  // screen (e.g. bottom nav), otherwise below it. No target → centered.
  const placeAbove = rect ? rect.top > vh / 2 : false;
  const cardStyle: React.CSSProperties = rect
    ? placeAbove
      ? { bottom: Math.max(CARD_GAP, vh - rect.top + CARD_GAP) }
      : { top: rect.bottom + CARD_GAP }
    : { top: '50%', transform: 'translateY(-50%)' };

  return (
    <div
      className="fixed inset-0 z-[2000]"
      role="dialog"
      aria-modal="true"
      aria-label="Product tour"
    >
      {/* Tap-through catcher: tapping the dimmed area advances (never traps). */}
      <button
        type="button"
        aria-label="Next step"
        onClick={onNext}
        className="absolute inset-0 h-full w-full cursor-default bg-transparent"
      />

      {/* Spotlight (or a plain dim layer for the intro step). */}
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-white/90 transition-all duration-200"
          style={{
            left: rect.left - SPOTLIGHT_PAD,
            top: rect.top - SPOTLIGHT_PAD,
            width: rect.width + SPOTLIGHT_PAD * 2,
            height: rect.height + SPOTLIGHT_PAD * 2,
            boxShadow: `0 0 0 9999px ${DIM}`,
          }}
        />
      ) : (
        <div className="pointer-events-none absolute inset-0" style={{ backgroundColor: DIM }} />
      )}

      {/* Coach-mark card. left/right insets keep it inside a 390px viewport. */}
      <div
        className="absolute left-4 right-4 mx-auto max-w-md rounded-2xl bg-card p-5 text-left shadow-2xl ring-1 ring-black/5"
        style={cardStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-medium tabular-nums text-muted-foreground">
            {index + 1} of {total}
          </span>
          <button
            type="button"
            onClick={onSkip}
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Skip
          </button>
        </div>
        <h3 className="text-base font-semibold text-foreground">{step.title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onPrev}
            disabled={index === 0}
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            Back
          </button>
          <button
            type="button"
            onClick={onNext}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {isLast ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
