'use client';

import React, { useState } from 'react';
import Decimal from 'decimal.js';
import { useRouter } from 'next/navigation';
import { formatPayPeriodDate } from '@/lib/utils/date';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, User } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Settlement {
  id: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  netPay: string;
  pdfUrl: string | null;
  settlementReference: string | null;
}

interface PayComponent {
  id: string;
  grossAmount: string;
  visibleToDriver: boolean;
}

interface AssignmentLoad {
  id: string;
  referenceNumber: string | null;
  status: string;
}

interface CurrentPeriodAssignment {
  id: string;
  payStatus: string;
  load: AssignmentLoad | null;
  payComponents: PayComponent[];
}

interface Bonus {
  id: string;
  bonusType: string;
  description: string | null;
  amount: string;
  paidAt: string | null;
  scheduledPayDate: string | null;
  installmentNumber: number | null;
  totalInstallments: number | null;
}

interface Deduction {
  id: string;
  deductionType: string;
  schedule: string;
  amountPerPeriod: string | null;
  totalAmount: string | null;
  amountCollected: string | null;
}

interface Props {
  driverName: string;
  payModel: string;
  settlements: Settlement[];
  currentPeriod: CurrentPeriodAssignment[];
  bonuses: Bonus[];
  deductions: Deduction[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPeriod(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${formatPayPeriodDate(start, opts)} – ${formatPayPeriodDate(end, opts)}`;
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

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-muted-foreground text-sm max-w-xs">{children}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Settlements
// ---------------------------------------------------------------------------

function SettlementsTab({
  settlements,
}: {
  settlements: Settlement[];
}) {
  const router = useRouter();

  if (settlements.length === 0) {
    return (
      <EmptyState>
        No settlements yet. They&apos;ll show here once approved loads are settled.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-2">
      {settlements.map((s) => (
        <div
          key={s.id}
          onClick={() => router.push(`/pay/settlements/${s.id}`)}
          className="flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:bg-accent/40 cursor-pointer transition-colors"
        >
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">
              {formatPeriod(s.periodStart, s.periodEnd)}
            </span>
            <StatusBadge status={s.status} />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-foreground">
              {formatMoney(s.netPay)}
            </span>
            {s.pdfUrl && (
              <a
                href={s.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Download PDF"
              >
                <Download className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Current Period
// ---------------------------------------------------------------------------

function CurrentPeriodTab({
  assignments,
}: {
  assignments: CurrentPeriodAssignment[];
}) {
  if (assignments.length === 0) {
    return (
      <EmptyState>
        Quiet period so far. Your next completed load will show up here.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-2">
      {assignments.map((a) => {
        const total = a.payComponents.reduce(
          (sum, c) => sum.plus(new Decimal(c.grossAmount)),
          new Decimal(0),
        );

        return (
          <div
            key={a.id}
            className="flex items-center justify-between p-4 rounded-lg border border-border bg-card"
          >
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">
                {a.load?.referenceNumber ?? (a.load ? `Load #${a.load.id.slice(0, 8)}` : 'Unknown load')}
              </span>
              <span className="text-xs text-muted-foreground">
                {a.payStatus === 'APPROVED'
                  ? 'Approved by manager • awaiting settlement'
                  : 'Pending manager review'}
              </span>
            </div>
            <span className="text-base font-semibold text-foreground">
              {formatMoney(total.toFixed(2))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Deductions
// ---------------------------------------------------------------------------

function DeductionsTab({ deductions }: { deductions: Deduction[] }) {
  if (deductions.length === 0) {
    return <EmptyState>No active deductions.</EmptyState>;
  }

  const deductionTypeLabel = (type: string) =>
    type
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="space-y-3">
      {deductions.map((d) => {
        const collected = new Decimal(d.amountCollected ?? '0');
        const total = new Decimal(d.totalAmount ?? '0');
        const remaining = total.minus(collected);
        const pct = total.isZero()
          ? 0
          : collected.div(total).times(100).toDecimalPlaces(0).toNumber();
        const hasInstallments = !total.isZero();

        return (
          <div key={d.id} className="p-4 rounded-lg border border-border bg-card space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{deductionTypeLabel(d.deductionType)}</span>
              {d.amountPerPeriod && (
                <span className="text-sm text-muted-foreground">
                  {formatMoney(d.amountPerPeriod)}/period
                </span>
              )}
            </div>

            {hasInstallments && (
              <>
                <Progress value={pct} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{pct}% paid off</span>
                  <span>{formatMoney(remaining.toString())} remaining</span>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Bonuses
// ---------------------------------------------------------------------------

function BonusesTab({ bonuses }: { bonuses: Bonus[] }) {
  if (bonuses.length === 0) {
    return <EmptyState>No bonuses on record yet.</EmptyState>;
  }

  const bonusTypeLabel = (type: string) =>
    type
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="space-y-2">
      {bonuses.map((b) => (
        <div
          key={b.id}
          className="flex items-center justify-between p-4 rounded-lg border border-border bg-card"
        >
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">{bonusTypeLabel(b.bonusType)}</span>
            {b.description && (
              <span className="text-xs text-muted-foreground">{b.description}</span>
            )}
            {b.installmentNumber && b.totalInstallments && (
              <span className="text-xs text-muted-foreground">
                Installment {b.installmentNumber} of {b.totalInstallments}
              </span>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-base font-semibold">{formatMoney(b.amount)}</span>
            {b.paidAt ? (
              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-0 text-xs">
                Paid
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs">
                Pending
              </Badge>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DriverPayPage({
  driverName,
  payModel,
  settlements,
  currentPeriod,
  bonuses,
  deductions,
}: Props) {
  const [activeTab, setActiveTab] = useState('settlements');

  const payModelLabel = payModel
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">{driverName}</p>
              <p className="text-sm text-muted-foreground">{payModelLabel}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="settlements">Settlements</TabsTrigger>
          <TabsTrigger value="current">Current Period</TabsTrigger>
          <TabsTrigger value="deductions">Deductions</TabsTrigger>
          <TabsTrigger value="bonuses">Bonuses</TabsTrigger>
        </TabsList>

        <TabsContent value="settlements" className="mt-4">
          <SettlementsTab settlements={settlements} />
        </TabsContent>

        <TabsContent value="current" className="mt-4">
          <CurrentPeriodTab assignments={currentPeriod} />
        </TabsContent>

        <TabsContent value="deductions" className="mt-4">
          <DeductionsTab deductions={deductions} />
        </TabsContent>

        <TabsContent value="bonuses" className="mt-4">
          <BonusesTab bonuses={bonuses} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
