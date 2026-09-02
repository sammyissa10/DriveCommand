import * as React from 'react';
import { Shell, Button } from './_system';
import { getAppBaseUrl } from '@/lib/app-url';

interface DriverDocumentExpiryReminderEmailProps {
  driverName: string;
  documentType: string; // Human-readable: "Driver License", "Driver Application", "General Document"
  expiryDate: string;
  daysUntilExpiry: number;
  dashboardUrl: string;
}

export function DriverDocumentExpiryReminderEmail({
  driverName,
  documentType,
  expiryDate,
  daysUntilExpiry,
  dashboardUrl,
}: DriverDocumentExpiryReminderEmailProps) {
  const isUrgent = daysUntilExpiry < 7;
  const isExpired = daysUntilExpiry < 0;

  const daysLabel = isExpired
    ? `Expired ${Math.abs(daysUntilExpiry)} ${Math.abs(daysUntilExpiry) === 1 ? 'day' : 'days'} ago`
    : daysUntilExpiry === 0
      ? 'Expires today'
      : `Expires in ${daysUntilExpiry} ${daysUntilExpiry === 1 ? 'day' : 'days'}`;

  const statusLabel = isExpired ? 'Expired' : isUrgent ? 'Urgent — expiring soon' : `Expiring in ${daysUntilExpiry} days`;

  return (
    <Shell
      preheader={`${driverName}'s ${documentType} — ${daysLabel.toLowerCase()}`}
      logoBaseUrl={getAppBaseUrl()}
      statusBar={{ tone: 'attention', label: statusLabel }}
    >
      <h2>Driver document expiry notice</h2>
      <p>
        {isExpired
          ? 'A required driver document has expired:'
          : 'A required driver document is expiring soon:'}
      </p>
      <p><strong>Driver:</strong> {driverName}</p>
      <p><strong>Document:</strong> {documentType}</p>
      <p><strong>Expiry date:</strong> {expiryDate}</p>
      <p><strong>Status:</strong> {daysLabel}</p>
      {isUrgent && (
        <p>
          {isExpired
            ? 'This document has expired. Please renew immediately to maintain DOT compliance.'
            : 'This document is expiring soon. Please renew to avoid compliance issues.'}
        </p>
      )}
      <Button href={dashboardUrl} label="View driver profile" />
      <p>This is an automated reminder. Please log in to update driver documents.</p>
    </Shell>
  );
}
