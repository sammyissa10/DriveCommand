'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { StepType, AssigneeRole } from '@drivecommand/validation';

interface NewStepTemplateButtonProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STEP_TYPE_OPTIONS: Array<{ value: StepType; label: string }> = [
  { value: 'DOCUMENT_UPLOAD', label: 'Document Upload' },
  { value: 'FORM_FILL', label: 'Form' },
  { value: 'INSPECTION_ITEM', label: 'Inspection' },
  { value: 'SIGNATURE', label: 'Signature' },
  { value: 'TRAINING_ACK', label: 'Training Acknowledgment' },
  { value: 'APPROVAL', label: 'Approval' },
  { value: 'THIRD_PARTY', label: 'External Party' },
  { value: 'CUSTOM_NOTE', label: 'Note' },
];

const ASSIGNEE_ROLE_OPTIONS: Array<{ value: AssigneeRole; label: string }> = [
  { value: 'DRIVER', label: 'Driver' },
  { value: 'DISPATCHER', label: 'Dispatcher' },
  { value: 'MECHANIC', label: 'Mechanic' },
  { value: 'SAFETY_MANAGER', label: 'Safety Manager' },
  { value: 'THIRD_PARTY', label: 'Third Party' },
];

export function NewStepTemplateButton({ open, onOpenChange }: NewStepTemplateButtonProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [stepType, setStepType] = useState<StepType | ''>('');
  const [assigneeRole, setAssigneeRole] = useState<AssigneeRole | ''>('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMutation = useMutation(
    trpc.workflows.stepTemplate.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.workflows.stepTemplate.list.queryKey(),
        });
        handleClose();
      },
    }),
  );

  function resetForm() {
    setName('');
    setDescription('');
    setStepType('');
    setAssigneeRole('');
    setErrors({});
  }

  function handleClose() {
    resetForm();
    onOpenChange(false);
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Name is required';
    if (name.trim().length > 200) newErrors.name = 'Name must be 200 characters or less';
    if (!stepType) newErrors.stepType = 'Step type is required';
    if (!assigneeRole) newErrors.assigneeRole = 'Assignee role is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    createMutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      stepType: stepType as StepType,
      assigneeRole: assigneeRole as AssigneeRole,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>New Step Template</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="st-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="st-name"
              placeholder="e.g. Check tire pressure"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="st-desc">Description</Label>
            <Textarea
              id="st-desc"
              placeholder="Optional description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={2000}
            />
          </div>

          {/* Step type */}
          <div className="space-y-1.5">
            <Label htmlFor="st-type">
              Step type <span className="text-destructive">*</span>
            </Label>
            <Select
              value={stepType}
              onValueChange={(v) => setStepType(v as StepType)}
            >
              <SelectTrigger id="st-type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {STEP_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.stepType && <p className="text-xs text-destructive">{errors.stepType}</p>}
          </div>

          {/* Assignee role */}
          <div className="space-y-1.5">
            <Label htmlFor="st-role">
              Assignee role <span className="text-destructive">*</span>
            </Label>
            <Select
              value={assigneeRole}
              onValueChange={(v) => setAssigneeRole(v as AssigneeRole)}
            >
              <SelectTrigger id="st-role">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {ASSIGNEE_ROLE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.assigneeRole && (
              <p className="text-xs text-destructive">{errors.assigneeRole}</p>
            )}
          </div>

          {/* Mutation error */}
          {createMutation.isError && (
            <p className="text-xs text-destructive">
              {createMutation.error?.message ?? 'Something went wrong. Please try again.'}
            </p>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
