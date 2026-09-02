import * as React from 'react';
import { Shell, Button, StatGrid } from '../_system';
import { getAppBaseUrl } from '@/lib/app-url';

export interface ComplianceAlertItem {
  type: string;
  message: string;
  severity: 'critical' | 'warning';
  link: string;
}

export interface ComplianceAlertEmailProps {
  companyName: string;
  alerts: ComplianceAlertItem[];
  dashboardUrl: string;
}

export function ComplianceAlertEmail({
  companyName,
  alerts,
  dashboardUrl,
}: ComplianceAlertEmailProps) {
  const criticalAlerts = alerts.filter((a) => a.severity === 'critical');
  const warningAlerts = alerts.filter((a) => a.severity === 'warning');

  return (
    <Shell
      preheader={`${alerts.length} compliance item${alerts.length !== 1 ? 's' : ''} at ${companyName} — ${criticalAlerts.length} critical`}
      logoBaseUrl={getAppBaseUrl()}
      statusBar={{
        tone: 'attention',
        label: `${alerts.length} compliance item${alerts.length !== 1 ? 's' : ''} need attention`,
      }}
    >
      <h2>
        {alerts.length} Compliance Alert{alerts.length !== 1 ? 's' : ''} Require
        Attention
      </h2>
      <p>
        The following compliance items require your immediate review. Please take
        action before any items expire.
      </p>

      <StatGrid
        stats={[
          { value: String(alerts.length), label: alerts.length === 1 ? 'Total alert' : 'Total alerts' },
          { value: String(criticalAlerts.length), label: 'Critical' },
          { value: String(warningAlerts.length), label: 'Warnings' },
        ]}
      />

      {criticalAlerts.length > 0 && (
        <>
          <h2>Critical ({criticalAlerts.length})</h2>
          {criticalAlerts.map((alert, i) => (
            // eslint-disable-next-line react/no-array-index-key -- 1:1 port of the original map, no stable id on the item
            <p key={i}>{alert.message}</p>
          ))}
        </>
      )}

      {warningAlerts.length > 0 && (
        <>
          <h2>Warnings ({warningAlerts.length})</h2>
          {warningAlerts.map((alert, i) => (
            // eslint-disable-next-line react/no-array-index-key -- 1:1 port of the original map, no stable id on the item
            <p key={i}>{alert.message}</p>
          ))}
        </>
      )}

      <Button href={dashboardUrl} label="View Compliance Dashboard" />

      <p>This is an automated daily compliance report from {companyName}.</p>
    </Shell>
  );
}
