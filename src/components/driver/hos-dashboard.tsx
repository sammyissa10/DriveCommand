'use client';

import { useActionState } from 'react';
import { Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { updateDutyStatus } from '@/app/(driver)/actions/driver-hos';

interface HOSData {
  currentStatus: string;
  drivingHoursUsed: number;
  drivingHoursRemaining: number;
  onDutyHoursUsed: number;
  onDutyHoursRemaining: number;
  cycleHoursUsed: number;
  cycleHoursRemaining: number;
  lastBreakAt: string;
  nextBreakRequired: string;
}

const statusLabels: Record<string, string> = {
  DRIVING: 'Driving',
  ON_DUTY: 'On Duty',
  SLEEPER_BERTH: 'Sleeper Berth',
  OFF_DUTY: 'Off Duty',
};

const statusColors: Record<string, string> = {
  DRIVING: 'bg-green-100 text-green-700 border-green-200',
  ON_DUTY: 'bg-blue-100 text-blue-700 border-blue-200',
  SLEEPER_BERTH: 'bg-purple-100 text-purple-700 border-purple-200',
  OFF_DUTY: 'bg-gray-100 text-gray-700 border-gray-200',
};

export function HOSDashboard({ hosData }: { hosData: HOSData }) {
  const [state, formAction, isPending] = useActionState(updateDutyStatus, null);

  const drivingPercent = (hosData.drivingHoursUsed / 11) * 100;
  const onDutyPercent = (hosData.onDutyHoursUsed / 14) * 100;
  const cyclePercent = (hosData.cycleHoursUsed / 70) * 100;

  return (
    <div className="space-y-6">
      {/* Current Status */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          Current Status
        </h3>
        <div className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-lg font-semibold ${statusColors[hosData.currentStatus] || statusColors.OFF_DUTY}`}>
          <Clock className="h-5 w-5" />
          {statusLabels[hosData.currentStatus] || hosData.currentStatus}
        </div>

        {/* Status change buttons */}
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.entries(statusLabels).map(([key, label]) => (
            <form key={key} action={formAction}>
              <input type="hidden" name="status" value={key} />
              <button
                type="submit"
                disabled={isPending || hosData.currentStatus === key}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                  hosData.currentStatus === key
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border bg-card text-foreground hover:bg-accent'
                }`}
              >
                {label}
              </button>
            </form>
          ))}
        </div>

        {state?.success && (
          <div className="mt-3 flex items-center gap-2 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            {state.message}
          </div>
        )}
      </div>

      {/* Hours Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="text-sm text-muted-foreground">Driving Hours (11h limit)</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold">{hosData.drivingHoursUsed}h</span>
            <span className="text-sm text-muted-foreground">
              / {hosData.drivingHoursRemaining}h left
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${
                drivingPercent > 80 ? 'bg-red-500' : drivingPercent > 60 ? 'bg-amber-500' : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(drivingPercent, 100)}%` }}
            />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="text-sm text-muted-foreground">On-Duty Hours (14h limit)</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold">{hosData.onDutyHoursUsed}h</span>
            <span className="text-sm text-muted-foreground">
              / {hosData.onDutyHoursRemaining}h left
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${
                onDutyPercent > 80 ? 'bg-red-500' : onDutyPercent > 60 ? 'bg-amber-500' : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(onDutyPercent, 100)}%` }}
            />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="text-sm text-muted-foreground">8-Day Cycle (70h limit)</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold">{hosData.cycleHoursUsed}h</span>
            <span className="text-sm text-muted-foreground">
              / {hosData.cycleHoursRemaining}h left
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${
                cyclePercent > 80 ? 'bg-red-500' : cyclePercent > 60 ? 'bg-amber-500' : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(cyclePercent, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Break reminder */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <p className="text-sm font-medium text-amber-800">30-Minute Break Required</p>
          <p className="mt-0.5 text-sm text-amber-700">
            Next break required by{' '}
            {new Date(hosData.nextBreakRequired).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
            . Last break was at{' '}
            {new Date(hosData.lastBreakAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
            .
          </p>
        </div>
      </div>
    </div>
  );
}
