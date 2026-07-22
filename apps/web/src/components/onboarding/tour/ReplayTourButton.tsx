'use client';

import { PlayCircle } from 'lucide-react';
import { useOnboardingTour } from './OnboardingTour';

/**
 * "Replay walkthrough" — restarts the first-run navigational tour on demand.
 * Lives on the Help Center page (the "?" affordance). Works because the Help
 * page renders inside OwnerShell, which provides the tour context.
 *
 * The tour spotlights the mobile nav chrome, so this is most useful at mobile
 * widths; on desktop only the intro card shows (mobile-only targets are absent).
 */
export function ReplayTourButton() {
  const { start } = useOnboardingTour();
  return (
    <button
      type="button"
      onClick={start}
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <PlayCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
      Replay walkthrough
    </button>
  );
}
