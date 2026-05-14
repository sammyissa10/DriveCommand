'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatPayPeriodDate } from '@/lib/utils/date';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  Download,
  ExternalLink,
  Loader2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PayComponent {
  id: string;
  componentType: string;
  category: string;
  description: string;
  grossAmount: string;
  isTaxable: boolean;
}

interface Assignment {
  id: string;
  loadId: string;
  payStatus: string;
  approvedAt: string | null;
  load: { id: string; referenceNumber: string | null; status: string } | null;
  payComponents: PayComponent[];
}

interface Bonus {
  id: string;
  bonusType: string;
  amount: string;
  description: string;
  isTaxable: boolean;
  scheduledPayDate: string | null;
}

interface UnifiedDeduction {
  key: string;
  source: 'per-load' | 'recurring';
  label: string;
  subLabel: string | null;
  amount: string;
}

interface AnomalyResult {
  isAnomaly: boolean;
  fourWeekAverage: string | null;
  currentNet: string;
  deviationPct: string | null;
  reason: string | null;
}

interface Driver {
  id: string;
  firstName: string;
  lastName: string;
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
  finalizedBy: string | null;
  finalizedAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

interface Props {
  settlement: Settlement;
  driver: Driver | null;
  assignments: Assignment[];
  bonuses: Bonus[];
  deductions: UnifiedDeduction[];
  anomaly: AnomalyResult;
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

function formatMoney(val: string): string {
  const n = parseFloat(val);
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'DRAFT':
      return (
        <Badge variant="secondary" className="bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          Draft
        </Badge>
      );
    case 'FINALIZED':
      return (
        <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
          Finalized
        </Badge>
      );
    case 'PAID':
      return (
        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          Paid
        </Badge>
      );
    case 'VOIDED':
      return (
        <Badge variant="secondary" className="bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500 line-through">
          Voided
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SettlementDetailView({
  settlement,
  driver,
  assignments,
  bonuses,
  deductions,
  anomaly,
}: Props) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false);
  const [showMarkPaidDialog, setShowMarkPaidDialog] = useState(false);
  const [showVoidDialog, setShowVoidDialog] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voidConfirmed, setVoidConfirmed] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const driverName = driver
    ? `${driver.firstName} ${driver.lastName}`
    : settlement.id.slice(0, 8);

  const handleFinalize = async () => {
    setIsLoading('finalize');
    setErrorMsg(null);
    try {
      const res = await fetch(
        `/api/driver-pay/settlements/${settlement.id}/finalize`,
        { method: 'POST' },
      );
      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        setErrorMsg(data.error ?? 'Finalize failed.');
      } else {
        router.refresh();
      }
    } finally {
      setIsLoading(null);
      setShowFinalizeDialog(false);
    }
  };

