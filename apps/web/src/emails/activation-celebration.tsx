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

interface ActivationCelebrationEmailProps {
  firstName: string;
  companyName: string;
  dashboardUrl: string;
}

export function ActivationCelebrationEmail({
  firstName,
  companyName,
  dashboardUrl,
}: ActivationCelebrationEmailProps) {
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
              Big milestone — {companyName} just completed the DriveCommand
              onboarding checklist.
            </Text>
            <Text style={styles.message}>
              You&apos;ve added your fleet, your team is set up, and your first
              load is moving. That&apos;s the hardest part done.
            </Text>
            <Text style={styles.message}>
              Here&apos;s what&apos;s unlocked for you now: full reporting,
              invoice generation, compliance monitoring, and the profit
              predictor.
            </Text>

            <Section style={styles.ctaSection}>
              <Button href={dashboardUrl} style={styles.button}>
                Open my dashboard
              </Button>
            </Section>

            <Text style={styles.message}>
              Reply to this email anytime — I read every message personally.
            </Text>

            <Text style={styles.signature}>
              — Sammy
              <br />
              <span style={{ fontSize: '12px', color: '#6b7280' }}>
                Founder, DriveCommand
              </span>
            </Text>
          </Section>

          <Section style={styles.footer}>
            <Hr style={styles.divider} />
            <Text style={styles.footerText}>DriveCommand — Fleet Management</Text>
            <Text style={styles.footerSubtext}>
              You&apos;re receiving this because you completed onboarding on DriveCommand.
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
