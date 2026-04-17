'use client';

import { useActionState, useOptimistic } from 'react';
import { updateDutyStatus } from '@/app/(driver)/actions/driver-hos';
import type { ActionState } from '@drivecommand/types';

interface HosData {
  currentStatus: 'DRIVING' | 'ON_DUTY' | 'SLEEPER_BERTH' | 'OFF_DUTY';
  onDutyHoursUsed: number;
  drivingHoursUsed?: number;
  drivingHoursRemaining?: number;
  onDutyHoursRemaining?: number;
}

interface DriverHosWidgetProps {
  hos: HosData | null;
}

const STATUS_BUTTONS = [
  { value: 'OFF_DUTY', label: 'OFF', shortLabel: 'Off Duty' },
  { value: 'SLEEPER_BERTH', label: 'SB', shortLabel: 'Sleeper Berth' },
  { value: 'DRIVING', label: 'D', shortLabel: 'Driving' },
  { value: 'ON_DUTY', label: 'ON', shortLabel: 'On Duty' },
] as const;

const STATUS_COLORS: Record<string, { active: string; badge: string }> = {
  OFF_DUTY: {
    active: 'bg-gray-500 text-white',
    badge: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  },
  SLEEPER_BERTH: {
    active: 'bg-blue-600 text-white',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  },
  DRIVING: {
    active: 'bg-green-600 text-white',
    badge: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  },
  ON_DUTY: {
    active: 'bg-amber-500 text-white',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  },
};

function formatHoursMinutes(decimalHours: number): string {
  const totalMinutes = Math.round(decimalHours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function DriverHosWidget({ hos }: DriverHosWidgetProps) {
  const defaultStatus: HosData['currentStatus'] = hos?.currentStatus ?? 'OFF_DUTY';
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(defaultStatus);
  const [state, formAction] = useActionState<ActionState | null, FormData>(updateDutyStatus, null);

  if (!hos) {
    return null;
  }

  const colors = STATUS_COLORS[optimisticStatus] ?? STATUS_COLORS.OFF_DUTY;
  const onDutyDisplay = formatHoursMinutes(hos.onDutyHoursUsed);

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
        Duty Status
      </p>

      {/* Current status badge */}
      <div className="flex items-center justify-between mb-3">
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${colors.badge}`}
        >
          {STATUS_BUTTONS.find((b) => b.value === optimisticStatus)?.shortLabel ?? optimisticStatus}
        </span>
        <span className="text-xs text-muted-foreground">
          {onDutyDisplay} on duty today
        </span>
      </div>

      {/* Status change buttons */}
      <div className="flex gap-2">
        {STATUS_BUTTONS.map(({ value, label }) => {
          const isActive = optimisticStatus === value;
          return (
            <form
              key={value}
              action={async (formData) => {
                setOptimisticStatus(value);
                await formAction(formData);
              }}
              className="flex-1"
            >
              <input type="hidden" name="status" value={value} />
              <button
                type="submit"
                className={`w-full min-w-[56px] h-10 rounded-lg text-sm font-semibold transition-all active:scale-95 ${
                  isActive
                    ? colors.active
                    : 'border border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
                aria-label={STATUS_BUTTONS.find((b) => b.value === value)?.shortLabel}
                aria-pressed={isActive}
              >
                {label}
              </button>
            </form>
          );
        })}
      </div>

      {/* Error/success feedback */}
      {state?.error && typeof state.error === 'string' && (
        <p className="text-xs text-destructive mt-2">{state.error}</p>
      )}
    </div>
  );
}
