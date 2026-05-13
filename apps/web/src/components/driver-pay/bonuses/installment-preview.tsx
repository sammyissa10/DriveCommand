'use client';

import React from 'react';
import Decimal from 'decimal.js';
import { scheduleInstallments } from '@/lib/driver-pay/installment-scheduler';

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

interface Props {
  totalAmount: string;
  count: number;
  startDate: string;
  intervalDays: number;
}

export function InstallmentPreview({ totalAmount, count, startDate, intervalDays }: Props) {
  let rows: { installmentNumber: number; scheduledPayDate: Date; amount: Decimal }[] = [];
  let error: string | null = null;

  try {
    rows = scheduleInstallments({
      totalAmount: new Decimal(totalAmount),
      count,
      startDate: new Date(startDate),
      intervalDays,
    });
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to compute schedule.';
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">{error}</p>
    );
  }

  const total = fmt.format(Number(totalAmount));

  return (
    <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        Schedule preview ({count} installments totaling {total}):
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-1 pr-3 text-xs font-medium text-muted-foreground">Installment</th>
            <th className="text-left py-1 pr-3 text-xs font-medium text-muted-foreground">Pay Date</th>
            <th className="text-right py-1 text-xs font-medium text-muted-foreground">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.installmentNumber} className="border-b border-border last:border-0">
              <td className="py-1 pr-3 text-muted-foreground">{row.installmentNumber}</td>
              <td className="py-1 pr-3">
                {row.scheduledPayDate.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </td>
              <td className="py-1 text-right font-medium">
                {fmt.format(Number(row.amount.toString()))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
