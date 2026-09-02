//
// Sent via resend-client.ts with:
//   from: resolved by sender-config.ts — the NotificationEmailConfig row if
//         one exists, otherwise RESEND_FROM_NAME / RESEND_FROM_EMAIL.
//   replyTo: the resolved sender config, or an explicit replyTo argument.
//
// Rule key: dispatch_load_nudge
// Trigger: firstRealDriverAt set, firstLoadInTransitAt null — tenant has a driver but no load in transit yet
//
import * as React from 'react';
import { Shell, Button } from './_system';
import { getAppBaseUrl } from '@/lib/app-url';

interface DispatchLoadNudgeEmailProps {
  firstName: string;
  companyName: string;
  loadsUrl: string;
}

export function DispatchLoadNudgeEmail({
  firstName,
  companyName: _companyName,
  loadsUrl,
}: DispatchLoadNudgeEmailProps) {
  return (
    <Shell
      preheader={`${firstName}, create your first load to unlock revenue tracking and profit per lane`}
      logoBaseUrl={getAppBaseUrl()}
    >
      <h2>Hey {firstName},</h2>
      <p>
        You&apos;ve got a truck and a driver set up in DriveCommand — great
        progress.
      </p>
      <p>
        The last step is creating your first load and dispatching it. Once a
        load is in transit, you unlock full reporting: revenue tracking, profit
        per lane, and compliance monitoring.
      </p>
      <Button href={loadsUrl} label="Create a load" />
      <p>— Sammy</p>
    </Shell>
  );
}
