'use client';

import React, { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InstallmentPreview } from './installment-preview';

const BONUS_TYPES = [
  { value: 'SIGN_ON', label: 'Sign-On' },
  { value: 'RETENTION', label: 'Retention' },
  { value: 'SAFETY', label: 'Safety' },
  { value: 'FUEL_EFFICIENCY', label: 'Fuel Efficiency' },
  { value: 'REFERRAL', label: 'Referral' },
  { value: 'PERFORMANCE', label: 'Performance' },
  { value: 'OTHER', label: 'Other' },
];

const INTERVAL_OPTIONS = [
  { value: '7', label: 'Weekly (7 days)' },
  { value: '14', label: 'Bi-weekly (14 days)' },
  { value: '30', label: 'Monthly (30 days)' },
];

interface TenantDriver {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  driverId: string;
  onClose: () => void;
  onSaved: () => void;
  tenantDrivers: TenantDriver[];
}

export function AddBonusForm({ open, driverId, onClose, onSaved, tenantDrivers }: Props) {
  const [bonusType, setBonusType] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [triggerDate, setTriggerDate] = useState('');
  const [scheduledPayDate, setScheduledPayDate] = useState('');
  const [totalInstallments, setTotalInstallments] = useState(1);
  const [intervalDays, setIntervalDays] = useState(14);
  const [referredDriverId, setReferredDriverId] = useState('');
  const [isTaxable, setIsTaxable] = useState(true);
  const [visibleToDriver, setVisibleToDriver] = useState(true);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showInstallmentPreview =
    totalInstallments >= 2 &&
    amount.match(/^\d+(\.\d{1,2})?$/) &&
    (scheduledPayDate || triggerDate);

  const showIntervalDays = totalInstallments >= 2;
  const showReferredDriver = bonusType === 'REFERRAL';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const body: Record<string, unknown> = {
      bonusType,
      amount,
      description,
      triggerDate,
      isTaxable,
      visibleToDriver,
    };
    if (scheduledPayDate) body.scheduledPayDate = scheduledPayDate;
    if (notes) body.notes = notes;
    if (totalInstallments >= 2) {
      body.totalInstallments = totalInstallments;
      body.intervalDays = intervalDays;
    }
    if (bonusType === 'REFERRAL' && referredDriverId) {
      body.referredDriverId = referredDriverId;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/driver-pay/drivers/${driverId}/bonuses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? 'Failed to create bonus.');
        return;
      }

      setSuccess(true);
      onSaved();
      setTimeout(() => {
        setSuccess(false);
        onClose();
        resetForm();
      }, 2000);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetForm() {
    setBonusType('');
    setAmount('');
    setDescription('');
    setTriggerDate('');
    setScheduledPayDate('');
    setTotalInstallments(1);
    setIntervalDays(14);
    setReferredDriverId('');
    setIsTaxable(true);
    setVisibleToDriver(true);
    setNotes('');
    setError(null);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add Bonus</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {/* Bonus type */}
          <div className="space-y-1.5">
            <Label htmlFor="bonusType">Bonus Type</Label>
            <Select value={bonusType} onValueChange={setBonusType} required>
              <SelectTrigger id="bonusType">
                <SelectValue placeholder="Select type..." />
              </SelectTrigger>
              <SelectContent>
                {BONUS_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Referred driver (REFERRAL only) */}
          {showReferredDriver && (
            <div className="space-y-1.5">
              <Label htmlFor="referredDriverId">Referred Driver</Label>
              <Select value={referredDriverId} onValueChange={setReferredDriverId}>
                <SelectTrigger id="referredDriverId">
                  <SelectValue placeholder="Select driver..." />
                </SelectTrigger>
                <SelectContent>
                  {tenantDrivers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Amount */}
          <div className="space-y-1.5">
            <Label htmlFor="amount">Amount ($)</Label>
            <Input
              id="amount"
              type="text"
              inputMode="decimal"
              pattern="^\d+(\.\d{0,2})?$"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              maxLength={255}
              placeholder="Brief description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          {/* Trigger date */}
          <div className="space-y-1.5">
            <Label htmlFor="triggerDate">Trigger Date</Label>
            <Input
              id="triggerDate"
              type="date"
              value={triggerDate}
              onChange={(e) => setTriggerDate(e.target.value)}
              required
            />
          </div>

          {/* Scheduled pay date */}
          <div className="space-y-1.5">
            <Label htmlFor="scheduledPayDate">Scheduled Pay Date (optional)</Label>
            <Input
              id="scheduledPayDate"
              type="date"
              value={scheduledPayDate}
              onChange={(e) => setScheduledPayDate(e.target.value)}
            />
          </div>

          {/* Total installments */}
          <div className="space-y-1.5">
            <Label htmlFor="totalInstallments">Total Installments</Label>
            <Input
              id="totalInstallments"
              type="number"
              min={1}
              value={totalInstallments}
              onChange={(e) => setTotalInstallments(Math.max(1, parseInt(e.target.value, 10) || 1))}
            />
            <p className="text-xs text-muted-foreground">Set to 1 for a single lump-sum payment.</p>
          </div>

          {/* Interval days (multi-installment only) */}
          {showIntervalDays && (
            <div className="space-y-1.5">
              <Label htmlFor="intervalDays">Payment Interval</Label>
              <Select
                value={String(intervalDays)}
                onValueChange={(v) => setIntervalDays(Number(v))}
              >
                <SelectTrigger id="intervalDays">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERVAL_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Installment preview */}
          {showInstallmentPreview && (
            <InstallmentPreview
              totalAmount={amount}
              count={totalInstallments}
              startDate={scheduledPayDate || triggerDate}
              intervalDays={intervalDays}
            />
          )}

          {/* Taxable */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isTaxable"
              checked={isTaxable}
              onChange={(e) => setIsTaxable(e.target.checked)}
              className="h-4 w-4 rounded border border-border"
            />
            <Label htmlFor="isTaxable" className="cursor-pointer">Taxable</Label>
          </div>

          {/* Visible to driver */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="visibleToDriver"
              checked={visibleToDriver}
              onChange={(e) => setVisibleToDriver(e.target.checked)}
              className="h-4 w-4 rounded border border-border"
            />
            <Label htmlFor="visibleToDriver" className="cursor-pointer">Visible to driver</Label>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Internal notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* Submit */}
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleClose} className="flex-1">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || success}
              className="flex-1"
            >
              {success ? 'Saved!' : isSubmitting ? 'Saving...' : 'Save Bonus'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
