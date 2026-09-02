import * as React from 'react';
import { Shell, Button } from './_system';
import { getAppBaseUrl } from '@/lib/app-url';

interface WorkflowInstanceBlockedEmailProps {
  driverName: string;
  stepName: string;
  playbookName: string;
  tenantName: string;
  hoursBlocked: number;
  dashboardUrl: string;
}

export function WorkflowInstanceBlockedEmail({
  driverName,
  stepName,
  playbookName,
  tenantName,
  hoursBlocked,
  dashboardUrl,
}: WorkflowInstanceBlockedEmailProps) {
  return (
    <Shell
      preheader={`${driverName} has been blocked from dispatch for over ${hoursBlocked} hours`}
      logoBaseUrl={getAppBaseUrl()}
      statusBar={{ tone: 'attention', label: 'Action required — driver blocked' }}
    >
      <h2>Driver blocked — admin escalation</h2>
      <p>
        A driver has been blocked from dispatch for over {hoursBlocked} hours and
        requires admin attention.
      </p>
      <p><strong>Driver:</strong> {driverName}</p>
      <p><strong>Checklist:</strong> {playbookName}</p>
      <p><strong>Blocked on:</strong> &quot;{stepName}&quot;</p>
      <p><strong>Blocked for over {hoursBlocked} hours.</strong></p>
      <p>
        This driver cannot be dispatched until the required step is resolved.
        Please review and take action.
      </p>
      <Button href={dashboardUrl} label="Review checklist" />
      <p>
        {tenantName} — this is an automated admin escalation. Please log in to
        resolve the blocked checklist.
      </p>
    </Shell>
  );
}
