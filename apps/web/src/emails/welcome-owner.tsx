//
// Sent via resend-client.ts with:
//   from: resolved by sender-config.ts — the NotificationEmailConfig row if
//         one exists, otherwise RESEND_FROM_NAME / RESEND_FROM_EMAIL.
//   replyTo: the resolved sender config, or an explicit replyTo argument.
//
import * as React from 'react';
import { Shell, Button } from './_system';
import { getAppBaseUrl } from '@/lib/app-url';

interface WelcomeOwnerEmailProps {
  firstName: string;
  companyName: string;
  trialEndsAt: string; // e.g. "May 12, 2026"
  dashboardUrl: string;
}

export function WelcomeOwnerEmail({
  firstName,
  companyName,
  trialEndsAt,
  dashboardUrl,
}: WelcomeOwnerEmailProps) {
  return (
    <Shell
      preheader={`Welcome to DriveCommand, ${firstName} — your 14-day trial runs until ${trialEndsAt}`}
      logoBaseUrl={getAppBaseUrl()}
    >
      <h2>Hey {firstName},</h2>
      <p>
        Welcome to DriveCommand — I&apos;m Sammy, and I&apos;m genuinely stoked you signed
        up. {companyName} now has a full fleet management platform ready to go.
      </p>
      <p>
        Your 14-day trial runs until <strong>{trialEndsAt}</strong> — no credit card
        needed, no surprises. Here&apos;s what I&apos;d suggest doing first:
      </p>
      <ul>
        <li>Add your first truck</li>
        <li>Invite a driver</li>
        <li>Create your first load</li>
      </ul>
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
