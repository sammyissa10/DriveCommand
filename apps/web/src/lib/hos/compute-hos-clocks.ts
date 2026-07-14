/**
 * Hours-of-Service clock math — the single source of truth for "how much
 * driving/duty time does this driver have left today".
 *
 * Extracted as a pure function so it can be unit-tested and shared between the
 * driver HOS endpoint and the owner dispatch views (drivers list + detail).
 * Never inline this math in a route handler or (worse) in JSX — call this.
 *
 * The algorithm mirrors the FMCSA property-carrier rules the app models:
 *   - 11-hour driving limit within a 14-hour on-duty window.
 *   - The 14-hour window opens at the first ON_DUTY / DRIVING entry of the day.
 *   - OFF_DUTY and SLEEPER_BERTH do not consume the driving/window clocks.
 */

export type HOSDutyStatusLike = 'OFF_DUTY' | 'SLEEPER_BERTH' | 'DRIVING' | 'ON_DUTY'

/** The minimal shape this math needs from a DriverHOSEntry row. */
export interface RawHOSEntry {
  status: string
  startTime: Date
  /** null = the currently open (active) entry. */
  endTime: Date | null
}

export interface HOSClocks {
  /** Status of the open entry, or OFF_DUTY when nothing is open. */
  currentStatus: HOSDutyStatusLike
  /** Minutes spent DRIVING today (whole minutes). */
  drivingMinutesToday: number
  /** Minutes spent on duty today — DRIVING counts as on duty (whole minutes). */
  onDutyMinutesToday: number
  /** Hours left in the 14-hour on-duty window (float, for parity with the HOS screen). */
  hoursUntil14Limit: number
  /** Hours left against the 11-hour driving limit (float). */
  hoursUntil11DriveLimit: number
  /** Whole minutes of driving time left against the 11-hour limit. */
  driveRemainingMinutes: number
  /** Whole minutes left in the 14-hour on-duty window. */
  dutyWindowRemainingMinutes: number
  /** The binding constraint = min(drive, window). This is the number dispatch cares about. */
  remainingMinutes: number
  /** True once the driver has logged any DRIVING/ON_DUTY time today (their clocks have started). */
  hasDutyToday: boolean
  /** remainingMinutes below the low-time threshold AND the clocks have started. */
  isLow: boolean
}

export const DUTY_WINDOW_HOURS = 14
export const DRIVE_LIMIT_HOURS = 11
/** Below this many minutes remaining, a driver is "low hours" (warning tint). */
export const LOW_HOURS_THRESHOLD_MINUTES = 120

/**
 * Compute today's HOS clocks from a driver's entries.
 *
 * @param entries Entries that either started today OR are still open (endTime
 *   null). Passing the same "today OR open" set the endpoints already query is
 *   important: an overnight open entry contributes to `currentStatus` but not to
 *   today's minute totals.
 * @param now Injectable clock for deterministic tests. Defaults to real now.
 */
export function computeHOSClocks(entries: RawHOSEntry[], now: Date = new Date()): HOSClocks {
  const startOfDay = new Date(now)
  startOfDay.setUTCHours(0, 0, 0, 0)
  const endOfDay = new Date(now)
  endOfDay.setUTCHours(23, 59, 59, 999)

  const openEntry = entries.find((e) => e.endTime == null)
  const currentStatus: HOSDutyStatusLike = openEntry
    ? (openEntry.status as HOSDutyStatusLike)
    : 'OFF_DUTY'

  // Only entries that started today count toward the daily clocks.
  const todayOnly = entries.filter(
    (e) => e.startTime >= startOfDay && e.startTime <= endOfDay
  )

  let drivingMinutes = 0
  let onDutyMinutes = 0
  for (const e of todayOnly) {
    const start = e.startTime.getTime()
    const end = e.endTime ? e.endTime.getTime() : now.getTime()
    const minutes = (end - start) / 1000 / 60
    if (minutes <= 0) continue
    if (e.status === 'DRIVING') {
      drivingMinutes += minutes
      onDutyMinutes += minutes
    } else if (e.status === 'ON_DUTY') {
      onDutyMinutes += minutes
    }
  }

  // The 14-hour window opens at the first on-duty/driving entry of the day.
  const firstDutyEntry = todayOnly.find(
    (e) => e.status !== 'OFF_DUTY' && e.status !== 'SLEEPER_BERTH'
  )
  let hoursUntil14Limit = DUTY_WINDOW_HOURS
  if (firstDutyEntry) {
    const elapsedHours = (now.getTime() - firstDutyEntry.startTime.getTime()) / 1000 / 3600
    hoursUntil14Limit = Math.max(0, DUTY_WINDOW_HOURS - elapsedHours)
  }
  const hoursUntil11DriveLimit = Math.max(0, DRIVE_LIMIT_HOURS - drivingMinutes / 60)

  const driveRemainingMinutes = Math.round(hoursUntil11DriveLimit * 60)
  const dutyWindowRemainingMinutes = Math.round(hoursUntil14Limit * 60)
  const remainingMinutes = Math.min(driveRemainingMinutes, dutyWindowRemainingMinutes)
  const hasDutyToday = firstDutyEntry != null
  const isLow = hasDutyToday && remainingMinutes < LOW_HOURS_THRESHOLD_MINUTES

  return {
    currentStatus,
    drivingMinutesToday: Math.round(drivingMinutes),
    onDutyMinutesToday: Math.round(onDutyMinutes),
    hoursUntil14Limit,
    hoursUntil11DriveLimit,
    driveRemainingMinutes,
    dutyWindowRemainingMinutes,
    remainingMinutes,
    hasDutyToday,
    isLow,
  }
}
