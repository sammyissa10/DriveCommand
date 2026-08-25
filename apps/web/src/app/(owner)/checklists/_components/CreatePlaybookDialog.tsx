'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { PlaybookEntityType, PlaybookCategory, PhaseType } from '@drivecommand/validation';

interface CreatePlaybookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ENTITY_TYPE_OPTIONS: Array<{ value: PlaybookEntityType; label: string }> = [
  { value: 'DRIVER', label: 'Driver' },
  { value: 'VEHICLE', label: 'Vehicle' },
  { value: 'PARTNER', label: 'Partner' },
  { value: 'DISPATCH', label: 'Dispatch' },
  { value: 'OTHER', label: 'Other' },
];

/**
 * All seven `PlaybookCategory` values.
 *
 * quick-543 added `VEHICLE_INSPECTION`, which had been missing since the enum's
 * seventh value was introduced. The omission was not cosmetic: it is the ONLY
 * category the pre-trip inspection gate accepts
 * (`inspection-service.ts` → `category: 'VEHICLE_INSPECTION'`), so the set of
 * categories an owner could pick and the set the gate would honour had an empty
 * intersection. A tenant that turned on `requirePreTripInspection` and built
 * their own checklist got "no vehicle inspection checklist exists. Create one in
 * Checklists & Workflows" — from this screen, where the required category could
 * not be chosen.
 *
 * Nothing else needed changing: `playbookCategorySchema`, the Prisma enum and
 * the Postgres type have all accepted the value since it was added. This list
 * was the only gate.
 */
const CATEGORY_OPTIONS: Array<{ value: PlaybookCategory; label: string }> = [
  { value: 'ONBOARDING', label: 'Onboarding' },
  { value: 'VEHICLE_INSPECTION', label: 'Vehicle Inspection (DVIR)' },
  { value: 'SAFETY', label: 'Safety' },
  { value: 'OPERATIONS', label: 'Operations' },
  { value: 'COMPLIANCE', label: 'Compliance' },
  { value: 'PARTNER', label: 'Partner' },
  { value: 'CUSTOM', label: 'Custom' },
];

const PHASE_OPTIONS: Array<{ value: PhaseType; label: string }> = [
  { value: 'PRE_START', label: 'Before Start' },
  { value: 'DAY_1', label: 'Day 1' },
  { value: 'WEEK_1', label: 'First Week' },
  { value: 'ONGOING', label: 'Ongoing' },
  { value: 'NONE', label: 'None' },
];

export function CreatePlaybookDialog({ open, onOpenChange }: CreatePlaybookDialogProps) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [entityType, setEntityType] = useState<PlaybookEntityType | ''>('');
  const [category, setCategory] = useState<PlaybookCategory | ''>('');
  const [playbookPhase, setPlaybookPhase] = useState<PhaseType>('NONE');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMutation = useMutation(
    trpc.workflows.playbook.create.mutationOptions({
      onSuccess: async (created) => {
        await queryClient.invalidateQueries({
          queryKey: trpc.workflows.playbook.list.queryKey(),
        });
        onOpenChange(false);
        resetForm();
        router.push(`/checklists/playbooks/${created.id}/edit`);
      },
    }),
  );

  function resetForm() {
    setName('');
    setDescription('');
    setEntityType('');
    setCategory('');
    setPlaybookPhase('NONE');
    setErrors({});
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Name is required';
    if (name.trim().length > 200) newErrors.name = 'Name must be 200 characters or less';
    if (!entityType) newErrors.entityType = 'Entity type is required';
    if (!category) newErrors.category = 'Category is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    createMutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      entityType: entityType as PlaybookEntityType,
      category: category as PlaybookCategory,
      playbookPhase,
    });
  }

  function handleOpenChange(v: boolean) {
    if (!v) resetForm();
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create checklist</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="checklist-name">Name <span className="text-destructive">*</span></Label>
            <Input
              id="checklist-name"
              placeholder="e.g. CDL Driver Onboarding"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="checklist-desc">Description</Label>
            <Textarea
              id="checklist-desc"
              placeholder="Optional — describe when this checklist is used"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={2000}
            />
          </div>

          {/* Entity type */}
          <div className="space-y-1.5">
            <Label htmlFor="checklist-entity">Applies to <span className="text-destructive">*</span></Label>
            <Select
              value={entityType}
              onValueChange={(v) => setEntityType(v as PlaybookEntityType)}
            >
              <SelectTrigger id="checklist-entity">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {ENTITY_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.entityType && <p className="text-xs text-destructive">{errors.entityType}</p>}
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label htmlFor="checklist-category">Category <span className="text-destructive">*</span></Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as PlaybookCategory)}
            >
              <SelectTrigger id="checklist-category">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.category && <p className="text-xs text-destructive">{errors.category}</p>}
          </div>

          {/* Playbook phase */}
          <div className="space-y-1.5">
            <Label htmlFor="checklist-phase">Phase</Label>
            <Select
              value={playbookPhase}
              onValueChange={(v) => setPlaybookPhase(v as PhaseType)}
            >
              <SelectTrigger id="checklist-phase">
                <SelectValue placeholder="Select phase" />
              </SelectTrigger>
              <SelectContent>
                {PHASE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              onClick={() => handleOpenChange(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating…' : 'Create checklist'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
