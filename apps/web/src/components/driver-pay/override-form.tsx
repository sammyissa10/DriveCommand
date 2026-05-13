'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { updateAssignment } from '@/app/(owner)/actions/load-driver-assignments';
import type { SerializedAssignment } from '@/app/(owner)/actions/load-driver-assignments';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface OverrideFormProps {
  assignment: SerializedAssignment;
  onSaved: (updated: SerializedAssignment) => void;
  onCancel: () => void;
}

export function OverrideForm({ assignment, onSaved, onCancel }: OverrideFormProps) {
  const [payType, setPayType] = useState(assignment.payType);
  const [baseRate, setBaseRate] = useState(assignment.baseRate);
  const [rateUnit, setRateUnit] = useState(assignment.rateUnit);
  const [loadedMilesOnly, setLoadedMilesOnly] = useState(assignment.loadedMilesOnly);
  const [fuelSurchargeRate, setFuelSurchargeRate] = useState(assignment.fuelSurchargeRate ?? '');
  const [perDiemEnabled, setPerDiemEnabled] = useState(assignment.perDiemEnabled);
  const [perDiemRate, setPerDiemRate] = useState(assignment.perDiemRate ?? '');
  const [actualMiles, setActualMiles] = useState(assignment.actualMiles ?? '');
  const [mileageSource, setMileageSource] = useState(assignment.mileageSource ?? '');
  const [overrideReason, setOverrideReason] = useState(assignment.overrideReason ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Dirty tracking — compare each field against original assignment
  const isDirty =
    payType !== assignment.payType ||
    baseRate !== assignment.baseRate ||
    rateUnit !== assignment.rateUnit ||
    loadedMilesOnly !== assignment.loadedMilesOnly ||
    (fuelSurchargeRate || null) !== assignment.fuelSurchargeRate ||
    perDiemEnabled !== assignment.perDiemEnabled ||
    (perDiemRate || null) !== assignment.perDiemRate ||
    (actualMiles || null) !== assignment.actualMiles ||
    (mileageSource || null) !== assignment.mileageSource;

  async function handleSubmit() {
    setSubmitError(null);

    if (isDirty && overrideReason.trim().length < 10) {
      setSubmitError('Please provide at least 10 characters explaining the override reason.');
      return;
    }

    const hasActual = actualMiles.trim() !== '';
    const hasSource = mileageSource.trim() !== '';
    if (hasActual !== hasSource) {
      setSubmitError(
        'Both Actual miles and Mileage source must be set together (or both left blank).',
      );
      return;
    }

    setIsSaving(true);

    const result = await updateAssignment(assignment.id, {
      payType,
      baseRate,
      rateUnit,
      loadedMilesOnly,
      fuelSurchargeRate: fuelSurchargeRate || null,
      perDiemEnabled,
      perDiemRate: perDiemRate || null,
      estimatedMiles: null,
      actualMiles: actualMiles || null,
      mileageSource: (mileageSource || null) as
        | 'PCMILER'
        | 'GOOGLE'
        | 'ELD'
        | 'MANUAL'
        | 'RAND_MCNALLY'
        | null,
      overrideReason,
    });

    setIsSaving(false);

    if (result.error) {
      setSubmitError(result.error);
      return;
    }

    toast.success('Pay terms updated.');

    // Reconstruct updated assignment from form fields
    const updated: SerializedAssignment = {
      ...assignment,
      payType,
      baseRate,
      rateUnit,
      loadedMilesOnly,
      fuelSurchargeRate: fuelSurchargeRate || null,
      perDiemEnabled,
      perDiemRate: perDiemRate || null,
      actualMiles: actualMiles || null,
      mileageSource: mileageSource || null,
      overrideReason: overrideReason || null,
    };

    onSaved(updated);
  }

  return (
    <div className="space-y-4 pt-3 border-t">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Pay Type</Label>
          <Select value={payType} onValueChange={setPayType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CPM">CPM (per mile)</SelectItem>
              <SelectItem value="HOURLY">Hourly</SelectItem>
              <SelectItem value="FLAT_PER_LOAD">Flat per load</SelectItem>
              <SelectItem value="PERCENTAGE">Percentage</SelectItem>
              <SelectItem value="DAILY">Daily</SelectItem>
              <SelectItem value="SALARY">Salary</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>Base Rate</Label>
          <Input
            type="number"
            min="0"
            step="0.0001"
            value={baseRate}
            onChange={(e) => setBaseRate(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <Label>Rate Unit</Label>
          <Select value={rateUnit} onValueChange={setRateUnit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PER_MILE">Per mile</SelectItem>
              <SelectItem value="PER_HOUR">Per hour</SelectItem>
              <SelectItem value="PER_LOAD">Per load</SelectItem>
              <SelectItem value="PERCENTAGE">Percentage</SelectItem>
              <SelectItem value="PER_DAY">Per day</SelectItem>
              <SelectItem value="ANNUAL">Annual</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>Fuel Surcharge Rate</Label>
          <Input
            type="number"
            min="0"
            step="0.0001"
            placeholder="Optional"
            value={fuelSurchargeRate}
            onChange={(e) => setFuelSurchargeRate(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="actualMiles">Actual miles</Label>
          <div className="flex items-center gap-2">
            <Input
              id="actualMiles"
              type="number"
              inputMode="numeric"
              min="0"
              step="0.0001"
              placeholder={assignment.estimatedMiles ?? 'Optional'}
              value={actualMiles}
              onChange={(e) => setActualMiles(e.target.value)}
              className="w-[14ch]"
            />
            <span className="text-sm text-muted-foreground">mi</span>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="mileageSource">Mileage source</Label>
          <Select value={mileageSource} onValueChange={setMileageSource}>
            <SelectTrigger id="mileageSource">
              <SelectValue placeholder="Select source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PCMILER">PC*MILER</SelectItem>
              <SelectItem value="GOOGLE">Google Maps</SelectItem>
              <SelectItem value="ELD">ELD</SelectItem>
              <SelectItem value="MANUAL">Manual</SelectItem>
              <SelectItem value="RAND_MCNALLY">Rand McNally</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="loadedMilesOnly"
          checked={loadedMilesOnly}
          onCheckedChange={setLoadedMilesOnly}
        />
        <Label htmlFor="loadedMilesOnly">Loaded miles only</Label>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="perDiemEnabled"
          checked={perDiemEnabled}
          onCheckedChange={setPerDiemEnabled}
        />
        <Label htmlFor="perDiemEnabled">Per diem enabled</Label>
      </div>

      {perDiemEnabled && (
        <div className="space-y-1">
          <Label>Per Diem Rate</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="Per diem amount"
            value={perDiemRate}
            onChange={(e) => setPerDiemRate(e.target.value)}
          />
        </div>
      )}

      {isDirty && (
        <div className="space-y-1">
          <Label>
            Reason for override <span className="text-destructive">*</span>
          </Label>
          <Textarea
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            placeholder="Explain why this load needs different pay terms (min 10 characters)"
            className="mt-1"
            rows={3}
          />
        </div>
      )}

      {submitError && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
          {submitError}
        </p>
      )}

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save override'}
        </Button>
      </div>
    </div>
  );
}
