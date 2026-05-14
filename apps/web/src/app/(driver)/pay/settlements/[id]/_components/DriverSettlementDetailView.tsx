'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Decimal from 'decimal.js';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Download, AlertTriangle, Info } from 'lucide-react';
import { DisputeForm } from '../../../_components/DisputeForm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PayComponent {
  id: string;
  componentType: string;
  category: string;
  description: string | null;
  grossAmount: string;
  isTaxable: boolean;
  isReimbursement: boolean;
}

interface Load {
  id: string;
  referenceNumber: string | null;
  status: string;
}

interface Assignment {
  id: string;
  loadId: string;
  payStatus: string;
  approvedAt: string | null;
  load: Load | null;
  payComponents: PayComponent[];
}

interface Bonus {
  id: string;
  bonusType: string;
  amount: string;
  description: string | null;
  isTaxable: boolean;
  scheduledPayDate: string | null;
  paidAt: string | null;
  installmentNumber: number | null;
  totalInstallments: number | null;
}

interface Settlement {
  id: string;
  status: string;
  settlementReference: string | null;
  periodStart: string;
  periodEnd: string;
  grossTaxable: string;
  grossNonTaxable: string;
  totalDeductions: string;
  netPay: string;
  pdfUrl: string | null;
  finalizedAt: string | null;
  paidAt: string | null;
  assignments: Assignment[];
  bonuses: Bonus[];
}

interface Props {
  settlement: Settlement;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatPeriod(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(s)} – ${fmt(e)}`;
}

function formatMoney(val: string): string {
  const n = parseFloat(val);
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'FINALIZED':
      return (
        <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-0">
          Finalized
        </Badge>
      );
    case 'PAID':
      return (
        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-0">
          Paid
        </Badge>
      );
    case 'VOIDED':
      return (
        <Badge variant="outline" className="text-muted-foreground line-through">
          Voided
        </Badge>
      );
    case 'DISPUTED':
      return (
        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-0">
          Disputed
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function componentTypeLabel(type: string): string {
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function bonusTypeLabel(type: string): string {
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DriverSettlementDetailView({ settlement }: Props) {
  const [disputeOpen, setDisputeOpen] = useState(false);

  // Compute totals from components
  const totalEarnings = settlement.assignments
    .flatMap((a) => a.payComponents)
    .reduce((sum, c) => sum.plus(new Decimal(c.grossAmount)), new Decimal(0));

  const totalBonuses = settlement.bonuses.reduce(
    (sum, b) => sum.plus(new Decimal(b.amount)),
    new Decimal(0),
  );

  const canDispute = settlement.status === 'FINALIZED';
  const disputeWindowPassed =
    settlement.status === 'PAID' || settlement.status === 'VOIDED';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back + PDF */}
      <div className="flex items-center justify-between">
        <Link
          href="/pay"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Pay
        </Link>

        {settlement.pdfUrl && (
          <a
            href={settlement.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </Button>
          </a>
        )}
      </div>

      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-lg">
                {formatPeriod(settlement.periodStart, settlement.periodEnd)}
              </CardTitle>
              {settlement.settlementReference && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  Ref: {settlement.settlementReference}
                </p>
              )}
            </div>
            <StatusBadge status={settlement.status} />
          </div>
        </CardHeader>
        <CardContent>
          {/* Net pay prominent */}
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground">Net Pay</p>
            <p className="text-4xl font-bold text-foreground">
              {formatMoney(settlement.netPay)}
            </p>
          </div>

          <Separator className="my-4" />

          {/* Summary row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Gross Taxable</p>
              <p className="font-medium">{formatMoney(settlement.grossTaxable)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Gross Non-Taxable</p>
              <p className="font-medium">{formatMoney(settlement.grossNonTaxable)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Total Deductions</p>
              <p className="font-medium text-red-600 dark:text-red-400">
                ({formatMoney(settlement.totalDeductions)})
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Earnings section */}
      {settlement.assignments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Earnings — {formatMoney(totalEarnings.toFixed(2))}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {settlement.assignments.map((a) => (
              <div key={a.id}>
                <p className="text-sm font-medium text-muted-foreground mb-2">
                  {a.load?.referenceNumber ?? 'Load'}
                </p>
                <div className="space-y-1">
                  {a.payComponents.map((c) => (
                    <div key={c.id} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {c.description ?? componentTypeLabel(c.componentType)}
                      </span>
                      <span className="font-medium">{formatMoney(c.grossAmount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Bonuses section */}
      {settlement.bonuses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Bonuses — {formatMoney(totalBonuses.toFixed(2))}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {settlement.bonuses.map((b) => (
              <div key={b.id} className="flex justify-between text-sm">
                <div>
                  <span>{bonusTypeLabel(b.bonusType)}</span>
                  {b.installmentNumber && b.totalInstallments && (
                    <span className="ml-2 text-muted-foreground">
                      (Installment {b.installmentNumber} of {b.totalInstallments})
                    </span>
                  )}
                </div>
                <span className="font-medium">{formatMoney(b.amount)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Dispute section */}
      <Card>
        <CardContent className="pt-6">
          {canDispute && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">
                  If you believe something is incorrect, you can dispute this
                  settlement. Disputes are reviewed within 24 hours.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => setDisputeOpen(true)}
                className="shrink-0"
              >
                Dispute this settlement
              </Button>
            </div>
          )}

          {disputeWindowPassed && (
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">
                This settlement has been{' '}
                {settlement.status === 'PAID' ? 'paid' : 'voided'} and is no
                longer disputable. Contact your dispatcher if you have questions.
              </p>
            </div>
          )}

          {settlement.status === 'DISPUTED' && (
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">
                A dispute has been submitted for this settlement. Your dispatcher
                will be in touch.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <DisputeForm
        settlementId={settlement.id}
        isOpen={disputeOpen}
        onClose={() => setDisputeOpen(false)}
      />
    </div>
  );
}
