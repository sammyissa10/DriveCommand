'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { WizardFormState } from '@/app/(owner)/carrier/fleet/drivers/[id]/compensation/wizard/page';

interface WizardStep3Props {
  state: WizardFormState;
  setState: React.Dispatch<React.SetStateAction<WizardFormState>>;
  goNext: () => void;
  goBack: () => void;
}

export function WizardStep3AddOns({ state, setState, goNext, goBack }: WizardStep3Props) {
  function handleReview() {
    setState((prev) => ({ ...prev, currentStep: 'confirm' }));
  }

  // Validation for required overtime fields
  const otError =
    state.overtimeEligible &&
    (!state.overtimeThresholdHours ||
      !state.overtimeMultiplier ||
      isNaN(Number(state.overtimeThresholdHours)) ||
      isNaN(Number(state.overtimeMultiplier)));

  const perDiemError =
    state.perDiemEnabled &&
    (!state.perDiemRate || isNaN(Number(state.perDiemRate)));

  const fscError =
    state.fuelSurchargeEnabled &&
    (!state.fuelSurchargeRate || isNaN(Number(state.fuelSurchargeRate)));

  const canReview = !otError && !perDiemError && !fscError;

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-card-foreground mb-1">Add-ons</h2>
        <p className="text-sm text-muted-foreground">
          Configure optional pay additions. All are off by default.
        </p>
      </div>

      {/* Overtime */}
      <div className="space-y-3 rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-card-foreground">Overtime</p>
            <p className="text-xs text-muted-foreground">
              Pay a multiplier for hours worked beyond a weekly threshold
            </p>
          </div>
          <Switch
            checked={state.overtimeEligible}
            onCheckedChange={(checked) =>
              setState((prev) => ({ ...prev, overtimeEligible: checked }))
            }
          />
        </div>

        {state.overtimeEligible && (
          <div className="space-y-3 pt-2 border-t border-border">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="otThreshold">Weekly threshold (hours)</Label>
                <Input
                  id="otThreshold"
                  type="number"
                  min="0"
                  step="0.5"
                  value={state.overtimeThresholdHours}
                  onChange={(e) =>
                    setState((prev) => ({ ...prev, overtimeThresholdHours: e.target.value }))
                  }
                  placeholder="40"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="otMultiplier">Multiplier</Label>
                <Input
                  id="otMultiplier"
                  type="number"
                  min="1"
                  step="0.1"
                  value={state.overtimeMultiplier}
                  onChange={(e) =>
                    setState((prev) => ({ ...prev, overtimeMultiplier: e.target.value }))
                  }
                  placeholder="1.5"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dailyOt">
                Daily overtime threshold (hours){' '}
                <span className="text-xs font-normal text-muted-foreground">optional</span>
              </Label>
              <Input
                id="dailyOt"
                type="number"
                min="0"
                step="0.5"
                value={state.dailyOvertimeThreshold}
                onChange={(e) =>
                  setState((prev) => ({ ...prev, dailyOvertimeThreshold: e.target.value }))
                }
                placeholder="e.g. 8"
              />
            </div>
            {otError && (
              <p className="text-xs text-red-600 dark:text-red-400">
                Overtime threshold and multiplier are required when overtime is enabled.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Per Diem */}
      <div className="space-y-3 rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-card-foreground">Per Diem</p>
            <p className="text-xs text-muted-foreground">
              Daily allowance for meals and lodging
            </p>
          </div>
          <Switch
            checked={state.perDiemEnabled}
            onCheckedChange={(checked) =>
              setState((prev) => ({ ...prev, perDiemEnabled: checked }))
            }
          />
        </div>

        {state.perDiemEnabled && (
          <div className="pt-2 border-t border-border">
            <div className="space-y-1.5">
              <Label htmlFor="perDiemRate">Per diem rate ($ / day)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                  $
                </span>
                <Input
                  id="perDiemRate"
                  type="number"
                  min="0"
                  step="0.01"
                  value={state.perDiemRate}
                  onChange={(e) =>
                    setState((prev) => ({ ...prev, perDiemRate: e.target.value }))
                  }
                  placeholder="75.00"
                  className="pl-7"
                />
              </div>
              {perDiemError && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  Per diem rate is required when per diem is enabled.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Fuel Surcharge */}
      <div className="space-y-3 rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-card-foreground">Fuel Surcharge</p>
            <p className="text-xs text-muted-foreground">
              Passthrough fuel surcharge rate ($/mile)
            </p>
          </div>
          <Switch
            checked={state.fuelSurchargeEnabled}
            onCheckedChange={(checked) =>
              setState((prev) => ({ ...prev, fuelSurchargeEnabled: checked }))
            }
          />
        </div>

        {state.fuelSurchargeEnabled && (
          <div className="pt-2 border-t border-border">
            <div className="space-y-1.5">
              <Label htmlFor="fscRate">Fuel surcharge rate ($ / mile)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                  $
                </span>
                <Input
                  id="fscRate"
                  type="number"
                  min="0"
                  step="0.001"
                  value={state.fuelSurchargeRate}
                  onChange={(e) =>
                    setState((prev) => ({ ...prev, fuelSurchargeRate: e.target.value }))
                  }
                  placeholder="0.05"
                  className="pl-7"
                />
              </div>
              {fscError && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  Fuel surcharge rate is required when fuel surcharge is enabled.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Weekly earning goal (optional) */}
      <div className="space-y-1.5">
        <Label htmlFor="weeklyGoal">
          Weekly earning goal{' '}
          <span className="text-xs font-normal text-muted-foreground">optional</span>
        </Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
            $
          </span>
          <Input
            id="weeklyGoal"
            type="number"
            min="0"
            step="1"
            value={state.weeklyEarningGoal}
            onChange={(e) =>
              setState((prev) => ({ ...prev, weeklyEarningGoal: e.target.value }))
            }
            placeholder="2000"
            className="pl-7"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Used as a target for payroll dashboards — does not affect calculated pay.
        </p>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="notes">
          Notes{' '}
          <span className="text-xs font-normal text-muted-foreground">optional</span>
        </Label>
        <textarea
          id="notes"
          rows={3}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          value={state.notes}
          onChange={(e) => setState((prev) => ({ ...prev, notes: e.target.value }))}
          placeholder="Any additional notes about this compensation agreement..."
        />
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <Button type="button" variant="outline" onClick={goBack}>
          Back
        </Button>
        <Button type="button" disabled={!canReview} onClick={handleReview}>
          Review
        </Button>
      </div>
    </div>
  );
}
