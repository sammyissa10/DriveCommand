/**
 * DynamicTemplateEmail — React Email shell for dispatcher-rendered notifications.
 *
 * This is the ONLY place `dangerouslySetInnerHTML` is used in the notification system.
 * The `bodyHtml` prop must be Tiptap-generated and variable-substituted by the
 * template renderer BEFORE being passed here. Never pass raw user input.
 */

import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import React from 'react';

export type DynamicTemplateEmailProps = {
  /** Already-substituted, Tiptap-generated HTML. The sole HTML injection site. */
  bodyHtml: string;
  /** Defaults to "DriveCommand" */
  brandName?: string;
  /** Optional postal address line; rendered only when provided. */
  footerAddress?: string;
};

const bodyStyle: React.CSSProperties = {
  backgroundColor: '#f6f7f9',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  margin: 0,
  padding: '40px 0',
};

const containerStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '8px',
  maxWidth: '600px',
  margin: '0 auto',
  padding: '0',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  backgroundColor: '#0f62fe',
  padding: '24px 32px',
};

const brandStyle: React.CSSProperties = {
  color: '#ffffff',
  fontSize: '20px',
  fontWeight: '700',
  margin: '0',
  letterSpacing: '-0.3px',
};

const bodySectionStyle: React.CSSProperties = {
  padding: '32px 32px 24px 32px',
  color: '#1a1a1a',
  fontSize: '15px',
  lineHeight: '1.6',
};

const hrStyle: React.CSSProperties = {
  borderColor: '#e5e7eb',
  margin: '0 32px',
};

const footerStyle: React.CSSProperties = {
  padding: '16px 32px 24px 32px',
};

const footerTextStyle: React.CSSProperties = {
  color: '#6b7280',
  fontSize: '12px',
  margin: '0 0 4px 0',
  lineHeight: '1.5',
};

export const DynamicTemplateEmail: React.FC<DynamicTemplateEmailProps> = ({
  bodyHtml,
  brandName = 'DriveCommand',
  footerAddress,
}) => {
  return (
    <Html lang="en">
      <Head />
      <Preview>{brandName} notification</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={headerStyle}>
            <Text style={brandStyle}>{brandName}</Text>
          </Section>

          <Section style={bodySectionStyle}>
            {/* eslint-disable-next-line react/no-danger */}
            <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
          </Section>

          <Hr style={hrStyle} />

          <Section style={footerStyle}>
            <Text style={footerTextStyle}>Sent by {brandName}</Text>
            {footerAddress ? (
              <Text style={footerTextStyle}>{footerAddress}</Text>
            ) : null}
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default DynamicTemplateEmail;
