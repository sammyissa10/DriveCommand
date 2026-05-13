'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { AddBonusForm } from './add-bonus-form';

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const BONUS_TYPE_LABELS: Record<string, string> = {
  SIGN_ON: 'Sign-On',
  RETENTION: 'Retention',
  SAFETY: 'Safety',
  FUEL_EFFICIENCY: 'Fuel Efficiency',
  REFERRAL: 'Referral',
  PERFORMANCE: 'Performance',
  OTHER: 'Other',
};

interface SerializedBonus {
  id: string;
  bonusType: string;
  amount: string;
  description: string;
  triggerDate: string;
  scheduledPayDate: string | null;
  paidAt: string | null;
  installmentNumber: number | null;
  totalInstallments: number | null;
  parentBonusId: string | null;
}

interface TenantDriver {
  id: string;
  name: string;
}

interface Props {
  driverId: string;
  driverName: string;
  canEdit: boolean;
  canMarkPaid: boolean;
  tenantDrivers: TenantDriver[];
}

export function BonusesTab({ driverId, driverName, canEdit, canMarkPaid, tenantDrivers }: Props) {
  const [bonuses, setBonuses] = useState<SerializedBonus[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [addOpen, setAddOpen] = useState(false);
  const [markPaidBonus, setMarkPaidBonus] = useState<SerializedBonus | null>(null);
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);
  const [markPaidSuccess, setMarkPaidSuccess] = useState<string | null>(null);

  const fetchBonuses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/driver-pay/drivers/${driverId}/bonuses`);
      if (res.ok) {
        const data = await res.json();
        setBonuses(data.bonuses ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [driverId]);

  useEffect(() => {
    void fetchBonuses();
  }, [fetchBonuses]);

  const filtered =
    typeFilter === 'ALL' ? bonuses : bonuses.filter((b) => b.bonusType === typeFilter);

  async function handleMarkPaid(bonus: SerializedBonus) {
    setIsMarkingPaid(true);
    try {
      const res = await fetch(
        `/api/driver-pay/drivers/${driverId}/bonuses/${bonus.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paidAt: new Date().toISOString() }),
        },
      );
      if (res.ok) {
        setMarkPaidSuccess(bonus.id);
        setMarkPaidBonus(null);
        await fetchBonuses();
        setTimeout(() => setMarkPaidSuccess(null), 2000);
      }
    } finally {
      setIsMarkingPaid(false);
    }
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
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Types</SelectItem>
            {Object.entries(BONUS_TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {canEdit && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            Add Bonus
          </Button>
        )}
      </div>

      {/* Bonus list */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            No bonuses recorded for this driver yet.
          </p>
          {canEdit && (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              Add Bonus
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((bonus) => {
            const isPaid = bonus.paidAt !== null;
            const isJustMarkedPaid = markPaidSuccess === bonus.id;
            return (
              <div
                key={bonus.id}
                className="rounded-lg border border-border bg-card p-4 flex items-start justify-between gap-4"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">
                      {BONUS_TYPE_LABELS[bonus.bonusType] ?? bonus.bonusType}
                    </Badge>
                    {isPaid ? (
                      <Badge className="bg-green-600 text-white">Paid</Badge>
                    ) : (
                      <Badge variant="secondary">Unpaid</Badge>
                    )}
                  </div>
                  <p className="text-sm font-medium text-foreground truncate">{bonus.description}</p>
                  <p className="text-sm font-semibold">{fmt.format(Number(bonus.amount))}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    <span>
                      Trigger:{' '}
                      {new Date(bonus.triggerDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                    {bonus.scheduledPayDate && (
                      <span>
                        Pay:{' '}
                        {new Date(bonus.scheduledPayDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    )}
                    {bonus.totalInstallments && bonus.installmentNumber && (
                      <span className="text-muted-foreground">
                        Installment {bonus.installmentNumber} of {bonus.totalInstallments}
                      </span>
                    )}
                  </div>
                </div>

                {!isPaid && canMarkPaid && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isMarkingPaid}
                    onClick={() => setMarkPaidBonus(bonus)}
                    className="shrink-0"
                  >
                    {isJustMarkedPaid ? 'Paid!' : 'Mark Paid'}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add bonus sheet */}
      <AddBonusForm
        open={addOpen}
        driverId={driverId}
        onClose={() => setAddOpen(false)}
        onSaved={fetchBonuses}
        tenantDrivers={tenantDrivers}
      />

      {/* Mark paid confirmation dialog */}
      <Dialog open={markPaidBonus !== null} onOpenChange={(o) => !o && setMarkPaidBonus(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Bonus as Paid?</DialogTitle>
          </DialogHeader>
          {markPaidBonus && (
            <p className="text-sm text-muted-foreground">
              Mark {fmt.format(Number(markPaidBonus.amount))} bonus as paid? This adds it to the
              next settlement run for {driverName}.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkPaidBonus(null)}>
              Cancel
            </Button>
            <Button
              disabled={isMarkingPaid}
              onClick={() => markPaidBonus && handleMarkPaid(markPaidBonus)}
            >
              {isMarkingPaid ? 'Marking...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
