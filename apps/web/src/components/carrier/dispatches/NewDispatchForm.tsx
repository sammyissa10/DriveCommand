'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NewDispatchFormProps {
  driverMap: Record<string, string>;
  truckMap: Record<string, string>;
  onSuccess: (newId: string) => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDefaultDeparture(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  // Format as datetime-local value: YYYY-MM-DDTHH:MM
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

export function NewDispatchForm({ driverMap, truckMap, onSuccess, onCancel }: NewDispatchFormProps) {
  const [primaryDriverId, setPrimaryDriverId] = useState('');
  const [truckId, setTruckId] = useState('');
  const [coDriverId, setCoDriverId] = useState('');
  const [scheduledDeparture, setScheduledDeparture] = useState(getDefaultDeparture());
  const [plannedMiles, setPlannedMiles] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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

    setSubmitting(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        primaryDriverId,
        truckId,
        scheduledDeparture: new Date(scheduledDeparture).toISOString(),
      };
      if (coDriverId) body.coDriverId = coDriverId;
      if (plannedMiles !== '') body.plannedMiles = plannedMiles;
      if (notes.trim()) body.notes = notes.trim();

      const res = await fetch('/api/v1/carrier/dispatches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }

      const data = await res.json();
      const newId: string = data.data?.id;
      if (!newId) throw new Error('No ID returned from server');

      toast.success('Dispatch created');
      onSuccess(newId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create dispatch';
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const driverEntries = Object.entries(driverMap);
  const truckEntries = Object.entries(truckMap);

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      {/* Primary Driver */}
      <div>
        <label className={LABEL_CLASSES}>
          Primary Driver <span className="text-destructive">*</span>
        </label>
        <select
          value={primaryDriverId}
          onChange={(e) => setPrimaryDriverId(e.target.value)}
          className={SELECT_CLASSES}
          required
        >
          <option value="">Select driver...</option>
          {driverEntries.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
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
        >
          <option value="">Select truck...</option>
          {truckEntries.map(([id, unit]) => (
            <option key={id} value={id}>
              {unit}
            </option>
          ))}
        </select>
      </div>

      {/* Co-Driver */}
      <div>
        <label className={LABEL_CLASSES}>Co-Driver (optional)</label>
        <select
          value={coDriverId}
          onChange={(e) => setCoDriverId(e.target.value)}
          className={SELECT_CLASSES}
        >
          <option value="">None</option>
          {driverEntries.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
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
        />
      </div>

      {/* Planned Miles */}
      <div>
        <label className={LABEL_CLASSES}>Planned Miles (optional)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={plannedMiles}
          onChange={(e) => setPlannedMiles(e.target.value === '' ? '' : parseFloat(e.target.value))}
          placeholder="e.g. 350"
          className={INPUT_CLASSES}
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
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
        />
      </div>

      {/* Info note */}
      <div className="flex items-start gap-2 bg-muted rounded-lg p-3">
        <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
        <p className="text-sm text-muted-foreground">
          Add loads to this dispatch from the dispatch detail page.
        </p>
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {submitting ? 'Creating...' : 'Create Dispatch'}
        </button>
      </div>
    </form>
  );
}
