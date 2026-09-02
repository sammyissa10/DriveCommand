//
// Sent via resend-client.ts with:
//   from: resolved by sender-config.ts — the NotificationEmailConfig row if
//         one exists, otherwise RESEND_FROM_NAME / RESEND_FROM_EMAIL.
//   replyTo: the resolved sender config, or an explicit replyTo argument.
//
// Rule key: no_progress_nudge
// Trigger: ~24h after signup, completionPct=20, no onboarding steps completed
//
import * as React from 'react';
import { Shell, Button } from './_system';
import { getAppBaseUrl } from '@/lib/app-url';

interface NoProgressNudgeEmailProps {
  firstName: string;
  companyName: string;
  dashboardUrl: string;
}

export function NoProgressNudgeEmail({
  firstName,
  companyName: _companyName,
  dashboardUrl,
}: NoProgressNudgeEmailProps) {
  return (
    <Shell
      preheader={`Hey ${firstName} — pick up DriveCommand where you left off, it takes 2 minutes`}
      logoBaseUrl={getAppBaseUrl()}
    >
      <h2>Hey {firstName},</h2>
      <p>
        You signed up for DriveCommand a little while ago but it looks like you
        haven&apos;t had a chance to get started yet.
      </p>
      <p>
        That&apos;s totally fine — setting up a new fleet tool takes some thought.
        When you&apos;re ready, here&apos;s the simplest first step:
      </p>
      <ul>
        <li>Add your first truck (takes 2 minutes)</li>
      </ul>
      <p>That&apos;s it for now. Everything else follows naturally from there.</p>
      <Button href={dashboardUrl} label="Get started" />
      <p>Reply to this email if you have any questions — I read every message.</p>
      <p>— Sammy</p>
    </Shell>
  );
}
