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
import { Input } from '@/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';

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

const DRIVER_TYPE_OPTIONS = [
  { value: 'CDL', label: 'CDL Driver' },
  { value: 'NON_CDL', label: 'Non-CDL Driver' },
  { value: 'OWNER_OP', label: 'Owner-Operator' },
];

interface Condition {
  key: string;
  value: string;
}

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

  // Step 2 state
  const [driverType, setDriverType] = useState<string>('ANY');
  const [extraConditions, setExtraConditions] = useState<Condition[]>([]);

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

  // Handle side effects imperatively to avoid tRPC type depth issues
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
    // Reset state after dialog animation completes
    setTimeout(() => {
      setStep(1);
      setTriggerEvent('');
      setDriverType('ANY');
      setExtraConditions([]);
      setSelectedPlaybookId('');
    }, 200);
  }

  function buildConditions(): Record<string, unknown> {
    const conditions: Record<string, unknown> = {};

    // Driver-type condition for ON_DRIVER_CREATE
    if (triggerEvent === 'ON_DRIVER_CREATE' && driverType !== 'ANY') {
      conditions.driverType = driverType;
    }

    // Extra conditions (key = value pairs)
    for (const cond of extraConditions) {
      if (cond.key.trim() && cond.value.trim()) {
        conditions[cond.key.trim()] = cond.value.trim();
      }
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
                    onChange={() => setTriggerEvent(opt.value)}
                    className="accent-primary"
                  />
                  <span className="text-sm flex-1">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Conditions */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Driver-type filter for ON_DRIVER_CREATE */}
            {triggerEvent === 'ON_DRIVER_CREATE' && (
              <div>
                <Label className="text-sm font-medium mb-2 block">Driver type</Label>
                <Select value={driverType} onValueChange={setDriverType}>
                  <SelectTrigger className="h-9" aria-label="Select driver type">
                    <SelectValue placeholder="Any driver type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ANY">Any driver type</SelectItem>
                    {DRIVER_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* For all other events, show "All records" + optional extra conditions */}
            {triggerEvent !== 'ON_DRIVER_CREATE' && (
              <p className="text-sm text-muted-foreground">
                All records — this rule will run for every matching event.
              </p>
            )}

            {/* Extra key=value conditions (optional for all event types) */}
            <div>
              <Label className="text-sm font-medium mb-2 block">
                Additional conditions <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <div className="space-y-2">
                {extraConditions.map((cond, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      placeholder="Field"
                      value={cond.key}
                      onChange={(e) => {
                        const updated = [...extraConditions];
                        updated[i] = { ...updated[i], key: e.target.value };
                        setExtraConditions(updated);
                      }}
                      className="h-8 text-sm flex-1"
                    />
                    <span className="text-muted-foreground text-sm">=</span>
                    <Input
                      placeholder="Value"
                      value={cond.value}
                      onChange={(e) => {
                        const updated = [...extraConditions];
                        updated[i] = { ...updated[i], value: e.target.value };
                        setExtraConditions(updated);
                      }}
                      className="h-8 text-sm flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setExtraConditions(extraConditions.filter((_, j) => j !== i))}
                      aria-label="Remove condition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 h-8 text-xs gap-1"
                onClick={() => setExtraConditions([...extraConditions, { key: '', value: '' }])}
              >
                <Plus className="w-3 h-3" />
                Add condition
              </Button>
            </div>
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
