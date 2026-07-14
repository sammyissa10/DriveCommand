/**
 * Day-scoped Hours-of-Service math for the Driver Detail "Hours" tab.
 *
 * Pure + injectable-clock so it's unit-testable and shared: the tab does NO HOS
 * math itself. Builds on the daily clocks in ./compute-hos-clocks (same duty
 * rules, same limits) and adds:
 *   - per-day drive/duty totals for any day (browse previous days),
 *   - the 8-day / 70-hour cycle total,
 *   - a clipped duty timeline for rendering the day's entries,
 *   - the "last known status" for empty days.
 */

import {
  DRIVE_LIMIT_HOURS,
  type RawHOSEntry,
  type HOSDutyStatusLike,
} from './compute-hos-clocks'

/** Property-carrier 60/7 vs 70/8 — this fleet models the 70-hour / 8-day cycle. */
export const CYCLE_DAYS = 8
export const CYCLE_LIMIT_HOURS = 70

/** Progress-bar thresholds (fraction of the limit). */
export const WARN_AT = 0.8
export const DANGER_AT = 1.0

const MIN_MS = 60_000

function isDriving(s: string): boolean {
  return s === 'DRIVING'
}
/** On duty = driving OR on-duty-not-driving (sleeper/off don't count). */
function isOnDuty(s: string): boolean {
  return s === 'DRIVING' || s === 'ON_DUTY'
}

/** Minutes an entry overlaps [winStart, winEnd]; open entries end at `nowMs`. */
function overlapMinutes(e: RawHOSEntry, winStart: number, winEnd: number, nowMs: number): number {
  const start = e.startTime.getTime()
  const end = (e.endTime ? e.endTime.getTime() : nowMs)
  const lo = Math.max(start, winStart)
  const hi = Math.min(end, winEnd)
  return hi > lo ? (hi - lo) / MIN_MS : 0
}

export interface DutySegment {
  status: HOSDutyStatusLike
  startMs: number
  endMs: number
  durationMinutes: number
}

export interface DayHOS {
  /** Driving minutes accrued during the day. */
  driveMinutes: number
  /** On-duty minutes during the day (driving counts as on duty). */
  dutyMinutes: number
  /** The 11-hour driving limit, in minutes. */
  driveLimitMinutes: number
  /** Minutes of driving left against the 11-hour limit (clamped ≥ 0). */
  driveRemainingMinutes: number
  /** driveMinutes / limit — may exceed 1 (a violation). */
  drivePct: number
  /** True once driving has crossed the 11-hour limit. */
  violation: boolean
  /** The day's entries clipped to the day, in start order. */
  timeline: DutySegment[]
  /** Whether any entry overlapped this day. */
  hasEntries: boolean
  /** Status in effect at the end of the day (for empty-day "last known"). */
  lastStatus: HOSDutyStatusLike
}

/**
 * Compute one day's HOS. `dayStartMs`/`dayEndMs` are the day's bounds in the
 * viewing timezone (caller supplies them); `nowMs` caps open/in-progress entries.
 */
export function computeDayHOS(
  entries: RawHOSEntry[],
  dayStartMs: number,
  dayEndMs: number,
  nowMs: number,
): DayHOS {
  // A day never accrues past "now".
  const winEnd = Math.min(dayEndMs, nowMs)

  let driveMinutes = 0
  let dutyMinutes = 0
  const timeline: DutySegment[] = []

  for (const e of entries) {
    const mins = overlapMinutes(e, dayStartMs, winEnd, nowMs)
    if (mins <= 0) continue
    if (isDriving(e.status)) driveMinutes += mins
    if (isOnDuty(e.status)) dutyMinutes += mins

    const start = Math.max(e.startTime.getTime(), dayStartMs)
    const end = Math.min(e.endTime ? e.endTime.getTime() : nowMs, winEnd)
    timeline.push({
      status: e.status as HOSDutyStatusLike,
      startMs: start,
      endMs: end,
      durationMinutes: (end - start) / MIN_MS,
    })
  }
  timeline.sort((a, b) => a.startMs - b.startMs)

  // Last known status at day end: the latest entry that had started by then.
  let lastStatus: HOSDutyStatusLike = 'OFF_DUTY'
  let latestStart = -Infinity
  for (const e of entries) {
    const s = e.startTime.getTime()
    if (s <= dayEndMs && s >= latestStart) {
      latestStart = s
      lastStatus = e.status as HOSDutyStatusLike
    }
  }

  const driveLimitMinutes = DRIVE_LIMIT_HOURS * 60
  const drivePct = driveMinutes / driveLimitMinutes
  return {
    driveMinutes: Math.round(driveMinutes),
    dutyMinutes: Math.round(dutyMinutes),
    driveLimitMinutes,
    driveRemainingMinutes: Math.max(0, Math.round(driveLimitMinutes - driveMinutes)),
    drivePct,
    violation: drivePct >= DANGER_AT,
    timeline,
    hasEntries: timeline.length > 0,
    lastStatus,
  }
}

export interface CycleHOS {
  /** On-duty minutes across the trailing cycle window. */
  cycleMinutes: number
  /** The cycle limit (70h) in minutes. */
  cycleLimitMinutes: number
  /** cycleMinutes / limit — may exceed 1. */
  cyclePct: number
}

/** On-duty minutes over the trailing `days`-day window ending at `nowMs`. */
export function computeCycleHOS(entries: RawHOSEntry[], nowMs: number, days: number = CYCLE_DAYS): CycleHOS {
  const winStart = nowMs - days * 24 * 60 * MIN_MS
  let cycleMinutes = 0
  for (const e of entries) {
    if (!isOnDuty(e.status)) continue
    cycleMinutes += overlapMinutes(e, winStart, nowMs, nowMs)
  }
  const cycleLimitMinutes = CYCLE_LIMIT_HOURS * 60
  return {
    cycleMinutes: Math.round(cycleMinutes),
    cycleLimitMinutes,
    cyclePct: cycleMinutes / cycleLimitMinutes,
  }
}

/** Bar tone from a fraction-of-limit: warning at 80%, danger at 100%. */
export function barTone(pct: number): 'accent' | 'warning' | 'danger' {
  if (pct >= DANGER_AT) return 'danger'
  if (pct >= WARN_AT) return 'warning'
  return 'accent'
}
