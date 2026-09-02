import * as React from 'react';
import { Shell, Button } from '../_system';
import { getAppBaseUrl } from '@/lib/app-url';

export interface InvoiceGeneratedEmailProps {
  loadNumber: string;
  contractName: string;
  invoiceTotal: number;
  dueDate: string;
  clientPortalUrl?: string;
  companyName: string;
}

export function InvoiceGeneratedEmail({
  loadNumber,
  contractName,
  invoiceTotal,
  dueDate,
  clientPortalUrl,
  companyName,
}: InvoiceGeneratedEmailProps) {
  const formattedTotal = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(invoiceTotal);

  return (
    <Shell
      preheader={`Invoice ready for load ${loadNumber} — ${formattedTotal} from ${contractName}, due ${dueDate}`}
      logoBaseUrl={getAppBaseUrl()}
    >
      <h2>Invoice Ready</h2>
      <p>
        An invoice has been generated for the completed load. Please review the
        details below.
      </p>

      <p><strong>Load Number:</strong> {loadNumber}</p>
      <p><strong>Contract:</strong> {contractName}</p>
      <p><strong>Invoice Total:</strong> {formattedTotal}</p>
      <p><strong>Due Date:</strong> {dueDate}</p>

      {clientPortalUrl && (
        <Button href={clientPortalUrl} label="View in Portal" />
      )}

      <p>This is an automated invoice notification from {companyName}.</p>
    </Shell>
  );
}
