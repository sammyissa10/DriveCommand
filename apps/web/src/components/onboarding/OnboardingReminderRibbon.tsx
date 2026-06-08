"use client";

import Link from "next/link";
import { Rocket } from "lucide-react";

interface OnboardingReminderRibbonProps {
  onboardingComplete: boolean;
}

/**
 * OnboardingReminderRibbon
 *
 * Full-width inline banner that prompts owners to complete onboarding.
 * Renders below the top bar, above page content, inside the owner shell.
 * Returns null once onboarding is complete — no dismiss button, no local state.
 * Visibility is driven entirely by the `onboardingComplete` prop (server-fetched).
 */
export function OnboardingReminderRibbon({
  onboardingComplete,
}: OnboardingReminderRibbonProps) {
  if (onboardingComplete) {
    return null;
  }

  return (
    <div className="flex w-full items-center gap-3 border-b border-yellow-400/30 bg-[#0f1e3d] px-4 py-3 text-sm">
      <Rocket className="h-4 w-4 shrink-0 text-yellow-400" aria-hidden="true" />
      <span className="flex-1 font-medium text-white">
        Finish setting up your DriveCommand workspace.
      </span>
      <Link
        href="/onboarding/welcome"
        aria-label="Finish onboarding setup"
        className="inline-flex shrink-0 items-center rounded-md bg-yellow-400 px-3 py-1.5 text-sm font-semibold text-[#0f1e3d] transition-colors hover:bg-yellow-300"
      >
        Finish Setup
      </Link>
    </div>
  );
}
