import * as React from 'react';
import { Shell, Button } from '../_system';
import { getAppBaseUrl } from '@/lib/app-url';

export interface PayRecordReadyEmailProps {
  driverName: string;
  dispatchNumber: string;
  payPeriod: string;
  netPayAmount: number;
  payRecordsUrl: string;
  companyName: string;
}

export function PayRecordReadyEmail({
  driverName,
  dispatchNumber,
  payPeriod,
  netPayAmount,
  payRecordsUrl,
  companyName,
}: PayRecordReadyEmailProps) {
  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(netPayAmount);

  return (
    <Shell
      preheader={`${driverName}'s pay for ${payPeriod} — ${formattedAmount} awaiting approval`}
      logoBaseUrl={getAppBaseUrl()}
    >
      <h2>Driver Pay Record Ready for Review</h2>
      <p>
        A new driver pay record has been generated and is pending your review and
        approval.
      </p>

      <p><strong>Driver:</strong> {driverName}</p>
      <p><strong>Dispatch:</strong> {dispatchNumber}</p>
      <p><strong>Pay Period:</strong> {payPeriod}</p>
      <p><strong>Net Pay:</strong> {formattedAmount}</p>

      <Button href={payRecordsUrl} label="View Pay Records" />

      <p>This is an automated notification from {companyName}.</p>
    </Shell>
  );
}
