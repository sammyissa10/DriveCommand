import * as React from 'react';
import { Shell, Button, StatGrid } from './_system';
import { getAppBaseUrl } from '@/lib/app-url';

interface WorkflowSafetyDigestEmailProps {
  tenantName: string;
  date: string; // e.g. "April 24, 2026"
  overdueCount: number;
  completedTodayCount: number;
  activeInstanceCount: number;
  dashboardUrl: string;
}

export function WorkflowSafetyDigestEmail({
  tenantName,
  date,
  overdueCount,
  completedTodayCount,
  activeInstanceCount,
  dashboardUrl,
}: WorkflowSafetyDigestEmailProps) {
  const previewText =
    overdueCount > 0
      ? `${overdueCount} overdue step${overdueCount !== 1 ? 's' : ''} — review needed`
      : `${completedTodayCount} step${completedTodayCount !== 1 ? 's' : ''} completed today`;

  return (
    <Shell
      preheader={previewText}
      logoBaseUrl={getAppBaseUrl()}
      statusBar={
        overdueCount > 0
          ? { tone: 'attention', label: `${overdueCount} overdue step${overdueCount !== 1 ? 's' : ''}` }
          : undefined
      }
    >
      <h2>Daily workflow summary</h2>
      <p>
        {tenantName} · {date}
      </p>
      <StatGrid
        stats={[
          { value: String(overdueCount), label: overdueCount === 1 ? 'Overdue step' : 'Overdue steps' },
          { value: String(completedTodayCount), label: 'Completed today' },
          { value: String(activeInstanceCount), label: activeInstanceCount === 1 ? 'Active checklist' : 'Active checklists' },
        ]}
      />
      {overdueCount > 0 && (
        <p>
          {overdueCount} step{overdueCount !== 1 ? 's are' : ' is'} past due and
          require{overdueCount === 1 ? 's' : ''} attention.
        </p>
      )}
      <Button href={dashboardUrl} label="View dashboard" />
      <p>
        You are receiving this because you are an owner or manager on {tenantName}{' '}
        DriveCommand. Daily digest sent at 8:00 AM UTC.
      </p>
    </Shell>
  );
}
