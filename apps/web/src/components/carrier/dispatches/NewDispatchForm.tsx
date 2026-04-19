'use client';

import { useState, useEffect } from 'react';
import { Info, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Template {
  id: string;
  templateName: string;
  recurrenceRule: string | null;
  scheduledDepartureTime: string | null;
  recurrenceTimezone: string;
  estimatedMiles: number | null;
  defaultDriverId: string | null;
  defaultTruckId: string | null;
  client: { name: string } | null;
  stops: Array<{
    sequenceOrder: number;
    stopType: string;
    facility: { name: string; city: string | null; state: string | null };
  }>;
}

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

const STOP_TYPE_LABEL: Record<string, string> = {
  pickup: 'Pickup',
  delivery: 'Delivery',
  fuel: 'Fuel',
  rest: 'Rest',
  customs: 'Customs',
  other: 'Other',
};

const STOP_TYPE_BADGE: Record<string, string> = {
  pickup: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  delivery: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  fuel: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  rest: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  customs: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  other: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

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

  // Template state
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  // Load templates on mount
  useEffect(() => {
    fetch('/api/v1/carrier/route-templates/active')
      .then((r) => r.json())
      .then((body) => {
        if (body.data) setTemplates(body.data as Template[]);
      })
      .catch(() => {
        // Non-critical — just show empty dropdown
      });
  }, []);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null;

  function handleTemplateChange(newTemplateId: string) {
    setSelectedTemplateId(newTemplateId);

    if (!newTemplateId) return;
    const template = templates.find((t) => t.id === newTemplateId);
    if (!template) return;

    // Auto-populate planned miles (only if not already set by user)
    if (plannedMiles === '' && template.estimatedMiles != null) {
      setPlannedMiles(template.estimatedMiles);
    }

    // Auto-populate primary driver (only if not already selected)
    if (!primaryDriverId && template.defaultDriverId && template.defaultDriverId in driverMap) {
      setPrimaryDriverId(template.defaultDriverId);
    }

    // Auto-populate truck (only if not already selected)
    if (!truckId && template.defaultTruckId && template.defaultTruckId in truckMap) {
      setTruckId(template.defaultTruckId);
    }
  }

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
      if (selectedTemplateId) body.routeTemplateId = selectedTemplateId;

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
      {/* Route Template (optional) */}
      <div>
        <label className={LABEL_CLASSES}>Route Template (optional)</label>
        <select
          value={selectedTemplateId}
          onChange={(e) => handleTemplateChange(e.target.value)}
          className={SELECT_CLASSES}
        >
          <option value="">No template</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.templateName}{t.client ? ` — ${t.client.name}` : ''}
            </option>
          ))}
        </select>

        {/* Stop preview */}
        {selectedTemplate && selectedTemplate.stops.length > 0 && (
          <div className="mt-2 rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 p-3 space-y-1.5">
            <div className="flex items-center gap-1.5 mb-1">
              <RefreshCw className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                {selectedTemplate.stops.length} stop{selectedTemplate.stops.length !== 1 ? 's' : ''} will be created
              </span>
            </div>
            {selectedTemplate.stops.map((stop) => (
              <div key={stop.sequenceOrder} className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground w-12 shrink-0">Stop {stop.sequenceOrder}</span>
                <span
                  className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium shrink-0 ${STOP_TYPE_BADGE[stop.stopType] ?? STOP_TYPE_BADGE.other}`}
                >
                  {STOP_TYPE_LABEL[stop.stopType] ?? stop.stopType}
                </span>
                <span className="text-foreground truncate">
                  {stop.facility.name}
                  {(stop.facility.city || stop.facility.state) && (
                    <span className="text-muted-foreground">
                      {' '}({[stop.facility.city, stop.facility.state].filter(Boolean).join(', ')})
                    </span>
                  )}
                </span>
              </div>
            ))}
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
          {selectedTemplateId
            ? 'Stops from the selected template will be added automatically.'
            : 'Add loads and stops to this dispatch from the dispatch detail page.'}
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