  const handleMarkPaid = async () => {
    setIsLoading('markPaid');
    setErrorMsg(null);
    try {
      const res = await fetch(
        `/api/driver-pay/settlements/${settlement.id}/mark-paid`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      );
      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        setErrorMsg(data.error ?? 'Mark paid failed.');
      } else {
        router.refresh();
      }
    } finally {
      setIsLoading(null);
      setShowMarkPaidDialog(false);
    }
  };

  const handleVoid = async () => {
    if (!voidReason || voidReason.trim().length < 5 || !voidConfirmed) return;
    setIsLoading('void');
    setErrorMsg(null);
    try {
      const res = await fetch(
        `/api/driver-pay/settlements/${settlement.id}/void`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: voidReason }),
        },
      );
      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        setErrorMsg(data.error ?? 'Void failed.');
      } else {
        router.refresh();
      }
    } finally {
      setIsLoading(null);
      setShowVoidDialog(false);
    }
  };

  const handleDownloadPdf = async () => {
    setIsLoading('pdf');
    try {
      const res = await fetch(`/api/driver-pay/settlements/${settlement.id}/pdf`);
      if (!res.ok) {
        setErrorMsg('Failed to get PDF.');
        return;
      }
      const contentType = res.headers.get('Content-Type') ?? '';
      if (contentType.includes('application/json')) {
        const data = (await res.json()) as { url: string };
        window.open(data.url, '_blank');
      } else {
        // Streamed buffer
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      }
    } finally {
      setIsLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="gap-1"
        >
          <ArrowLeft className="h-4 w-4" />
          Settlements
        </Button>
        <div className="flex items-center gap-3">
          <StatusBadge status={settlement.status} />
          <h1 className="text-lg font-semibold">
            {settlement.settlementReference ?? 'Settlement'}
          </h1>
        </div>
      </div>

      {/* Error */}
      {errorMsg && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {errorMsg}
        </div>
      )}

      {/* Anomaly banner */}
      {anomaly.isAnomaly && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300 cursor-default">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span className="font-medium">Higher than usual — review before finalizing</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <p className="text-xs">
                {anomaly.reason ?? `Net pay deviates ${anomaly.deviationPct ?? '?'}% from 4-week average of ${anomaly.fourWeekAverage ? formatMoney(anomaly.fourWeekAverage) : '—'}`}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Hero card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row justify-between gap-4">
            <div>
              <p className="text-4xl font-bold text-emerald-600 dark:text-emerald-400">
                {formatMoney(settlement.netPay)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Period: {formatPayPeriodDate(settlement.periodStart, { month: 'short', day: 'numeric', year: 'numeric' })} – {formatPayPeriodDate(settlement.periodEnd, { month: 'short', day: 'numeric', year: 'numeric' })}{' '}
                · {driverName}
              </p>
            </div>
            {/* Action buttons */}
            <div className="flex items-start gap-2 flex-wrap">
              {settlement.status === 'DRAFT' && (
                <>
                  <Button onClick={() => setShowFinalizeDialog(true)} disabled={!!isLoading}>
                    {isLoading === 'finalize' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Finalize'
                    )}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => setShowVoidDialog(true)}
                    disabled={!!isLoading}
                  >
                    Void
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={handleDownloadPdf}
                    disabled={!!isLoading}
                    aria-label="Download preview PDF"
                  >
                    {isLoading === 'pdf' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                  </Button>
                </>
              )}
              {settlement.status === 'FINALIZED' && (
                <>
                  <Button onClick={() => setShowMarkPaidDialog(true)} disabled={!!isLoading}>
                    {isLoading === 'markPaid' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Mark Paid'
                    )}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => setShowVoidDialog(true)}
                    disabled={!!isLoading}
                  >
                    Void
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleDownloadPdf}
                    disabled={!!isLoading}
                    aria-label="Download PDF"
                  >
                    {isLoading === 'pdf' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        Download PDF
                      </>
                    )}
                  </Button>
                </>
              )}
              {(settlement.status === 'PAID' || settlement.status === 'VOIDED') && (
                <Button
                  variant="outline"
                  onClick={handleDownloadPdf}
                  disabled={!!isLoading || settlement.status === 'VOIDED'}
                  aria-label="Download PDF"
                >
                  {isLoading === 'pdf' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Download PDF
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary table */}
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Pay Summary
          </h2>
          <div className="space-y-2">
            <div className="flex justify-between py-1.5 border-b border-border/50">
              <span className="text-sm">Gross Taxable Earnings</span>
              <span className="text-sm font-medium">{formatMoney(settlement.grossTaxable)}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-border/50">
              <span className="text-sm">Gross Non-Taxable</span>
              <span className="text-sm font-medium">{formatMoney(settlement.grossNonTaxable)}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-border/50">
              <span className="text-sm">Total Deductions</span>
              <span className="text-sm font-medium text-red-600 dark:text-red-400">
                -{formatMoney(settlement.totalDeductions)}
              </span>
            </div>
            <div className="flex justify-between py-2 rounded-md bg-emerald-50 dark:bg-emerald-900/20 px-2 mt-1">
              <span className="font-semibold">Net Pay</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                {formatMoney(settlement.netPay)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-load breakdown */}
      {assignments.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Load Breakdown ({assignments.length} load{assignments.length !== 1 ? 's' : ''})
          </h2>
          <div className="space-y-2">
            {assignments.map((a) => (
              <Collapsible key={a.id}>
                <div className="rounded-lg border bg-card">
                  <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-sm">
                        Load #{a.load?.referenceNumber ?? a.loadId.slice(0, 8)}
                      </span>
                      {a.load && (
                        <button
                          type="button"
                          className="h-5 px-1 text-xs text-muted-foreground hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/carrier/loads/${a.loadId}`);
                          }}
                          aria-label="View load details"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      )}
                      <span className="text-xs text-muted-foreground">
                        Approved {formatDate(a.approvedAt)}
                      </span>
                    </div>
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="px-4 pb-3">
                    <div className="space-y-1">
                      {a.payComponents
                        .filter((c) => c.category !== 'DEDUCTION')
                        .map((c) => (
                          <div key={c.id} className="flex justify-between items-start text-sm">
                            <div>
                              <span>{c.description}</span>
                              <Badge
                                variant="outline"
                                className="ml-2 text-xs py-0"
                              >
                                {c.category}
                              </Badge>
                            </div>
                            <span>{formatMoney(c.grossAmount)}</span>
                          </div>
                        ))}
                      {a.payComponents.filter((c) => c.category !== 'DEDUCTION').length === 0 && (
                        <p className="text-sm text-muted-foreground">No pay components.</p>
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            ))}
          </div>
        </div>
      )}

      {/* Bonuses */}
      {bonuses.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Bonuses
            </h2>
            <div className="space-y-2">
              {bonuses.map((b) => (
                <div key={b.id} className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{b.bonusType}</Badge>
                    <span>{b.description}</span>
                    {!b.isTaxable && (
                      <span className="text-xs text-muted-foreground">(non-taxable)</span>
                    )}
                  </div>
                  <span className="font-medium">{formatMoney(b.amount)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Deductions — unified per-load + recurring */}
      {deductions.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Deductions
            </h2>
            <div className="space-y-2">
              {deductions.map((d) => (
                <div key={d.key} className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs py-0">
                      {d.source === 'per-load' ? 'Per-Load' : 'Recurring'}
                    </Badge>
                    <span>{d.label}</span>
                    {d.subLabel && (
                      <span className="text-xs text-muted-foreground">({d.subLabel})</span>
                    )}
                  </div>
                  <span className="font-medium text-red-600 dark:text-red-400">
                    -{formatMoney(d.amount)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Footer metadata */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground border-t pt-4">
        <span>Created: {formatDate(settlement.createdAt)}</span>
        {settlement.finalizedAt && (
          <span>Finalized: {formatDate(settlement.finalizedAt)}</span>
        )}
        {settlement.paidAt && (
          <span>Paid: {formatDate(settlement.paidAt)}</span>
        )}
        {settlement.settlementReference && (
          <span>Ref: {settlement.settlementReference}</span>
        )}
      </div>

      {/* ── Dialogs ── */}

      {/* Finalize dialog */}
      <AlertDialog open={showFinalizeDialog} onOpenChange={setShowFinalizeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalize this settlement?</AlertDialogTitle>
            <AlertDialogDescription>
              This will lock {assignments.length} assignment{assignments.length !== 1 ? 's' : ''}{' '}
              and {bonuses.length} bonus{bonuses.length !== 1 ? 'es' : ''}, generate a PDF, and
              prevent further edits. The settlement can still be voided if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleFinalize}>Finalize</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mark Paid dialog */}
      <AlertDialog open={showMarkPaidDialog} onOpenChange={setShowMarkPaidDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark settlement as PAID?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. {driverName} will be marked as paid{' '}
              <strong>{formatMoney(settlement.netPay)}</strong> for the period{' '}
              {formatPayPeriodDate(settlement.periodStart, { month: 'short', day: 'numeric', year: 'numeric' })}–{formatPayPeriodDate(settlement.periodEnd, { month: 'short', day: 'numeric', year: 'numeric' })}.{' '}
              {assignments.length} assignment{assignments.length !== 1 ? 's' : ''} will move to PAID
              status.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleMarkPaid}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Mark Paid
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Void dialog */}
      <AlertDialog open={showVoidDialog} onOpenChange={setShowVoidDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void this settlement?</AlertDialogTitle>
            <AlertDialogDescription>
              This will release all assignments back to APPROVED status and reverse any deductions
              applied during generation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="void-reason">Reason (required)</Label>
              <Textarea
                id="void-reason"
                placeholder="Explain why this settlement is being voided..."
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                rows={3}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="void-confirm"
                checked={voidConfirmed}
                onCheckedChange={(checked) => setVoidConfirmed(checked)}
                aria-label="Confirm void"
              />
              <Label htmlFor="void-confirm" className="text-sm font-normal cursor-pointer">
                I understand this releases all assignments back to APPROVED and reverses deductions
              </Label>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleVoid}
              disabled={voidReason.trim().length < 5 || !voidConfirmed}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Void Settlement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
