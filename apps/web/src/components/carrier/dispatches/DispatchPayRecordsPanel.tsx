'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DollarSign, CheckCheck, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

const PAY_STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  voided: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PayRecord {
  id: string;
  driverId: string;
  payModel: string;
  basePay: number;
  bonuses: number;
  reimbursements: number;
  deductions: number;
  netPay: number;
  status: string;
  approvedAt: string | null;
}

interface DriverOption {
  id: string;
  name: string;
}

interface DispatchPayRecordsPanelProps {
  payRecords: PayRecord[];
  drivers: DriverOption[];
  dispatchStatus: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DispatchPayRecordsPanel({ payRecords, drivers }: DispatchPayRecordsPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [approvingAll, setApprovingAll] = useState(false);
  const [recalculatingId, setRecalculatingId] = useState<string | null>(null);

  const driverMap: Record<string, string> = {};
  for (const d of drivers) driverMap[d.id] = d.name;

  const pendingRecords = payRecords.filter((r) => r.status === 'pending');

  async function approveRecord(id: string): Promise<void> {
    const res = await fetch(`/api/v1/carrier/pay-records/${id}/approve`, {
      method: 'PATCH',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error ?? 'Failed to approve pay record');
    }
  }

  function handleApprove(id: string) {
    startTransition(async () => {
      try {
        await approveRecord(id);
        toast.success('Pay record approved');
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to approve');
      }
    });
  }

  async function handleRecalculate(id: string) {
    setRecalculatingId(id);
    try {
      const res = await fetch(`/api/v1/carrier/pay-records/${id}/recalculate`, {
        method: 'PATCH',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed to recalculate');
      }
      toast.success('Pay record updated');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to recalculate pay record');
    } finally {
      setRecalculatingId(null);
    }
  }

  function handleApproveAll() {
    if (pendingRecords.length === 0) return;
    setApprovingAll(true);
    startTransition(async () => {
      try {
        for (const record of pendingRecords) {
          await approveRecord(record.id);
        }
        toast.success(`${pendingRecords.length} pay record(s) approved`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to approve all');
      } finally {
        setApprovingAll(false);
      }
    });
  }

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          Driver Pay Records
          <span className="text-sm font-normal text-muted-foreground">({payRecords.length})</span>
        </h3>
        {pendingRecords.length > 1 && (
          <Button
            size="sm"
            variant="outline"
            disabled={isPending || approvingAll}
            onClick={handleApproveAll}
          >
            <CheckCheck className="h-3.5 w-3.5 mr-1" />
            {approvingAll ? 'Approving…' : `Approve All (${pendingRecords.length})`}
          </Button>
        )}
      </div>

      {payRecords.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pay records generated for this dispatch.</p>
      ) : (
        <div className="space-y-3">
          {payRecords.map((record) => {
            const driverName = driverMap[record.driverId] ?? 'Unknown Driver';
            const statusBadge = PAY_STATUS_BADGE[record.status] ?? PAY_STATUS_BADGE.pending;
            const payModelLabel =
              record.payModel === 'per_mile'
                ? 'Per Mile'
                : record.payModel === 'percentage'
                ? 'Percentage'
                : record.payModel === 'flat'
                ? 'Flat Rate'
                : record.payModel === 'hourly'
                ? 'Hourly'
                : record.payModel;

            return (
              <div key={record.id} className="rounded-md border bg-background p-4 space-y-3">
                {/* Driver + status row */}
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-foreground">{driverName}</div>
                    <span className="text-xs text-muted-foreground">{payModelLabel}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge}`}>
                      {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                    </span>
                    {(record.status === 'pending' || record.status === 'approved') && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={recalculatingId === record.id}
                        onClick={() => void handleRecalculate(record.id)}
                        className="h-7 text-xs"
                        title="Re-sum approved expenses and recompute net pay"
                      >
                        <RefreshCw className={`h-3 w-3 mr-1 ${recalculatingId === record.id ? 'animate-spin' : ''}`} />
                        {recalculatingId === record.id ? 'Updating…' : 'Recalculate'}
                      </Button>
                    )}
                    {record.status === 'pending' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => handleApprove(record.id)}
                        className="h-7 text-xs"
                      >
                        Approve
                      </Button>
                    )}
                  </div>
                </div>

                {/* Pay breakdown */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground block">Base Pay</span>
                    <span className="font-medium text-foreground">{formatCurrency(record.basePay)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Bonuses</span>
                    <span className="font-medium text-foreground">{formatCurrency(record.bonuses)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Reimbursements</span>
                    <span className="font-medium text-foreground">{formatCurrency(record.reimbursements)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Deductions</span>
                    <span className="font-medium text-red-600">-{formatCurrency(record.deductions)}</span>
                  </div>
                </div>

                {/* Net pay */}
                <div className="flex items-center justify-between border-t border-border pt-2">
                  <span className="text-sm text-muted-foreground">Net Pay</span>
                  <span className="text-base font-bold text-foreground">{formatCurrency(record.netPay)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
