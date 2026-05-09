'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Truck, Clock, Package, Percent, Calendar, DollarSign } from 'lucide-react';
import { STARTER_TEMPLATES, type StarterTemplate } from './starter-templates';
import { getCopyableTemplates, type CopyableTemplate } from '@/app/(owner)/actions/driver-compensation-templates';
import type { WizardFormState } from '@/app/(owner)/carrier/fleet/drivers/[id]/compensation/wizard/page';

type PayModel = {
  value: WizardFormState['payType'];
  label: string;
  description: string;
  icon: React.ReactNode;
  defaultRateUnit: WizardFormState['rateUnit'];
};

const PAY_MODELS: PayModel[] = [
  {
    value: 'CPM',
    label: 'Cost Per Mile',
    description: 'Driver earns a fixed amount per mile driven',
    icon: <Truck className="h-5 w-5" />,
    defaultRateUnit: 'PER_MILE',
  },
  {
    value: 'HOURLY',
    label: 'Hourly',
    description: 'Driver earns an hourly rate for time worked',
    icon: <Clock className="h-5 w-5" />,
    defaultRateUnit: 'PER_HOUR',
  },
  {
    value: 'FLAT_PER_LOAD',
    label: 'Flat Per Load',
    description: 'Fixed amount paid per completed load',
    icon: <Package className="h-5 w-5" />,
    defaultRateUnit: 'PER_LOAD',
  },
  {
    value: 'PERCENTAGE',
    label: 'Percentage',
    description: 'Percentage of gross load revenue',
    icon: <Percent className="h-5 w-5" />,
    defaultRateUnit: 'PERCENTAGE',
  },
  {
    value: 'DAILY',
    label: 'Daily',
    description: 'Fixed rate per day worked',
    icon: <Calendar className="h-5 w-5" />,
    defaultRateUnit: 'PER_DAY',
  },
  {
    value: 'SALARY',
    label: 'Salary',
    description: 'Annual salary paid on a fixed schedule',
    icon: <DollarSign className="h-5 w-5" />,
    defaultRateUnit: 'ANNUAL',
  },
];

interface WizardStep1Props {
  state: WizardFormState;
  setState: React.Dispatch<React.SetStateAction<WizardFormState>>;
  goNext: () => void;
}

export function WizardStep1PayModel({ state, setState, goNext }: WizardStep1Props) {
  const [starterOpen, setStarterOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyableTemplates, setCopyableTemplates] = useState<CopyableTemplate[]>([]);
  const [loadingCopyable, setLoadingCopyable] = useState(false);
  const [selectedCopyId, setSelectedCopyId] = useState('');

  useEffect(() => {
    if (copyOpen && copyableTemplates.length === 0) {
      setLoadingCopyable(true);
      getCopyableTemplates()
        .then((res) => {
          if (res.data) {
            setCopyableTemplates(res.data.templates);
          }
        })
        .finally(() => setLoadingCopyable(false));
    }
  }, [copyOpen]);

  function applyStarterTemplate(tmpl: StarterTemplate) {
    setState((prev) => ({
      ...prev,
      payType: tmpl.payType,
      rateUnit: tmpl.rateUnit,
      baseRate: tmpl.baseRate,
      overtimeEligible: tmpl.overtimeEligible,
      overtimeThresholdHours: tmpl.overtimeThresholdHours ?? '',
      overtimeMultiplier: tmpl.overtimeMultiplier ?? '',
      currentStep: 3, // skip step 2 and go to add-ons
    }));
  }

  function applyCopyTemplate(templateId: string) {
    const tmpl = copyableTemplates.find((t) => t.id === templateId);
    if (!tmpl) return;
    setState((prev) => ({
      ...prev,
      payType: tmpl.payType as WizardFormState['payType'],
      rateUnit: tmpl.rateUnit as WizardFormState['rateUnit'],
      baseRate: tmpl.baseRate,
      currentStep: 3, // skip step 2 and go to add-ons
    }));
  }

  function selectPayModel(model: PayModel) {
    setState((prev) => ({
      ...prev,
      payType: model.value,
      rateUnit: model.defaultRateUnit,
    }));
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-card-foreground mb-1">Choose a pay model</h2>
        <p className="text-sm text-muted-foreground">
          Select how this driver is compensated. You can change this later.
        </p>
      </div>

      {/* Pay model grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {PAY_MODELS.map((model) => {
          const isSelected = state.payType === model.value;
          return (
            <button
              key={model.value}
              type="button"
              onClick={() => selectPayModel(model)}
              className={`text-left rounded-xl border p-4 transition-all ${
                isSelected
                  ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary'
                  : 'border-border bg-card hover:border-primary/50 hover:bg-accent'
              }`}
            >
              <div className={`mb-2 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`}>
                {model.icon}
              </div>
              <p className="font-semibold text-sm text-card-foreground">{model.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{model.description}</p>
            </button>
          );
        })}
      </div>

      {/* Starter templates */}
      <Collapsible open={starterOpen} onOpenChange={setStarterOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-card-foreground hover:bg-accent transition-colors"
          >
            Use a starter template
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${starterOpen ? 'rotate-180' : ''}`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 space-y-2">
            {STARTER_TEMPLATES.map((tmpl) => (
              <button
                key={tmpl.id}
                type="button"
                onClick={() => applyStarterTemplate(tmpl)}
                className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left hover:bg-accent transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-card-foreground">{tmpl.label}</p>
                  <p className="text-xs text-muted-foreground">{tmpl.description}</p>
                </div>
                <span className="ml-4 shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  Apply
                </span>
              </button>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Copy from another driver */}
      <Collapsible open={copyOpen} onOpenChange={setCopyOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-card-foreground hover:bg-accent transition-colors"
          >
            Copy from another driver
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${copyOpen ? 'rotate-180' : ''}`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 rounded-lg border border-border bg-card p-4">
            {loadingCopyable ? (
              <p className="text-sm text-muted-foreground">Loading drivers...</p>
            ) : copyableTemplates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active templates found for other drivers.</p>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium text-card-foreground">
                  Select a driver to copy from
                </label>
                <select
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  value={selectedCopyId}
                  onChange={(e) => {
                    setSelectedCopyId(e.target.value);
                  }}
                >
                  <option value="">Choose a driver...</option>
                  {copyableTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.driverName} — {t.payType} @ {t.baseRate} / {t.rateUnit}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  size="sm"
                  disabled={!selectedCopyId}
                  onClick={() => applyCopyTemplate(selectedCopyId)}
                >
                  Apply template
                </Button>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Continue button */}
      <div className="flex justify-end">
        <Button type="button" disabled={!state.payType} onClick={goNext}>
          Continue
        </Button>
      </div>
    </div>
  );
}
