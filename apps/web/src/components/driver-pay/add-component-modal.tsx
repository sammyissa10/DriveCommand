'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  assignmentId: string;
  onAdded: (component: unknown) => void;
};

type CategoryKey = keyof typeof CATEGORY_TYPES;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_TYPES = {
  BONUS: [
    { value: 'LOAD_COMPLETION_BONUS', label: 'Load Completion Bonus' },
    { value: 'FUEL_EFFICIENCY_BONUS', label: 'Fuel Efficiency Bonus' },
    { value: 'HAZMAT_PREMIUM', label: 'Hazmat Premium' },
    { value: 'HOLIDAY_PREMIUM', label: 'Holiday Premium' },
  ],
  ACCESSORIAL: [
    { value: 'DETENTION', label: 'Detention' },
    { value: 'LAYOVER', label: 'Layover' },
    { value: 'TONU', label: 'TONU' },
    { value: 'STOP_OFF', label: 'Stop-Off Fee' },
    { value: 'TARP', label: 'Tarping' },
    { value: 'BREAKDOWN', label: 'Breakdown Pay' },
    { value: 'FUEL_SURCHARGE', label: 'Fuel Surcharge' },
    { value: 'OVERTIME', label: 'Overtime' },
  ],
  ALLOWANCE: [{ value: 'PER_DIEM', label: 'Per Diem' }],
  REIMBURSEMENT: [
    { value: 'LUMPER_REIMBURSEMENT', label: 'Lumper Reimbursement' },
    { value: 'SCALE_REIMBURSEMENT', label: 'Scale Ticket Reimbursement' },
    { value: 'FUEL_REIMBURSEMENT', label: 'Fuel Reimbursement' },
  ],
  DEDUCTION: [
    { value: 'ADVANCE_REPAYMENT', label: 'Advance Repayment' },
    { value: 'ESCROW_CONTRIBUTION', label: 'Escrow Contribution' },
    { value: 'FUEL_CARD_DEBT', label: 'Fuel Card Debt' },
    { value: 'CARGO_CLAIM', label: 'Cargo Claim' },
    { value: 'EQUIPMENT_DAMAGE', label: 'Equipment Damage' },
    { value: 'GARNISHMENT', label: 'Wage Garnishment' },
    { value: 'CHILD_SUPPORT', label: 'Child Support' },
  ],
  ADJUSTMENT: [
    { value: 'ADJUSTMENT_POSITIVE', label: 'Positive Adjustment' },
    { value: 'ADJUSTMENT_NEGATIVE', label: 'Negative Adjustment' },
  ],
} as const;

const CATEGORY_CARDS: {
  key: CategoryKey;
  label: string;
  description: string;
}[] = [
  { key: 'BONUS', label: 'Bonus', description: 'Performance bonuses' },
  { key: 'ACCESSORIAL', label: 'Accessorial', description: 'Stop fees, detention, TONU' },
  { key: 'ALLOWANCE', label: 'Allowance', description: 'Per diem, daily allowances' },
  { key: 'REIMBURSEMENT', label: 'Reimbursement', description: 'Lumper, fuel, scale tickets' },
  { key: 'DEDUCTION', label: 'Deduction', description: 'Advances, deductions, garnishments' },
  { key: 'ADJUSTMENT', label: 'Adjustment', description: 'Manual corrections' },
];

const UNIT_OPTIONS = [
  { value: 'MILES', label: 'Miles' },
  { value: 'HOURS', label: 'Hours' },
  { value: 'STOPS', label: 'Stops' },
  { value: 'DAYS', label: 'Days' },
  { value: 'FLAT', label: 'Flat' },
  { value: 'PERCENTAGE', label: 'Percentage' },
];

// ---------------------------------------------------------------------------
// Initial form state
// ---------------------------------------------------------------------------

