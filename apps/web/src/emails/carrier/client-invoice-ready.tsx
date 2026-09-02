import * as React from 'react';
import { Shell, Button } from '../_system';
import { getAppBaseUrl } from '@/lib/app-url';

export interface ClientInvoiceReadyEmailProps {
  loadNumber: string;
  companyName: string;
  invoiceTotal: number;
  dueDate: string;
  lineItemsSummary: string;
  paymentInstructions?: string;
  portalUrl?: string;
}

export function ClientInvoiceReadyEmail({
  loadNumber,
  companyName,
  invoiceTotal,
  dueDate,
  lineItemsSummary,
  paymentInstructions,
  portalUrl,
}: ClientInvoiceReadyEmailProps) {
  const formattedTotal = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(invoiceTotal);

  return (
    <Shell
      preheader={`Your invoice for load ${loadNumber} — ${formattedTotal} payable by ${dueDate}`}
      logoBaseUrl={getAppBaseUrl()}
    >
      <h2>Invoice Ready for Payment</h2>
      <p>
        An invoice has been generated for your shipment. Please review the details and
        arrange payment by the due date.
      </p>

      <p><strong>Load Number:</strong> {loadNumber}</p>
      <p><strong>Invoice Total:</strong> {formattedTotal}</p>
      <p><strong>Due Date:</strong> {dueDate}</p>
      <p><strong>Charges:</strong> {lineItemsSummary}</p>

      {paymentInstructions && (
        <>
          <h2>Payment Instructions</h2>
          <p>{paymentInstructions}</p>
        </>
      )}

      {portalUrl && (
        <Button href={portalUrl} label="View Invoice" />
      )}

      <p>This is an automated invoice notification from {companyName}.</p>
    </Shell>
  );
}
