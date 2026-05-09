'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { createTemplate } from '@/app/(owner)/actions/driver-compensation-templates';
import { WizardStep1PayModel } from '@/components/driver-compensation/wizard/wizard-step-1-pay-model';
import { WizardStep2RateAndUnit } from '@/components/driver-compensation/wizard/wizard-step-2-rate-and-unit';
import { WizardStep3AddOns } from '@/components/driver-compensation/wizard/wizard-step-3-add-ons';
import { LivePreviewPanel } from '@/components/driver-compensation/wizard/live-preview-panel';
import { ConfirmationCard } from '@/components/driver-compensation/wizard/confirmation-card';

export type WizardFormState = {
  currentStep: 1 | 2 | 3 | 'confirm';
  // Step 1
  payType: 'CPM' | 'HOURLY' | 'FLAT_PER_LOAD' | 'PERCENTAGE' | 'DAILY' | 'SALARY';
  employmentType: 'W2_EMPLOYEE' | 'OWNER_OPERATOR_1099' | 'LEASE_OPERATOR';
  // Step 2
  baseRate: string;
  rateUnit: 'PER_MILE' | 'PER_HOUR' | 'PER_LOAD' | 'PERCENTAGE' | 'PER_DAY' | 'ANNUAL';
  currency: string;
  effectiveFrom: string;
  loadedMilesOnly: boolean;
  // Step 3
  overtimeEligible: boolean;
  overtimeThresholdHours: string;
  overtimeMultiplier: string;
  dailyOvertimeThreshold: string;
  perDiemEnabled: boolean;
  perDiemRate: string;
  fuelSurchargeEnabled: boolean;
  fuelSurchargeRate: string;
  weeklyEarningGoal: string;
  notes: string;
};

function getTodayISO(): string {
  return new Date().toISOString().split('T')[0];
}

const initialState: WizardFormState = {
  currentStep: 1,
  payType: 'CPM',
  employmentType: 'W2_EMPLOYEE',
  baseRate: '',
  rateUnit: 'PER_MILE',
  currency: 'USD',
  effectiveFrom: getTodayISO(),
  loadedMilesOnly: false,
  overtimeEligible: false,
  overtimeThresholdHours: '40',
  overtimeMultiplier: '1.5',
  dailyOvertimeThreshold: '',
  perDiemEnabled: false,
  perDiemRate: '',
  fuelSurchargeEnabled: false,
  fuelSurchargeRate: '',
  weeklyEarningGoal: '',
  notes: '',
};

export default function CompensationWizardPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const driverId = params.id;

  const [state, setState] = useState<WizardFormState>(initialState);
  const [saving, setSaving] = useState(false);

  function goNext() {
    setState((prev) => ({
      ...prev,
      currentStep:
        prev.currentStep === 1 ? 2 : prev.currentStep === 2 ? 3 : 'confirm',
    }));
  }

  function goBack() {
    setState((prev) => ({
      ...prev,
      currentStep:
        prev.currentStep === 'confirm' ? 3 : prev.currentStep === 3 ? 2 : 1,
    }));
  }

  function goToStep(step: 1 | 2 | 3) {
    setState((prev) => ({ ...prev, currentStep: step }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const result = await createTemplate(driverId, {
        employmentType: state.employmentType,
        payType: state.payType,
        baseRate: state.baseRate,
        rateUnit: state.rateUnit,
        currency: state.currency,
        effectiveFrom: state.effectiveFrom,
        loadedMilesOnly: state.loadedMilesOnly,
        overtimeEligible: state.overtimeEligible,
        overtimeThresholdHours: state.overtimeEligible ? state.overtimeThresholdHours : null,
        overtimeMultiplier: state.overtimeEligible ? state.overtimeMultiplier : null,
        dailyOvertimeThreshold: state.dailyOvertimeThreshold || null,
        perDiemEnabled: state.perDiemEnabled,
        perDiemRate: state.perDiemEnabled ? state.perDiemRate : null,
        fuelSurchargeRate: state.fuelSurchargeEnabled ? state.fuelSurchargeRate : null,
        weeklyEarningGoal: state.weeklyEarningGoal || null,
        notes: state.notes || null,
      });

      if (result.data) {
        toast.success('Template saved. Active for new loads.');
        router.push(`/carrier/fleet/drivers/${driverId}/compensation`);
      } else {
        toast.error(typeof result.error === 'string' ? result.error : 'Failed to save template.');
      }
    } catch {
      toast.error('Failed to save template.');
    } finally {
      setSaving(false);
    }
  }

  const showPreview = state.currentStep === 2 || state.currentStep === 3 || state.currentStep === 'confirm';

  const stepLabels: Record<1 | 2 | 3 | 'confirm', string> = {
    1: 'Pay Model',
    2: 'Rate & Unit',
    3: 'Add-ons',
    confirm: 'Review',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href={`/carrier/fleet/drivers/${driverId}/compensation`}
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back to Compensation
        </Link>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Create Compensation Template
          </h1>
          {state.currentStep !== 'confirm' && (
            <span className="text-sm text-muted-foreground">
              Step {state.currentStep} of 3 — {stepLabels[state.currentStep]}
            </span>
          )}
        </div>

        {/* Progress indicator */}
        <div className="mt-4 flex gap-2">
          {([1, 2, 3] as const).map((step) => {
            const isComplete =
              typeof state.currentStep === 'number'
                ? state.currentStep > step
                : true;
            const isActive = state.currentStep === step;
            return (
              <div
                key={step}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  isComplete
                    ? 'bg-primary'
                    : isActive
                    ? 'bg-primary/50'
                    : 'bg-border'
                }`}
              />
            );
          })}
        </div>
      </div>

      {/* Content */}
      {showPreview ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Step content — spans 2 columns */}
          <div className="lg:col-span-2">
            {state.currentStep === 2 && (
              <WizardStep2RateAndUnit state={state} setState={setState} goNext={goNext} goBack={goBack} />
            )}
            {state.currentStep === 3 && (
              <WizardStep3AddOns state={state} setState={setState} goNext={goNext} goBack={goBack} />
            )}
            {state.currentStep === 'confirm' && (
              <ConfirmationCard state={state} goToStep={goToStep} onSave={handleSave} saving={saving} />
            )}
          </div>

          {/* Live preview — col 3 */}
          <div className="lg:col-span-1">
            <LivePreviewPanel state={state} />
          </div>
        </div>
      ) : (
        <WizardStep1PayModel state={state} setState={setState} goNext={goNext} />
      )}
    </div>
  );
}
