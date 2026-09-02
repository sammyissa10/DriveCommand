import * as React from 'react';
import { Shell, Button } from './_system';
import { getAppBaseUrl } from '@/lib/app-url';

interface ActivationCelebrationEmailProps {
  firstName: string;
  companyName: string;
  dashboardUrl: string;
}

export function ActivationCelebrationEmail({
  firstName,
  companyName,
  dashboardUrl,
}: ActivationCelebrationEmailProps) {
  return (
    <Shell
      preheader={`${companyName} just finished onboarding — full reporting and the profit predictor are unlocked`}
      logoBaseUrl={getAppBaseUrl()}
    >
      <h2>Hey {firstName},</h2>
      <p>
        Big milestone — {companyName} just completed the DriveCommand onboarding
        checklist.
      </p>
      <p>
        You&apos;ve added your fleet, your team is set up, and your first load is
        moving. That&apos;s the hardest part done.
      </p>
      <p>
        Here&apos;s what&apos;s unlocked for you now: full reporting, invoice generation,
        compliance monitoring, and the profit predictor.
      </p>
      <Button href={dashboardUrl} label="Open my dashboard" />
      <p>Reply to this email anytime — I read every message personally.</p>
      <p>
        — Sammy
        <br />
        Founder, DriveCommand
      </p>
    </Shell>
  );
}
