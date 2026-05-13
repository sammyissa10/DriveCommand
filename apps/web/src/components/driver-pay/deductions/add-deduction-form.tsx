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

const DEDUCTION_TYPES = [
  { value: 'ADVANCE', label: 'Advance' },
  { value: 'ESCROW', label: 'Escrow' },
  { value: 'GARNISHMENT', label: 'Garnishment' },
  { value: 'CHILD_SUPPORT', label: 'Child Support' },
  { value: 'EQUIPMENT_LEASE', label: 'Equipment Lease' },
  { value: 'INSURANCE', label: 'Insurance' },
  { value: 'OTHER', label: 'Other' },
];

const SCHEDULE_OPTIONS = [
  { value: 'ONE_TIME', label: 'One-Time' },
  { value: 'EVERY_SETTLEMENT', label: 'Every Settlement' },
  { value: 'FIXED_INSTALLMENTS', label: 'Fixed Installments' },
];

const GARNISHMENT_TYPES = new Set(['GARNISHMENT', 'CHILD_SUPPORT']);

interface Props {
  open: boolean;
  driverId: string;
  onClose: () => void;
  onSaved: () => void;
}

export function AddDeductionForm({ open, driverId, onClose, onSaved }: Props) {
  const [deductionType, setDeductionType] = useState('');
  const [schedule, setSchedule] = useState('');
  const [amountPerPeriod, setAmountPerPeriod] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [maxPercentageOfNet, setMaxPercentageOfNet] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [visibleToDriver, setVisibleToDriver] = useState(true);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [maxPctError, setMaxPctError] = useState<string | null>(null);

  const showTotalAmount = schedule === 'FIXED_INSTALLMENTS';
  const showMaxPercentage = GARNISHMENT_TYPES.has(deductionType);

  function handleMaxPctChange(value: string) {
    setMaxPercentageOfNet(value);
    if (value && Number(value) > 50) {
      setMaxPctError('Cannot exceed 50% (federal garnishment cap).');
    } else {
      setMaxPctError(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Client-side 50% cap check
    if (maxPercentageOfNet && Number(maxPercentageOfNet) > 50) {
      setError('maxPercentageOfNet cannot exceed 50% (federal garnishment cap).');
      return;
    }

    const body: Record<string, unknown> = {
      deductionType,
      schedule,
      amountPerPeriod,
      startsOn,
      visibleToDriver,
    };
    if (totalAmount) body.totalAmount = totalAmount;
    if (maxPercentageOfNet) body.maxPercentageOfNet = maxPercentageOfNet;
    if (endsOn) body.endsOn = endsOn;
    if (notes) body.notes = notes;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/driver-pay/drivers/${driverId}/deductions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? 'Failed to create deduction.');
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
    setDeductionType('');
    setSchedule('');
    setAmountPerPeriod('');
    setTotalAmount('');
    setMaxPercentageOfNet('');
    setStartsOn('');
    setEndsOn('');
    setVisibleToDriver(true);
    setNotes('');
    setError(null);
    setMaxPctError(null);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add Deduction</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {/* Deduction type */}
          <div className="space-y-1.5">
            <Label htmlFor="deductionType">Deduction Type</Label>
            <Select value={deductionType} onValueChange={setDeductionType} required>
              <SelectTrigger id="deductionType">
                <SelectValue placeholder="Select type..." />
              </SelectTrigger>
              <SelectContent>
                {DEDUCTION_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Schedule */}
          <div className="space-y-1.5">
            <Label htmlFor="schedule">Schedule</Label>
            <Select value={schedule} onValueChange={setSchedule} required>
              <SelectTrigger id="schedule">
                <SelectValue placeholder="Select schedule..." />
              </SelectTrigger>
              <SelectContent>
                {SCHEDULE_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Amount per period */}
          <div className="space-y-1.5">
            <Label htmlFor="amountPerPeriod">Amount Per Period ($)</Label>
            <Input
              id="amountPerPeriod"
              type="text"
              inputMode="decimal"
              pattern="^\d+(\.\d{0,2})?$"
              placeholder="0.00"
              value={amountPerPeriod}
              onChange={(e) => setAmountPerPeriod(e.target.value)}
              required
            />
          </div>

          {/* Total amount (FIXED_INSTALLMENTS only) */}
          {showTotalAmount && (
            <div className="space-y-1.5">
              <Label htmlFor="totalAmount">Total Amount ($)</Label>
              <Input
                id="totalAmount"
                type="text"
                inputMode="decimal"
                pattern="^\d+(\.\d{0,2})?$"
                placeholder="0.00"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                required
              />
            </div>
          )}

          {/* Max % of net (garnishments only) */}
          {showMaxPercentage && (
            <div className="space-y-1.5">
              <Label htmlFor="maxPercentageOfNet">Max % of Net Pay (0–50)</Label>
              <Input
                id="maxPercentageOfNet"
                type="number"
                min={0}
                max={50}
                step="0.01"
                placeholder="25"
                value={maxPercentageOfNet}
                onChange={(e) => handleMaxPctChange(e.target.value)}
              />
              {maxPctError && (
                <p className="text-xs text-destructive">{maxPctError}</p>
              )}
            </div>
          )}

          {/* Starts on */}
          <div className="space-y-1.5">
            <Label htmlFor="startsOn">Starts On</Label>
            <Input
              id="startsOn"
              type="date"
              value={startsOn}
              onChange={(e) => setStartsOn(e.target.value)}
              required
            />
          </div>

          {/* Ends on */}
          <div className="space-y-1.5">
            <Label htmlFor="endsOn">Ends On (optional)</Label>
            <Input
              id="endsOn"
              type="date"
              value={endsOn}
              onChange={(e) => setEndsOn(e.target.value)}
            />
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
              disabled={isSubmitting || success || !!maxPctError}
              className="flex-1"
            >
              {success ? 'Saved!' : isSubmitting ? 'Saving...' : 'Save Deduction'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
