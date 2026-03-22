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

interface OwnerInvitationEmailProps {
  firstName: string;
  lastName: string;
  organizationName: string;
  acceptUrl: string;
  expiresAt: string;
}

export function OwnerInvitationEmail({
  firstName,
  lastName,
  organizationName,
  acceptUrl,
  expiresAt,
}: OwnerInvitationEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Text style={styles.headerText}>Welcome to DriveCommand</Text>
          </Section>

          <Section style={styles.content}>
            <Text style={styles.greeting}>Hello {firstName},</Text>
            <Text style={styles.message}>
              {organizationName} has been created on DriveCommand and you have been
              designated as the owner. Click the button below to create your account
              and start managing your fleet.
            </Text>

            <Section style={styles.ctaSection}>
              <Button href={acceptUrl} style={styles.button}>
                Set Up Your Account
              </Button>
            </Section>

            <Text style={styles.expiryNote}>
              This invitation expires on {expiresAt}.
            </Text>
          </Section>

          <Section style={styles.footer}>
            <Hr style={styles.divider} />
            <Text style={styles.footerText}>
              DriveCommand - Fleet Management
            </Text>
            <Text style={styles.footerSubtext}>
              If you did not expect this invitation, you can safely ignore this email.
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
  container: {
    margin: '0 auto',
    padding: '20px 0',
    maxWidth: '600px',
  },
  header: {
    backgroundColor: '#1e40af',
    padding: '20px',
    borderRadius: '8px 8px 0 0',
  },
  headerText: {
    color: '#ffffff',
    fontSize: '24px',
    fontWeight: 'bold',
    margin: '0',
    textAlign: 'center' as const,
  },
  content: {
    backgroundColor: '#ffffff',
    padding: '32px',
    borderRadius: '0 0 8px 8px',
  },
  greeting: {
    fontSize: '16px',
    margin: '0 0 16px',
  },
  message: {
    fontSize: '14px',
    lineHeight: '24px',
    margin: '0 0 24px',
    color: '#374151',
  },
  ctaSection: {
    textAlign: 'center' as const,
    marginTop: '32px',
    marginBottom: '32px',
  },
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
  expiryNote: {
    fontSize: '13px',
    color: '#6b7280',
    textAlign: 'center' as const,
    margin: '0',
  },
  divider: {
    borderColor: '#e5e7eb',
    margin: '16px 0',
  },
  footer: {
    marginTop: '32px',
  },
  footerText: {
    fontSize: '14px',
    color: '#6b7280',
    textAlign: 'center' as const,
    margin: '16px 0 8px',
  },
  footerSubtext: {
    fontSize: '12px',
    color: '#9ca3af',
    textAlign: 'center' as const,
    margin: '0',
  },
};
