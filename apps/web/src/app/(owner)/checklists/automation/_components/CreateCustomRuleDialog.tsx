'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Plain-English labels for each trigger event
const TRIGGER_OPTIONS = [
  { value: 'ON_DRIVER_CREATE', label: 'When a driver is added' },
  { value: 'ON_VEHICLE_CREATE', label: 'When a truck is added' },
  { value: 'ON_DISPATCH_CREATE', label: 'When a dispatch is created' },
  { value: 'ON_DISPATCH_DEPART', label: 'When a dispatch departs' },
  { value: 'ON_DISPATCH_DELIVER', label: 'When a dispatch is delivered' },
  { value: 'ON_PARTNER_CREATE', label: 'When a partner is added' },
] as const;

type TriggerEvent = (typeof TRIGGER_OPTIONS)[number]['value'];

// Known filterable fields per trigger event — each field is a dropdown, not free text
const EVENT_CONDITION_FIELDS: Record<
  TriggerEvent,
  Array<{ key: string; label: string; options: Array<{ value: string; label: string }> }>
> = {
  ON_DRIVER_CREATE: [
    {
      key: 'driverType',
      label: 'Driver type',
      options: [
        { value: 'CDL', label: 'CDL' },
        { value: 'NON_CDL', label: 'Non-CDL' },
        { value: 'OWNER_OP', label: 'Owner-Operator' },
      ],
    },
  ],
  ON_VEHICLE_CREATE: [],
  ON_DISPATCH_CREATE: [],
  ON_DISPATCH_DEPART: [],
  ON_DISPATCH_DELIVER: [],
  ON_PARTNER_CREATE: [],
};

interface CreateCustomRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CreateCustomRuleDialog({ open, onOpenChange, onCreated }: CreateCustomRuleDialogProps) {
  const trpc = useTRPC();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 state
  const [triggerEvent, setTriggerEvent] = useState<TriggerEvent | ''>('');

  // Step 2 state — one selected value per filterable field key, 'ANY' means no condition
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  // Step 3 state
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string>('');

  // Load playbooks
  const { data: playbooks = [] } = useQuery(
    trpc.workflows.playbook.list.queryOptions({ entityType: undefined }),
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createMutation = useMutation<any, Error, any>(
    trpc.workflows.trigger.createCustomRule.mutationOptions() as any,
  );

  const handleCreateMutate = async (vars: { triggerEvent: string; playbookId: string; conditions: string }) => {
    try {
      await createMutation.mutateAsync(vars);
      toast.success('Auto-start rule created');
      onCreated();
      handleClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create rule';
      toast.error(msg);
    }
  };

  function handleClose() {
    onOpenChange(false);
    setTimeout(() => {
      setStep(1);
      setTriggerEvent('');
      setFieldValues({});
      setSelectedPlaybookId('');
    }, 200);
  }

  function buildConditions(): Record<string, unknown> {
    const conditions: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fieldValues)) {
      if (value && value !== 'ANY') conditions[key] = value;
    }
    return conditions;
  }

  function handleSubmit() {
    if (!triggerEvent || !selectedPlaybookId) return;
    void handleCreateMutate({
      triggerEvent: triggerEvent as TriggerEvent,
      playbookId: selectedPlaybookId,
      conditions: JSON.stringify(buildConditions()),
    });
  }

  // Reset field values when trigger event changes
  function handleTriggerChange(value: TriggerEvent) {
    setTriggerEvent(value);
    setFieldValues({});
  }

  const conditionFields = triggerEvent ? EVENT_CONDITION_FIELDS[triggerEvent] : [];

  const canGoNext =
    (step === 1 && Boolean(triggerEvent)) ||
    step === 2 ||
    (step === 3 && Boolean(selectedPlaybookId));

  const stepTitle = {
    1: 'When does this start?',
    2: 'For which records?',
    3: 'Which checklist runs?',
  }[step];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Create Auto-Start Rule</DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-4">
          {([1, 2, 3] as const).map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                  s === step
                    ? 'bg-primary text-primary-foreground'
                    : s < step
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {s}
              </div>
              {s < 3 && <div className={`h-px w-8 ${s < step ? 'bg-primary/40' : 'bg-border'}`} />}
            </div>
          ))}
          <span className="ml-2 text-sm font-medium">{stepTitle}</span>
        </div>

        {/* Step 1: Trigger event selection */}
        {step === 1 && (
          <div className="space-y-1">
            <div className="space-y-2" role="radiogroup" aria-label="Trigger event">
              {TRIGGER_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-3 rounded-md border border-border px-3 py-3 cursor-pointer hover:bg-accent transition-colors"
                >
                  <input
                    type="radio"
                    name="triggerEvent"
                    value={opt.value}
                    checked={triggerEvent === opt.value}
                    onChange={() => handleTriggerChange(opt.value)}
                    className="accent-primary"
                  />
                  <span className="text-sm flex-1">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Conditions — entity-specific dropdowns per trigger event */}
        {step === 2 && (
          <div className="space-y-4">
            {conditionFields.length === 0 ? (
              <div className="rounded-md border border-border bg-muted/40 px-4 py-3">
                <p className="text-sm font-medium text-foreground">All records</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  This rule will run for every matching event with no additional filtering.
                </p>
              </div>
            ) : (
              conditionFields.map((field) => (
                <div key={field.key}>
                  <Label className="text-sm font-medium mb-2 block">{field.label}</Label>
                  <Select
                    value={fieldValues[field.key] ?? 'ANY'}
                    onValueChange={(v) => setFieldValues((prev) => ({ ...prev, [field.key]: v }))}
                  >
                    <SelectTrigger className="h-9" aria-label={`Select ${field.label}`}>
                      <SelectValue placeholder={`Any ${field.label.toLowerCase()}`} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ANY">Any {field.label.toLowerCase()}</SelectItem>
                      {field.options.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))
            )}
          </div>
        )}

        {/* Step 3: Playbook picker */}
        {step === 3 && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Checklist to run</Label>
            <Select value={selectedPlaybookId} onValueChange={setSelectedPlaybookId}>
              <SelectTrigger className="h-9" aria-label="Select checklist">
                <SelectValue placeholder="Pick a checklist..." />
              </SelectTrigger>
              <SelectContent>
                {playbooks.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
                {playbooks.length === 0 && (
                  <div className="py-2 px-3 text-sm text-muted-foreground">No checklists yet</div>
                )}
              </SelectContent>
            </Select>
          </div>
        )}

        <DialogFooter className="flex justify-between mt-4">
          <Button
            variant="ghost"
            onClick={() => {
              if (step === 1) {
                handleClose();
              } else {
                setStep((s) => (s - 1) as 1 | 2 | 3);
              }
            }}
            disabled={createMutation.isPending}
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>

          <div className="flex gap-2">
            {step < 3 ? (
              <Button
                onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
                disabled={!canGoNext}
              >
                Next
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={!selectedPlaybookId || createMutation.isPending}
              >
                {createMutation.isPending ? 'Creating...' : 'Create Rule'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
