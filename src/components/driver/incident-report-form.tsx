'use client';

import { useActionState } from 'react';
import { AlertTriangle, Camera, CheckCircle2 } from 'lucide-react';
import { submitIncidentReport } from '@/app/(driver)/actions/driver-incidents';

const inputClass =
  'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';
const labelClass = 'block text-sm font-medium text-foreground mb-1.5';

export function IncidentReportForm() {
  const [state, formAction, isPending] = useActionState(submitIncidentReport, null);

  return (
    <div className="max-w-2xl">
      {state?.success && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
          <div>
            <p className="text-sm font-medium text-green-800">Report Submitted</p>
            <p className="mt-0.5 text-sm text-green-700">{state.message}</p>
          </div>
        </div>
      )}

      <form
        action={formAction}
        className="space-y-5 rounded-lg border border-border bg-card p-6"
        key={state?.success ? Date.now() : 'form'}
      >
        {/* Field-level errors are shown below each input */}

        <div>
          <label htmlFor="type" className={labelClass}>Incident Type</label>
          <select id="type" name="type" disabled={isPending} className={inputClass} required>
            <option value="">Select type...</option>
            <option value="ACCIDENT">Accident / Collision</option>
            <option value="BREAKDOWN">Vehicle Breakdown</option>
            <option value="ROAD_HAZARD">Road Hazard</option>
            <option value="WEATHER">Severe Weather</option>
            <option value="CARGO_DAMAGE">Cargo Damage</option>
            <option value="THEFT">Theft / Security</option>
            <option value="MEDICAL">Medical Emergency</option>
            <option value="OTHER">Other</option>
          </select>
          {state?.error && typeof state.error !== 'string' && state.error.type && (
            <p className="mt-1.5 text-sm text-red-600">{state.error.type}</p>
          )}
        </div>

        <div>
          <label htmlFor="location" className={labelClass}>Location</label>
          <input
            type="text"
            id="location"
            name="location"
            placeholder="e.g., I-95 N Mile Marker 42, near Richmond VA"
            disabled={isPending}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="description" className={labelClass}>Description</label>
          <textarea
            id="description"
            name="description"
            rows={4}
            placeholder="Describe what happened in detail..."
            disabled={isPending}
            className={inputClass}
            required
          />
          {state?.error && typeof state.error !== 'string' && state.error.description && (
            <p className="mt-1.5 text-sm text-red-600">{state.error.description}</p>
          )}
          <p className="mt-1.5 text-xs text-muted-foreground">
            Minimum 10 characters. Include relevant details about the incident.
          </p>
        </div>

        {/* Photo upload placeholder */}
        <div>
          <label className={labelClass}>Photos (optional)</label>
          <div className="flex h-24 items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/30">
            <div className="text-center">
              <Camera className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-1 text-xs text-muted-foreground">Photo upload coming soon</p>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground shadow-sm hover:bg-destructive/90 disabled:opacity-50 transition-colors"
        >
          <AlertTriangle className="h-4 w-4" />
          {isPending ? 'Submitting...' : 'Submit Incident Report'}
        </button>
      </form>
    </div>
  );
}
