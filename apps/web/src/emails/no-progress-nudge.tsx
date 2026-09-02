//
// Sent via resend-client.ts with:
//   from: resolved by sender-config.ts — the NotificationEmailConfig row if
//         one exists, otherwise RESEND_FROM_NAME / RESEND_FROM_EMAIL.
//   replyTo: the resolved sender config, or an explicit replyTo argument.
//
// Rule key: no_progress_nudge
// Trigger: ~24h after signup, completionPct=20, no onboarding steps completed
//
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Button,
  Hr,
} from '@react-email/components';

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
    <Html>
      <Head />
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Text style={styles.headerText}>DriveCommand</Text>
          </Section>

          <Section style={styles.content}>
            <Text style={styles.greeting}>Hey {firstName},</Text>
            <Text style={styles.message}>
              You signed up for DriveCommand a little while ago but it looks
              like you haven&apos;t had a chance to get started yet.
            </Text>
            <Text style={styles.message}>
              That&apos;s totally fine — setting up a new fleet tool takes some
              thought. When you&apos;re ready, here&apos;s the simplest first
              step:
            </Text>

            <Section style={styles.listSection}>
              <Text style={styles.listItem}>
                ✓ Add your first truck (takes 2 minutes)
              </Text>
            </Section>

            <Text style={styles.message}>
              That&apos;s it for now. Everything else follows naturally from
              there.
            </Text>

            <Section style={styles.ctaSection}>
              <Button href={dashboardUrl} style={styles.button}>
                Get started →
              </Button>
            </Section>

            <Text style={styles.message}>
              Reply to this email if you have any questions — I read every
              message.
            </Text>

            <Text style={styles.signature}>— Sammy</Text>
          </Section>

          <Section style={styles.footer}>
            <Hr style={styles.divider} />
            <Text style={styles.footerText}>DriveCommand — Fleet Management</Text>
            <Text style={styles.footerSubtext}>
              You&apos;re receiving this because you signed up for DriveCommand.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const styles = {
  body: {
    backgroundColor: '#f6f9fc',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  container: { margin: '0 auto', padding: '20px 0', maxWidth: '600px' },
  header: { backgroundColor: '#1e40af', padding: '20px', borderRadius: '8px 8px 0 0' },
  headerText: {
    color: '#ffffff',
    fontSize: '22px',
    fontWeight: 'bold',
    margin: '0',
    textAlign: 'center' as const,
  },
  content: { backgroundColor: '#ffffff', padding: '32px', borderRadius: '0 0 8px 8px' },
  greeting: { fontSize: '16px', fontWeight: 'bold', margin: '0 0 16px' },
  message: { fontSize: '14px', lineHeight: '24px', color: '#374151', margin: '0 0 16px' },
  listSection: { margin: '0 0 24px', paddingLeft: '8px' },
  listItem: { fontSize: '14px', color: '#374151', margin: '0 0 8px', lineHeight: '22px' },
  ctaSection: { textAlign: 'center' as const, marginBottom: '24px' },
  button: {
    backgroundColor: '#1e40af',
    color: '#ffffff',
    padding: '12px 32px',
    borderRadius: '6px',
    textDecoration: 'none',
    fontSize: '16px',
    fontWeight: 'bold',
    display: 'inline-block',
  },
  signature: { fontSize: '14px', color: '#374151', margin: '8px 0 0', lineHeight: '22px' },
  divider: { borderColor: '#e5e7eb', margin: '16px 0' },
  footer: { marginTop: '24px' },
  footerText: {
    fontSize: '13px',
    color: '#6b7280',
    textAlign: 'center' as const,
    margin: '0 0 4px',
  },
  footerSubtext: {
    fontSize: '11px',
    color: '#9ca3af',
    textAlign: 'center' as const,
    margin: '0',
  },
};
