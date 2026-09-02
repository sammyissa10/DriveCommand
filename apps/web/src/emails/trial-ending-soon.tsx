//
// Sent via resend-client.ts with:
//   from: resolved by sender-config.ts — the NotificationEmailConfig row if
//         one exists, otherwise RESEND_FROM_NAME / RESEND_FROM_EMAIL.
//   replyTo: the resolved sender config, or an explicit replyTo argument.
//
// Rule key: trial_ending_soon
// Trigger: trialEndsAt 3-5 days away, status=TRIALING; dedup window 20h (runOncePerTenant=false)
//
import * as React from 'react';
import { Shell, Button } from './_system';
import { getAppBaseUrl } from '@/lib/app-url';

interface TrialEndingSoonEmailProps {
  firstName: string;
  companyName: string;
  daysLeft: number;
  subscriptionUrl: string;
}

export function TrialEndingSoonEmail({
  firstName,
  companyName: _companyName,
  daysLeft,
  subscriptionUrl,
}: TrialEndingSoonEmailProps) {
  const dayLabel = daysLeft === 1 ? 'day' : 'days';

  return (
    <Shell
      preheader={`Your trial ends in ${daysLeft} ${dayLabel} — keep your fleet running`}
      logoBaseUrl={getAppBaseUrl()}
      statusBar={{ tone: 'attention', label: `Trial ends in ${daysLeft} ${dayLabel}` }}
    >
      <h2>Hey {firstName},</h2>
      <p>
        Quick heads up — your DriveCommand trial ends in{' '}
        <strong>
          {daysLeft} {dayLabel}
        </strong>
        .
      </p>
      <p>Upgrade to keep your fleet running without interruption.</p>
      <Button href={subscriptionUrl} label="Upgrade now" />
      <p>
        If you have questions about pricing or need more time, just reply to
        this email.
      </p>
      <p>— Sammy</p>
    </Shell>
  );
}
