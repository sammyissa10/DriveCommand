"use client";

import Link from "next/link";
import { Rocket } from "lucide-react";

interface OnboardingReminderRibbonProps {
  onboardingComplete: boolean;
}

/**
 * OnboardingReminderRibbon
 *
 * Renders a fixed top-right ribbon that links owners to the onboarding checklist.
 * Returns null once onboarding is complete — no dismiss button, no local state.
 * Visibility is driven entirely by the `onboardingComplete` prop (server-fetched).
 *
 * z-index 1100 sits above the mobile sticky header (z-[1001]).
 */
export function OnboardingReminderRibbon({
  onboardingComplete,
}: OnboardingReminderRibbonProps) {
  if (onboardingComplete) {
    return null;
  }

  return (
    <Link
      href="/onboarding/welcome"
      aria-label="Finish onboarding setup"
      className="fixed top-3 right-3 z-[1100] flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 shadow-md hover:shadow-lg transition-shadow text-sm"
    >
      <Rocket className="h-4 w-4 text-primary" aria-hidden="true" />
      <span className="font-medium text-foreground">Finish setup</span>
    </Link>
  );
}
