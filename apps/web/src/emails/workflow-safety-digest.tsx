import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

interface WorkflowSafetyDigestEmailProps {
  tenantName: string;
  date: string;            // e.g. "April 24, 2026"
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
  const previewText = overdueCount > 0
    ? `${overdueCount} overdue step${overdueCount !== 1 ? 's' : ''} — review needed`
    : `${completedTodayCount} step${completedTodayCount !== 1 ? 's' : ''} completed today`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={{ backgroundColor: '#f9fafb', fontFamily: 'sans-serif', margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: 560, margin: '40px auto', backgroundColor: '#ffffff', borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
          {/* Header */}
          <Section style={{ backgroundColor: '#0f172a', padding: '24px 32px' }}>
            <Heading style={{ color: '#ffffff', fontSize: 18, margin: 0 }}>
              DriveCommand — Daily Workflow Summary
            </Heading>
            <Text style={{ color: '#94a3b8', fontSize: 13, margin: '4px 0 0' }}>
              {tenantName} · {date}
            </Text>
          </Section>

          {/* Stats */}
          <Section style={{ padding: '28px 32px 0' }}>
            <table width="100%" cellPadding={0} cellSpacing={0}>
              <tr>
                <td style={{ width: '33%', textAlign: 'center', paddingBottom: 20 }}>
                  <Text style={{ fontSize: 28, fontWeight: 700, color: overdueCount > 0 ? '#dc2626' : '#111827', margin: 0 }}>
                    {overdueCount}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#6b7280', margin: '2px 0 0' }}>Overdue steps</Text>
                </td>
                <td style={{ width: '33%', textAlign: 'center', paddingBottom: 20, borderLeft: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb' }}>
                  <Text style={{ fontSize: 28, fontWeight: 700, color: '#111827', margin: 0 }}>
                    {completedTodayCount}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#6b7280', margin: '2px 0 0' }}>Completed today</Text>
                </td>
                <td style={{ width: '33%', textAlign: 'center', paddingBottom: 20 }}>
                  <Text style={{ fontSize: 28, fontWeight: 700, color: '#111827', margin: 0 }}>
                    {activeInstanceCount}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#6b7280', margin: '2px 0 0' }}>Active checklists</Text>
                </td>
              </tr>
            </table>
          </Section>

          <Hr style={{ borderColor: '#e5e7eb', margin: '0 32px' }} />

          {/* Alert message if overdue */}
          {overdueCount > 0 && (
            <Section style={{ padding: '20px 32px 0' }}>
              <Text style={{ fontSize: 14, color: '#dc2626', margin: 0 }}>
                {overdueCount} step{overdueCount !== 1 ? 's are' : ' is'} past due and require{overdueCount === 1 ? 's' : ''} attention.
              </Text>
            </Section>
          )}

          {/* CTA */}
          <Section style={{ padding: '24px 32px 32px', textAlign: 'center' as const }}>
            <Button
              href={dashboardUrl}
              style={{
                backgroundColor: '#0f172a',
                color: '#ffffff',
                padding: '12px 28px',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              View Dashboard
            </Button>
          </Section>

          {/* Footer */}
          <Section style={{ backgroundColor: '#f9fafb', padding: '16px 32px', borderTop: '1px solid #e5e7eb' }}>
            <Text style={{ fontSize: 11, color: '#9ca3af', margin: 0, textAlign: 'center' as const }}>
              You are receiving this because you are an owner or manager on {tenantName} DriveCommand.
              Daily digest sent at 8:00 AM UTC.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
