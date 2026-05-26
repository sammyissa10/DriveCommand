'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Bell } from 'lucide-react';
import { toast } from 'sonner';
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

interface TripAddStopModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dispatchId: string;
  dispatchStatus: string;
  currentStopCount: number;
  loadId?: string;
}

type StopType = 'pickup' | 'delivery' | 'fuel_stop' | 'layover';

interface StopForm {
  stopType: StopType;
  contactName: string;
  contactPhone: string;
  appointmentStart: string;
  appointmentEnd: string;
  specialInstructions: string;
  commodityDescription: string;
}

const DEFAULT_FORM: StopForm = {
  stopType: 'pickup',
  contactName: '',
  contactPhone: '',
  appointmentStart: '',
  appointmentEnd: '',
  specialInstructions: '',
  commodityDescription: '',
};

export function TripAddStopModal({
  open,
  onOpenChange,
  dispatchId,
  dispatchStatus,
  currentStopCount,
  loadId,
}: TripAddStopModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedFacility, setSelectedFacility] = useState<FacilitySearchResult | null>(null);
  const [form, setForm] = useState<StopForm>(DEFAULT_FORM);
  const [showFacilitySheet, setShowFacilitySheet] = useState(false);

  const isInProgress = dispatchStatus === 'in_progress';

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setStep(1);
      setSelectedFacility(null);
      setForm(DEFAULT_FORM);
      setShowFacilitySheet(false);
    }
  }, [open]);

  function handleFacilitySelect(facility: FacilitySearchResult) {
    setSelectedFacility(facility);
    setStep(2);
  }

  function handleSubmit() {
    if (!selectedFacility) return;

    startTransition(async () => {
      try {
        const body: Record<string, unknown> = {
          dispatchId,
          facilityId: selectedFacility.id,
          stopType: form.stopType,
          sequenceOrder: currentStopCount + 1,
        };

        if (loadId) body.loadId = loadId;
        if (form.contactName.trim()) body.contactName = form.contactName.trim();
        if (form.contactPhone.trim()) body.contactPhone = form.contactPhone.trim();
        if (form.appointmentStart) body.appointmentStart = new Date(form.appointmentStart).toISOString();
        if (form.appointmentEnd) body.appointmentEnd = new Date(form.appointmentEnd).toISOString();
        if (form.specialInstructions.trim()) body.specialInstructions = form.specialInstructions.trim();
        if (form.commodityDescription.trim()) body.commodityDescription = form.commodityDescription.trim();

        const res = await fetch('/api/v1/carrier/stops', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? 'Failed to add stop');
        }

        toast.success('Stop added to trip', {
          description: isInProgress ? 'Driver has been notified.' : undefined,
          icon: isInProgress ? <Bell className="h-4 w-4 text-blue-500" /> : undefined,
        });
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to add stop');
      }
    });
  }

  // Step 1 — Facility Search
  if (step === 1) {
    return (
      <>
        <FacilitySearchModal
          open={open}
          onOpenChange={onOpenChange}
          onSelect={handleFacilitySelect}
          onCreateNew={() => setShowFacilitySheet(true)}
        />

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
                onCancel={() => setShowFacilitySheet(false)}
              />
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  // Step 2 — Stop details form
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Stop to Trip</DialogTitle>
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

        <div className="space-y-4">
          {/* Stop Type */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Stop Type</label>
            <Select
              value={form.stopType}
              onValueChange={(v) => setForm((prev) => ({ ...prev, stopType: v as StopType }))}
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

          {/* Appointment Times */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Appointment Start <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Input
                type="datetime-local"
                value={form.appointmentStart}
                onChange={(e) => setForm((prev) => ({ ...prev, appointmentStart: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Appointment End <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Input
                type="datetime-local"
                value={form.appointmentEnd}
                onChange={(e) => setForm((prev) => ({ ...prev, appointmentEnd: e.target.value }))}
              />
            </div>
          </div>

          {/* Contact Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Contact Name <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Input
                value={form.contactName}
                onChange={(e) => setForm((prev) => ({ ...prev, contactName: e.target.value }))}
                placeholder="John Doe"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Contact Phone <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Input
                value={form.contactPhone}
                onChange={(e) => setForm((prev) => ({ ...prev, contactPhone: e.target.value }))}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          {/* Commodity Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Commodity Description <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Input
              value={form.commodityDescription}
              onChange={(e) => setForm((prev) => ({ ...prev, commodityDescription: e.target.value }))}
              placeholder="e.g. Dry goods, frozen freight..."
            />
          </div>

          {/* Special Instructions */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Special Instructions <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Textarea
              value={form.specialInstructions}
              onChange={(e) => setForm((prev) => ({ ...prev, specialInstructions: e.target.value }))}
              placeholder="Any special handling notes..."
              rows={2}
              className="resize-none"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="flex-1"
            onClick={handleSubmit}
            disabled={isPending}
          >
            {isPending ? 'Adding...' : 'Add Stop'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
