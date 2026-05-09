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

interface ConfirmEmailTemplateProps {
  firstName: string;
  confirmUrl: string;
}

export function ConfirmEmailTemplate({ firstName, confirmUrl }: ConfirmEmailTemplateProps) {
  return (
    <Html>
      <Head />
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Text style={styles.headerText}>DriveCommand</Text>
          </Section>

          <Section style={styles.content}>
            <Text style={styles.greeting}>Hi {firstName},</Text>
            <Text style={styles.message}>
              Thanks for signing up! Please confirm your email address to keep
              your account secure. This link is valid for 24 hours.
            </Text>

            <Section style={styles.ctaSection}>
              <Button href={confirmUrl} style={styles.button}>
                Confirm my email
              </Button>
            </Section>

            <Text style={styles.smallNote}>
              If you didn&apos;t create a DriveCommand account, you can safely ignore
              this email.
            </Text>
          </Section>

          <Section style={styles.footer}>
            <Hr style={styles.divider} />
            <Text style={styles.footerText}>DriveCommand — Fleet Management</Text>
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
  greeting: { fontSize: '16px', margin: '0 0 12px' },
  message: { fontSize: '14px', lineHeight: '24px', color: '#374151', margin: '0 0 24px' },
  ctaSection: { textAlign: 'center' as const, marginTop: '24px', marginBottom: '24px' },
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
  smallNote: { fontSize: '12px', color: '#9ca3af', margin: '16px 0 0' },
  divider: { borderColor: '#e5e7eb', margin: '16px 0' },
  footer: { marginTop: '24px' },
  footerText: {
    fontSize: '13px',
    color: '#6b7280',
    textAlign: 'center' as const,
    margin: '0',
  },
};
