'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FacilitySearchModal,
  type FacilitySearchResult,
} from '@/components/carrier/facilities/FacilitySearchModal';
import { FacilityForm } from '@/components/carrier/facilities/FacilityForm';
import type { StopBuilderStop } from './StopCard';

interface StopBuilderAddModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (stop: StopBuilderStop) => void;
  mode: 'template' | 'load';
}

type StopType = StopBuilderStop['stop_type'];

interface QuickAddForm {
  stop_type: StopType;
  bol_required: boolean;
  pod_required: boolean;
  commodity_description: string;
  special_instructions: string;
}

const DEFAULT_FORM: QuickAddForm = {
  stop_type: 'pickup',
  bol_required: false,
  pod_required: false,
  commodity_description: '',
  special_instructions: '',
};

export function StopBuilderAddModal({
  open,
  onOpenChange,
  onAdd,
  mode,
}: StopBuilderAddModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedFacility, setSelectedFacility] = useState<FacilitySearchResult | null>(null);
  const [form, setForm] = useState<QuickAddForm>(DEFAULT_FORM);
  const [showFacilitySheet, setShowFacilitySheet] = useState(false);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setStep(1);
      setSelectedFacility(null);
      setForm(DEFAULT_FORM);
      setShowFacilitySheet(false);
    }
  }, [open]);

  // Auto-set BOL/POD defaults based on stop_type
  function handleStopTypeChange(value: StopType) {
    setForm((prev) => ({
      ...prev,
      stop_type: value,
      bol_required: value === 'pickup' || value === 'delivery' ? true : prev.bol_required,
      pod_required: value === 'delivery' ? true : prev.pod_required,
    }));
  }

  function handleFacilitySelect(facility: FacilitySearchResult) {
    setSelectedFacility(facility);
    setStep(2);
  }

  function handleAdd() {
    if (!selectedFacility) return;

    const stop: StopBuilderStop = {
      id: crypto.randomUUID(),
      facility_id: selectedFacility.id,
      facility_name: selectedFacility.name,
      facility_city: selectedFacility.city,
      facility_state: selectedFacility.state,
      sequence_order: 0, // parent will recompute
      stop_type: form.stop_type,
      contact_name: null,
      contact_phone: null,
      expected_dwell_minutes: null,
      commodity_description: form.commodity_description || null,
      bol_required: form.bol_required,
      pod_required: form.pod_required,
      special_instructions: form.special_instructions || null,
      appt_window_start_offset_min: null,
      appt_window_end_offset_min: null,
      appointment_start: null,
      appointment_end: null,
    };

    onAdd(stop);
    onOpenChange(false);
  }

  // Step 1 — Facility Search
  // We show FacilitySearchModal directly when open + step===1
  if (step === 1) {
    return (
      <>
        <FacilitySearchModal
          open={open}
          onOpenChange={onOpenChange}
          onSelect={handleFacilitySelect}
          onCreateNew={() => {
            setShowFacilitySheet(true);
          }}
        />

        {/* Create new facility side sheet */}
        <Sheet open={showFacilitySheet} onOpenChange={setShowFacilitySheet}>
          <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Create New Facility</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <FacilityForm
                onSuccess={(created) => {
                  setShowFacilitySheet(false);
                  handleFacilitySelect(created);
                }}
              />
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  // Step 2 — Quick-add form
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Stop</DialogTitle>
        </DialogHeader>

        {/* Selected facility header */}
        {selectedFacility && (
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
            <div>
              <p className="font-medium text-sm">{selectedFacility.name}</p>
              {(selectedFacility.city || selectedFacility.state) && (
                <p className="text-xs text-muted-foreground">
                  {selectedFacility.city && selectedFacility.state
                    ? `${selectedFacility.city}, ${selectedFacility.state}`
                    : selectedFacility.city ?? selectedFacility.state}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => setStep(1)}
            >
              <ArrowLeft className="mr-1 h-3 w-3" />
              Change
            </Button>
          </div>
        )}

        {/* Quick-add form */}
        <div className="space-y-4">
          {/* stop_type */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Stop Type</label>
            <Select
              value={form.stop_type}
              onValueChange={(v) => handleStopTypeChange(v as StopType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pickup">Pickup</SelectItem>
                <SelectItem value="delivery">Delivery</SelectItem>
                <SelectItem value="fuel_stop">Fuel Stop</SelectItem>
                <SelectItem value="layover">Layover</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* bol_required + pod_required */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <Switch
                checked={form.bol_required}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, bol_required: checked }))
                }
                id="add-bol-required"
              />
              <label htmlFor="add-bol-required" className="text-sm font-medium cursor-pointer">
                BOL Required
              </label>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={form.pod_required}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, pod_required: checked }))
                }
                id="add-pod-required"
              />
              <label htmlFor="add-pod-required" className="text-sm font-medium cursor-pointer">
                POD Required
              </label>
            </div>
          </div>

          {/* commodity_description */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Commodity Description{' '}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Input
              value={form.commodity_description}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, commodity_description: e.target.value }))
              }
              placeholder="e.g. Dry goods, frozen freight…"
            />
          </div>

          {/* special_instructions */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Special Instructions{' '}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Textarea
              value={form.special_instructions}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, special_instructions: e.target.value }))
              }
              placeholder="Any special handling notes…"
              rows={2}
              className="resize-none"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" className="flex-1" onClick={handleAdd}>
            Add Stop
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
