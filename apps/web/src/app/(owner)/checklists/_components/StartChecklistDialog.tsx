'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTRPC } from '@/trpc/client';
import { mapDriverOptions } from './mapDriverOptions';
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
import type { PlaybookEntityType } from '@drivecommand/validation';

interface StartChecklistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type EntityOption = { id: string; label: string; disabled?: boolean; hint?: string };

const ENTITY_TYPE_OPTIONS: Array<{ value: PlaybookEntityType; label: string }> = [
  { value: 'DRIVER', label: 'Driver' },
  { value: 'VEHICLE', label: 'Vehicle' },
  { value: 'PARTNER', label: 'Partner' },
];

export function StartChecklistDialog({ open, onOpenChange }: StartChecklistDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [playbookId, setPlaybookId] = useState('');
  const [entityType, setEntityType] = useState<PlaybookEntityType | ''>('');
  const [entityId, setEntityId] = useState('');
  const [entityOptions, setEntityOptions] = useState<EntityOption[]>([]);
  const [entityLoading, setEntityLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load available playbooks
  const { data: playbookData, isLoading: playbooksLoading } = useQuery(
    trpc.workflows.playbook.list.queryOptions({}),
  );

  // Load entity list when entityType changes
  useEffect(() => {
    if (!entityType) {
      setEntityOptions([]);
      setEntityId('');
      return;
    }

    setEntityLoading(true);
    setEntityId('');

    const fetchEntities = async () => {
      try {
        if (entityType === 'DRIVER') {
          const res = await fetch('/api/v1/carrier/fleet/drivers?pageSize=100');
          if (res.ok) {
            const json = await res.json();
            const drivers = json.data?.drivers ?? json.data?.items ?? [];
            setEntityOptions(mapDriverOptions(drivers));
          }
        } else if (entityType === 'VEHICLE') {
          const res = await fetch('/api/v1/carrier/fleet/trucks?pageSize=100');
          if (res.ok) {
            const json = await res.json();
            const trucks = json.data?.trucks ?? json.data?.items ?? [];
            setEntityOptions(
              trucks.map((t: { id: string; unitNumber?: string; displayName?: string }) => ({
                id: t.id,
                label: t.displayName ?? t.unitNumber ?? t.id,
              })),
            );
          }
        } else {
          // PARTNER — no dedicated list API for now; show empty with guidance
          setEntityOptions([]);
        }
      } catch {
        setEntityOptions([]);
      } finally {
        setEntityLoading(false);
      }
    };

    void fetchEntities();
  }, [entityType]);

  const generateMutation = useMutation(
    trpc.workflows.instance.generate.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.workflows.instance.list.queryKey(),
        });
        handleClose();
      },
    }),
  );

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (!playbookId) newErrors.playbookId = 'Select a playbook';
    if (!entityType) newErrors.entityType = 'Select an entity type';
    if (!entityId) newErrors.entityId = 'Select an entity';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    generateMutation.mutate(
      {
        playbookId,
        entityType: entityType as PlaybookEntityType,
        entityId,
      },
      { onError: (error) => toast.error(error.message ?? 'Failed to start checklist') },
    );
  }

  function handleClose() {
    setPlaybookId('');
    setEntityType('');
    setEntityId('');
    setEntityOptions([]);
    setErrors({});
    generateMutation.reset();
    onOpenChange(false);
  }

  const activePlaybooks = playbookData?.filter((p) => !p.deletedAt) ?? [];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(true); }}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Start a checklist</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Playbook selector */}
          <div className="space-y-1.5">
            <Label htmlFor="sc-playbook">
              Playbook <span className="text-destructive">*</span>
            </Label>
            <Select value={playbookId} onValueChange={setPlaybookId} disabled={playbooksLoading}>
              <SelectTrigger id="sc-playbook">
                <SelectValue placeholder={playbooksLoading ? 'Loading…' : 'Select a playbook'} />
              </SelectTrigger>
              <SelectContent>
                {activePlaybooks.map((pb) => (
                  <SelectItem key={pb.id} value={pb.id}>
                    {pb.name}
                  </SelectItem>
                ))}
                {!playbooksLoading && activePlaybooks.length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    No active playbooks found. Create one first.
                  </div>
                )}
              </SelectContent>
            </Select>
            {errors.playbookId && <p className="text-xs text-destructive">{errors.playbookId}</p>}
          </div>

          {/* Entity type selector */}
          <div className="space-y-1.5">
            <Label htmlFor="sc-entity-type">
              Entity type <span className="text-destructive">*</span>
            </Label>
            <Select
              value={entityType}
              onValueChange={(v) => setEntityType(v as PlaybookEntityType)}
            >
              <SelectTrigger id="sc-entity-type">
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

          {/* Entity picker */}
          <div className="space-y-1.5">
            <Label htmlFor="sc-entity-id">
              {entityType === 'DRIVER' ? 'Driver' : entityType === 'VEHICLE' ? 'Vehicle' : entityType === 'PARTNER' ? 'Partner' : 'Entity'}{' '}
              <span className="text-destructive">*</span>
            </Label>
            <Select
              value={entityId}
              onValueChange={setEntityId}
              disabled={!entityType || entityLoading || entityOptions.length === 0}
            >
              <SelectTrigger id="sc-entity-id">
                <SelectValue
                  placeholder={
                    !entityType
                      ? 'Select entity type first'
                      : entityLoading
                        ? 'Loading…'
                        : entityOptions.length === 0
                          ? 'No entities available'
                          : 'Select one'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {entityOptions.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id} disabled={opt.disabled}>
                    <span>{opt.label}</span>
                    {opt.hint && (
                      <span className="block text-xs text-muted-foreground">{opt.hint}</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.entityId && <p className="text-xs text-destructive">{errors.entityId}</p>}
          </div>

          {/* Mutation error */}
          {generateMutation.isError && (
            <p className="text-sm text-destructive">
              {generateMutation.error?.message ?? 'Something went wrong. Please try again.'}
            </p>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={generateMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={generateMutation.isPending}>
              {generateMutation.isPending ? 'Starting…' : 'Start Checklist'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
