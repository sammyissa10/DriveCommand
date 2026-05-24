'use client';

import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DriverOption {
  id: string;
  name: string;
  status: string;
}

interface TruckOption {
  id: string;
  unitNumber: string;
  make: string | null;
  model: string | null;
}

interface Template {
  id: string;
  templateName: string;
  recurrenceRule: string | null;
  estimatedMiles: number | null;
  defaultDriverId: string | null;
  defaultTruckId: string | null;
  client: { name: string } | null;
}

interface ExistingTrip {
  id: string;
  label: string;
}

export interface DispatchLoadModalProps {
  loadId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (dispatchId: string, dispatchNumber: string) => void;
  drivers: DriverOption[];
  trucks: TruckOption[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDefaultDeparture(): string {
  const d = new Date();
  // Tomorrow at 08:00 local time
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const INPUT_CLASSES =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

const SELECT_CLASSES =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

const LABEL_CLASSES = 'block text-sm font-medium text-foreground mb-1';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DispatchLoadModal({
  loadId,
  open,
  onOpenChange,
  onSuccess,
  drivers,
  trucks,
}: DispatchLoadModalProps) {
  // Mode: 'new' to create a new trip, 'existing' to add to an existing planned trip
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [existingTrips, setExistingTrips] = useState<ExistingTrip[]>([]);
  const [selectedExistingTripId, setSelectedExistingTripId] = useState('');
  const [loadingTrips, setLoadingTrips] = useState(false);

  const [primaryDriverId, setPrimaryDriverId] = useState('');
  const [truckId, setTruckId] = useState('');
  const [coDriverId, setCoDriverId] = useState('');
  const [scheduledDeparture, setScheduledDeparture] = useState(getDefaultDeparture());
  const [plannedMiles, setPlannedMiles] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coDriverError, setCoDriverError] = useState<string | null>(null);

  // Load route templates on mount
  useEffect(() => {
    fetch('/api/v1/carrier/route-templates/active')
      .then((r) => r.json())
      .then((body) => {
        if (body.data) setTemplates(body.data as Template[]);
      })
      .catch(() => {
        // Non-critical — show empty dropdown
      });
  }, []);

  // Fetch existing planned trips when mode is 'existing'
  useEffect(() => {
    if (open && mode === 'existing') {
      setLoadingTrips(true);
      fetch('/api/v1/carrier/dispatches?status=planned&pageSize=50')
        .then((r) => r.json())
        .then((body) => {
          interface TripItem {
            id: string;
            notes: string | null;
            scheduledDeparture: string;
            primaryDriver?: { firstName: string; lastName: string };
          }
          const items = (body.items ?? []) as TripItem[];
          setExistingTrips(
            items.map((t) => {
              const match = t.notes?.match(/\[DISPATCH_NUMBER=(DC-\d{4}-\d{5})\]/);
              const tripNumber = match ? match[1] : t.id.slice(0, 8);
              const driverName = t.primaryDriver
                ? `${t.primaryDriver.firstName} ${t.primaryDriver.lastName}`
                : 'No driver';
              const date = new Date(t.scheduledDeparture).toLocaleDateString();
              return { id: t.id, label: `${tripNumber} - ${driverName} - ${date}` };
            })
          );
        })
        .catch(() => {
          toast.error('Failed to load trips');
        })
        .finally(() => setLoadingTrips(false));
    }
  }, [open, mode]);

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setMode('new');
      setSelectedExistingTripId('');
      setPrimaryDriverId('');
      setTruckId('');
      setCoDriverId('');
      setScheduledDeparture(getDefaultDeparture());
      setPlannedMiles('');
      setNotes('');
      setSelectedTemplateId('');
      setError(null);
      setCoDriverError(null);
    }
  }, [open]);

  function handleTemplateChange(newTemplateId: string) {
    setSelectedTemplateId(newTemplateId);
    if (!newTemplateId) return;

    const template = templates.find((t) => t.id === newTemplateId);
    if (!template) return;

    // Auto-populate planned miles if not already set
    if (plannedMiles === '' && template.estimatedMiles != null) {
      setPlannedMiles(template.estimatedMiles);
    }

    // Auto-populate primary driver if not already selected
    if (!primaryDriverId && template.defaultDriverId) {
      const driverExists = drivers.some((d) => d.id === template.defaultDriverId);
      if (driverExists) setPrimaryDriverId(template.defaultDriverId);
    }

    // Auto-populate truck if not already selected
    if (!truckId && template.defaultTruckId) {
      const truckExists = trucks.some((t) => t.id === template.defaultTruckId);
      if (truckExists) setTruckId(template.defaultTruckId);
    }
  }

  function handleCoDriverChange(value: string) {
    setCoDriverId(value);
    if (value && value === primaryDriverId) {
      setCoDriverError('Co-driver cannot be the same as the primary driver.');
    } else {
      setCoDriverError(null);
    }
  }

  function handlePrimaryDriverChange(value: string) {
    setPrimaryDriverId(value);
    if (coDriverId && value === coDriverId) {
      setCoDriverError('Co-driver cannot be the same as the primary driver.');
    } else {
      setCoDriverError(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Validation for 'existing' mode
    if (mode === 'existing') {
      if (!selectedExistingTripId) {
        setError('Please select a trip.');
        return;
      }
    } else {
      // Validation for 'new' mode
      if (!primaryDriverId) {
        setError('Primary driver is required.');
        return;
      }
      if (!truckId) {
        setError('Truck is required.');
        return;
      }
      if (!scheduledDeparture) {
        setError('Scheduled departure is required.');
        return;
      }
      if (coDriverId && coDriverId === primaryDriverId) {
        setCoDriverError('Co-driver cannot be the same as the primary driver.');
        return;
      }
    }

    setSubmitting(true);
    setError(null);

    try {
      if (mode === 'existing') {
        // Add load to existing trip via PATCH
        const loadRes = await fetch(`/api/v1/carrier/loads/${loadId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dispatchId: selectedExistingTripId }),
        });

        if (!loadRes.ok) {
          const data = await loadRes.json().catch(() => ({}));
          throw new Error(data.error ?? `Failed to add load to trip (${loadRes.status})`);
        }

        // Get trip number for toast
        const selectedTrip = existingTrips.find((t) => t.id === selectedExistingTripId);
        const tripNumber = selectedTrip?.label.split(' - ')[0] ?? selectedExistingTripId.slice(0, 8);

        toast.success(`Load added to trip ${tripNumber}`);
        onSuccess(selectedExistingTripId, tripNumber);
      } else {
        // Step 1: Create the dispatch
        const dispatchBody: Record<string, unknown> = {
          primaryDriverId,
          truckId,
          scheduledDeparture: new Date(scheduledDeparture).toISOString(),
        };
        if (coDriverId) dispatchBody.coDriverId = coDriverId;
        if (plannedMiles !== '') dispatchBody.plannedMiles = plannedMiles;
        if (notes.trim()) dispatchBody.notes = notes.trim();
        if (selectedTemplateId) dispatchBody.routeTemplateId = selectedTemplateId;

        const dispatchRes = await fetch('/api/v1/carrier/dispatches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dispatchBody),
        });

        if (!dispatchRes.ok) {
          const data = await dispatchRes.json().catch(() => ({}));
          throw new Error(data.error ?? `Failed to create dispatch (${dispatchRes.status})`);
        }

        const dispatchData = await dispatchRes.json();
        const newDispatchId: string = dispatchData.data?.id;
        if (!newDispatchId) throw new Error('No dispatch ID returned from server');

        // Extract dispatch number from notes tag
        const dispatchNotes: string = dispatchData.data?.notes ?? '';
        const match = dispatchNotes.match(/\[DISPATCH_NUMBER=(DC-\d{4}-\d{5})\]/);
        const dispatchNumber = match ? match[1] : `DC-${newDispatchId.slice(0, 8)}`;

        // Step 2: Attach this load to the dispatch
        const loadRes = await fetch(`/api/v1/carrier/loads/${loadId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dispatchId: newDispatchId }),
        });

        if (!loadRes.ok) {
          const data = await loadRes.json().catch(() => ({}));
          throw new Error(data.error ?? `Failed to attach load to dispatch (${loadRes.status})`);
        }

        toast.success(`Dispatch ${dispatchNumber} created and load attached`);
        onSuccess(newDispatchId, dispatchNumber);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to dispatch load';
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  // Filter co-driver options to exclude the selected primary driver
  const coDriverOptions = drivers.filter((d) => d.id !== primaryDriverId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dispatch This Load</DialogTitle>
          <DialogDescription>
            Create a new trip or add this load to an existing planned trip.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Mode Selection */}
          <div className="space-y-2">
            <label className={LABEL_CLASSES}>Dispatch Mode</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="mode"
                  value="new"
                  checked={mode === 'new'}
                  onChange={() => setMode('new')}
                  disabled={submitting}
                  className="h-4 w-4"
                />
                <span className="text-sm">Create new trip</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="mode"
                  value="existing"
                  checked={mode === 'existing'}
                  onChange={() => setMode('existing')}
                  disabled={submitting}
                  className="h-4 w-4"
                />
                <span className="text-sm">Add to existing trip</span>
              </label>
            </div>
          </div>

          {mode === 'existing' ? (
            /* Existing Trip Selection */
            <div>
              <label className={LABEL_CLASSES}>
                Select Trip <span className="text-destructive">*</span>
              </label>
              {loadingTrips ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                  <RefreshCw className="h-4 w-4 animate-spin" /> Loading trips...
                </div>
              ) : existingTrips.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No planned trips available. Create a new trip instead.
                </p>
              ) : (
                <select
                  value={selectedExistingTripId}
                  onChange={(e) => setSelectedExistingTripId(e.target.value)}
                  className={SELECT_CLASSES}
                  disabled={submitting}
                >
                  <option value="">Select a planned trip...</option>
                  {existingTrips.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <>
          {/* Route Template (optional) */}
          <div>
            <label className={LABEL_CLASSES}>Route Template (optional)</label>
            <select
              value={selectedTemplateId}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className={SELECT_CLASSES}
              disabled={submitting}
            >
              <option value="">No template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.templateName}{t.client ? ` — ${t.client.name}` : ''}
                </option>
              ))}
            </select>
            {selectedTemplateId && (
              <div className="mt-1 flex items-center gap-1.5">
                <RefreshCw className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                <span className="text-xs text-blue-700 dark:text-blue-300">
                  Template stops will be added to the dispatch.
                </span>
              </div>
            )}
          </div>

          {/* Primary Driver */}
          <div>
            <label className={LABEL_CLASSES}>
              Primary Driver <span className="text-destructive">*</span>
            </label>
            <select
              value={primaryDriverId}
              onChange={(e) => handlePrimaryDriverChange(e.target.value)}
              className={SELECT_CLASSES}
              required
              disabled={submitting}
            >
              <option value="">Select driver...</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Truck */}
          <div>
            <label className={LABEL_CLASSES}>
              Truck <span className="text-destructive">*</span>
            </label>
            <select
              value={truckId}
              onChange={(e) => setTruckId(e.target.value)}
              className={SELECT_CLASSES}
              required
              disabled={submitting}
            >
              <option value="">Select truck...</option>
              {trucks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.unitNumber}
                  {(t.make || t.model) && ` — ${[t.make, t.model].filter(Boolean).join(' ')}`}
                </option>
              ))}
            </select>
          </div>

          {/* Scheduled Departure */}
          <div>
            <label className={LABEL_CLASSES}>
              Scheduled Departure <span className="text-destructive">*</span>
            </label>
            <input
              type="datetime-local"
              value={scheduledDeparture}
              onChange={(e) => setScheduledDeparture(e.target.value)}
              className={INPUT_CLASSES}
              required
              disabled={submitting}
            />
          </div>

          {/* Co-Driver */}
          <div>
            <label className={LABEL_CLASSES}>Co-Driver (optional)</label>
            <select
              value={coDriverId}
              onChange={(e) => handleCoDriverChange(e.target.value)}
              className={SELECT_CLASSES}
              disabled={submitting}
            >
              <option value="">None</option>
              {coDriverOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            {coDriverError && (
              <p className="mt-1 text-xs text-destructive">{coDriverError}</p>
            )}
          </div>

          {/* Planned Miles */}
          <div>
            <label className={LABEL_CLASSES}>Planned Miles (optional)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={plannedMiles}
              onChange={(e) =>
                setPlannedMiles(e.target.value === '' ? '' : parseFloat(e.target.value))
              }
              placeholder="e.g. 350"
              className={INPUT_CLASSES}
              disabled={submitting}
            />
          </div>

          {/* Notes */}
          <div>
            <label className={LABEL_CLASSES}>Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes..."
              rows={3}
              disabled={submitting}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>
            </>
          )}

          {/* Error */}
          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !!coDriverError || (mode === 'existing' && !selectedExistingTripId)}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {submitting
                ? (mode === 'existing' ? 'Adding...' : 'Creating...')
                : (mode === 'existing' ? 'Add to Trip' : 'Create Trip & Attach Load')}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