function initialFormState() {
  return {
    componentType: '',
    description: '',
    quantity: '1',
    rate: '0.0000',
    multiplier: '1.00',
    unit: '',
    isTaxable: true,
    visibleToDriver: true,
    notes: '',
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AddComponentModal({ open, onOpenChange, assignmentId, onAdded }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey | null>(null);

  const [form, setForm] = useState(initialFormState());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleCategorySelect(cat: CategoryKey) {
    setSelectedCategory(cat);
    setStep(2);
    setForm(initialFormState());
    setError(null);
  }

  function handleBack() {
    setStep(1);
    setSelectedCategory(null);
    setForm(initialFormState());
    setError(null);
  }

  function handleClose(v: boolean) {
    onOpenChange(v);
    if (!v) {
      // Reset all state on close
      setStep(1);
      setSelectedCategory(null);
      setForm(initialFormState());
      setError(null);
      setIsSubmitting(false);
    }
  }

  async function handleSubmit() {
    if (!selectedCategory) return;

    setError(null);

    if (!form.componentType) {
      setError('Please select a component type.');
      return;
    }
    if (!form.description.trim()) {
      setError('Description is required.');
      return;
    }
    if (isNaN(parseFloat(form.rate))) {
      setError('Rate must be a valid number.');
      return;
    }
    if (!form.unit) {
      setError('Please select a unit.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/driver-pay/assignments/${assignmentId}/components`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          componentType: form.componentType,
          category: selectedCategory,
          description: form.description.trim(),
          quantity: form.quantity,
          unit: form.unit,
          rate: form.rate,
          multiplier: form.multiplier,
          isTaxable: form.isTaxable,
          visibleToDriver: form.visibleToDriver,
          notes: form.notes.trim() || null,
        }),
      });
      const result = await res.json() as { component?: unknown; error?: string };

      if (!res.ok) {
        setError(result.error ?? 'Failed to add component.');
        return;
      }

      toast.success('Pay component added.');
      onAdded(result.component);
      handleClose(false);
    } catch {
      setError('An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const previewGross =
    (
      Number(form.quantity) *
      Number(form.rate) *
      Number(form.multiplier)
    ).toFixed(2);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? 'Add Pay Component' : `Add ${selectedCategory ? selectedCategory.charAt(0) + selectedCategory.slice(1).toLowerCase() : ''}`}
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Category picker */}
        {step === 1 && (
          <div className="grid grid-cols-2 gap-3 py-2">
            {CATEGORY_CARDS.map((cat) => (
              <button
                key={cat.key}
                type="button"
                onClick={() => handleCategorySelect(cat.key)}
                className="border rounded-lg p-4 text-left hover:border-primary hover:bg-muted/50 transition-colors"
              >
                <div className="font-medium text-sm">{cat.label}</div>
                <div className="text-xs text-muted-foreground mt-1">{cat.description}</div>
              </button>
            ))}
          </div>
        )}

        {/* Step 2: Component form */}
        {step === 2 && selectedCategory && (
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
            <Button variant="ghost" size="sm" className="-ml-2" onClick={handleBack}>
              &larr; Back
            </Button>

            {/* Type */}
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={form.componentType}
                onValueChange={(v) => setForm((f) => ({ ...f, componentType: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_TYPES[selectedCategory].map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Brief description"
                maxLength={255}
              />
            </div>

            {/* Quantity and Rate */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Quantity</Label>
                <Input
                  value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                  className="text-right"
                  type="number"
                  min="0"
                  step="0.0001"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Rate ($)</Label>
                <Input
                  value={form.rate}
                  onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
                  className="text-right"
                  type="number"
                  min="0"
                  step="0.0001"
                  onBlur={() =>
                    setForm((f) => ({
                      ...f,
                      rate: parseFloat(f.rate || '0').toFixed(4),
                    }))
                  }
                />
              </div>
            </div>

            {/* Multiplier */}
            <div className="space-y-1.5">
              <Label>Multiplier</Label>
              <Input
                value={form.multiplier}
                onChange={(e) => setForm((f) => ({ ...f, multiplier: e.target.value }))}
                className="text-right"
                placeholder="1.00"
                type="number"
                min="0"
                step="0.01"
              />
            </div>

            {/* Unit */}
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Select
                value={form.unit}
                onValueChange={(v) => setForm((f) => ({ ...f, unit: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select unit..." />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_OPTIONS.map((u) => (
                    <SelectItem key={u.value} value={u.value}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Visible to driver toggle */}
            <div className="flex items-center gap-2">
              <Switch
                id="visible-to-driver"
                checked={form.visibleToDriver}
                onCheckedChange={(v) => setForm((f) => ({ ...f, visibleToDriver: v }))}
              />
              <Label htmlFor="visible-to-driver">Visible to driver</Label>
            </div>

            {/* Deduction info banner */}
            {selectedCategory === 'DEDUCTION' && (
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                Deduction amounts are entered as positive values and stored as negative.
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes"
                rows={2}
              />
            </div>

            {/* Live preview */}
            <div className="text-xs text-muted-foreground">
              Est. gross: <span className="font-medium text-foreground">${previewGross}</span>
            </div>

            {/* Error */}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        {step === 2 && (
          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => handleClose(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Adding...' : 'Add component'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
