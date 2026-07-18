/**
 * Presentation helpers for the server-computed HOS clocks. These only *format*
 * numbers the API already calculated (see apps/web/src/lib/hos/compute-hos-clocks.ts);
 * no duty/window math happens here or in any component.
 */
import type { OwnerDriverHOS } from '@drivecommand/api-client'

/** "6h 30m" / "45m" / "7h" from a whole-minute count. */
export function formatHoursMinutes(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(totalMinutes))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h <= 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

/**
 * The dispatch-oriented HOS meta line for a driver row:
 *   - fresh clocks:  "Fresh · 11h drive available"
 *   - out of hours:  "6h 30m on duty · no drive time left"
 *   - normal:        "6h 30m on duty · 4h 30m left"
 */
export function formatHosMeta(hos: OwnerDriverHOS): string {
  if (!hos.hasDutyToday) {
    return `Fresh · ${formatHoursMinutes(hos.driveRemainingMinutes)} drive available`
  }
  const elapsed = `${formatHoursMinutes(hos.onDutyMinutes)} on duty`
  const remaining =
    hos.remainingMinutes <= 0
      ? 'no drive time left'
      : `${formatHoursMinutes(hos.remainingMinutes)} left`
  return `${elapsed} · ${remaining}`
}

/** Meta tint: danger when out of hours, warning when low, muted otherwise. */
export function hosMetaTone(hos: OwnerDriverHOS): 'muted' | 'warning' | 'danger' {
  if (hos.hasDutyToday && hos.remainingMinutes <= 0) return 'danger'
  if (hos.isLow) return 'warning'
  return 'muted'
}
