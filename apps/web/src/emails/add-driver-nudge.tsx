//
// Sent via resend-client.ts with:
//   from: resolved by sender-config.ts — the NotificationEmailConfig row if
//         one exists, otherwise RESEND_FROM_NAME / RESEND_FROM_EMAIL.
//   replyTo: the resolved sender config, or an explicit replyTo argument.
//
// Rule key: add_driver_nudge
// Trigger: firstRealTruckAt set, firstRealDriverAt null — tenant added a truck but no driver yet
//
import * as React from 'react';
import { Shell, Button } from './_system';
import { getAppBaseUrl } from '@/lib/app-url';

interface AddDriverNudgeEmailProps {
  firstName: string;
  companyName: string;
  driversUrl: string;
}

export function AddDriverNudgeEmail({
  firstName,
  companyName: _companyName,
  driversUrl,
}: AddDriverNudgeEmailProps) {
  return (
    <Shell
      preheader={`Nice work, ${firstName} — invite a driver to unlock assignments, HOS and the live map`}
      logoBaseUrl={getAppBaseUrl()}
    >
      <h2>Hey {firstName},</h2>
      <p>Nice — you added your first truck to DriveCommand.</p>
      <p>
        The next step is inviting a driver. Once a driver is connected, you can
        assign loads, track their HOS, and see their location on the live map.
      </p>
      <p>It only takes a minute to send the invite.</p>
      <Button href={driversUrl} label="Invite a driver" />
      <p>— Sammy</p>
    </Shell>
  );
}
