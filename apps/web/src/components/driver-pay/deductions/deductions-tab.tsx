'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Decimal from 'decimal.js';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AddDeductionForm } from './add-deduction-form';
import { formatDateOnlyShort } from '@/lib/utils/date';

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const DEDUCTION_TYPE_LABELS: Record<string, string> = {
  ADVANCE: 'Advance',
  ESCROW: 'Escrow',
  GARNISHMENT: 'Garnishment',
  CHILD_SUPPORT: 'Child Support',
  EQUIPMENT_LEASE: 'Equipment Lease',
  INSURANCE: 'Insurance',
  OTHER: 'Other',
};

const SCHEDULE_LABELS: Record<string, string> = {
  ONE_TIME: 'One-Time',
  EVERY_SETTLEMENT: 'Every Settlement',
  FIXED_INSTALLMENTS: 'Fixed Installments',
};

interface SerializedDeduction {
  id: string;
  deductionType: string;
  schedule: string;
  amountPerPeriod: string;
  totalAmount: string | null;
  amountCollected: string;
  maxPercentageOfNet: string | null;
  startsOn: string;
  endsOn: string | null;
  paused: boolean;
  visibleToDriver: boolean;
  notes: string | null;
}

interface Props {
  driverId: string;
  driverName: string;
  canEdit: boolean;
}

export function DeductionsTab({ driverId, canEdit }: Props) {
  const [deductions, setDeductions] = useState<SerializedDeduction[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [pausingId, setPausingId] = useState<string | null>(null);

  const fetchDeductions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/driver-pay/drivers/${driverId}/deductions`);
      if (res.ok) {
        const data = await res.json();
        setDeductions(data.deductions ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [driverId]);

  useEffect(() => {
    void fetchDeductions();
  }, [fetchDeductions]);

  async function handleTogglePause(deduction: SerializedDeduction) {
    setPausingId(deduction.id);
    try {
      const res = await fetch(
        `/api/driver-pay/drivers/${driverId}/deductions/${deduction.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paused: !deduction.paused }),
        },
      );
      if (res.ok) {
        await fetchDeductions();
      }
    } finally {
      setPausingId(null);
    }
  }

  function getProgressPercent(deduction: SerializedDeduction): number {
    if (!deduction.totalAmount) return 0;
    const collected = new Decimal(deduction.amountCollected);
    const total = new Decimal(deduction.totalAmount);
    if (total.isZero()) return 0;
    return Math.min(100, collected.div(total).mul(100).toNumber());
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-muted rounded w-1/3" />
          <div className="h-4 bg-muted rounded w-1/2" />
          <div className="h-4 bg-muted rounded w-2/5" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      {canEdit && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setAddOpen(true)}>
            Add Deduction
          </Button>
        </div>
      )}

      {/* Deduction list */}
      {deductions.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center space-y-3">
          <p className="text-sm text-muted-foreground">No active deductions.</p>
          {canEdit && (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              Add Deduction
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {deductions.map((deduction) => (
            <div
              key={deduction.id}
              className={`rounded-lg border border-border bg-card p-4 space-y-3 ${
                deduction.paused ? 'opacity-50' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">
                      {DEDUCTION_TYPE_LABELS[deduction.deductionType] ?? deduction.deductionType}
                    </Badge>
                    <Badge variant="secondary">
                      {SCHEDULE_LABELS[deduction.schedule] ?? deduction.schedule}
                    </Badge>
                    {deduction.paused && (
                      <Badge variant="secondary" className="bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                        Paused
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm font-medium">
                    {fmt.format(Number(deduction.amountPerPeriod))}/period
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Starts {formatDateOnlyShort(deduction.startsOn)}
                    {deduction.endsOn && (
                      <> &mdash; Ends {formatDateOnlyShort(deduction.endsOn)}</>
                    )}
                  </p>
                </div>

                {canEdit && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pausingId === deduction.id}
                    onClick={() => handleTogglePause(deduction)}
                    className="shrink-0"
                  >
                    {pausingId === deduction.id
                      ? '...'
                      : deduction.paused
                      ? 'Unpause'
                      : 'Pause'}
                  </Button>
                )}
              </div>

              {/* FIXED_INSTALLMENTS progress bar */}
              {deduction.schedule === 'FIXED_INSTALLMENTS' && deduction.totalAmount && (
                <div className="space-y-1">
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: `${getProgressPercent(deduction)}%` }}
                    />
                  </div>
                  <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                    Collected {fmt.format(Number(deduction.amountCollected))} of{' '}
                    {fmt.format(Number(deduction.totalAmount))}
                  </p>
                </div>
              )}

              {deduction.notes && (
                <p className="text-xs text-muted-foreground">{deduction.notes}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add deduction sheet */}
      <AddDeductionForm
        open={addOpen}
        driverId={driverId}
        onClose={() => setAddOpen(false)}
        onSaved={fetchDeductions}
      />
    </div>
  );
}
