import { describe, it, expect } from 'vitest'
import {
  computeDayHOS,
  computeCycleHOS,
  barTone,
  CYCLE_LIMIT_HOURS,
  type DutySegment,
} from '../driver-hos'
import type { RawHOSEntry } from '../compute-hos-clocks'

// A fixed day: 2026-07-14 in UTC for deterministic bounds.
const DAY_START = new Date('2026-07-14T00:00:00.000Z').getTime()
const DAY_END = new Date('2026-07-14T23:59:59.999Z').getTime()
const NOW = new Date('2026-07-14T18:00:00.000Z').getTime() // 6pm

function at(hUTC: number, m = 0): Date {
  return new Date(Date.UTC(2026, 6, 14, hUTC, m, 0))
}

describe('computeDayHOS', () => {
  it('sums driving and on-duty minutes and builds a clipped timeline', () => {
    const entries: RawHOSEntry[] = [
      { status: 'ON_DUTY', startTime: at(6), endTime: at(9) }, // 3h on duty (pre-trip)
      { status: 'DRIVING', startTime: at(9), endTime: at(13) }, // 4h driving
      { status: 'OFF_DUTY', startTime: at(13), endTime: null }, // off, open
    ]
    const day = computeDayHOS(entries, DAY_START, DAY_END, NOW)
    expect(day.driveMinutes).toBe(240)
    expect(day.dutyMinutes).toBe(420) // 180 on_duty + 240 driving
    expect(day.driveRemainingMinutes).toBe(11 * 60 - 240) // 420
    expect(day.hasEntries).toBe(true)
    expect(day.timeline).toHaveLength(3)
    const drive = day.timeline.find((s: DutySegment) => s.status === 'DRIVING')!
    expect(drive.durationMinutes).toBe(240)
    expect(day.violation).toBe(false)
  })

  it('caps an open entry at now, not at the end of the day', () => {
    const entries: RawHOSEntry[] = [{ status: 'DRIVING', startTime: at(16), endTime: null }]
    const day = computeDayHOS(entries, DAY_START, DAY_END, NOW)
    expect(day.driveMinutes).toBe(120) // 4pm → 6pm now, not midnight
  })

  it('crosses the warning threshold at 80% of the 11-hour drive limit', () => {
    // 9h driving = 540 / 660 = 0.818
    const entries: RawHOSEntry[] = [{ status: 'DRIVING', startTime: at(4), endTime: at(13) }]
    const day = computeDayHOS(entries, DAY_START, DAY_END, NOW)
    expect(day.drivePct).toBeGreaterThanOrEqual(0.8)
    expect(day.drivePct).toBeLessThan(1)
    expect(barTone(day.drivePct)).toBe('warning')
    expect(day.violation).toBe(false)
  })

  it('flags a violation at 100% (11h) and clamps remaining to zero', () => {
    const entries: RawHOSEntry[] = [{ status: 'DRIVING', startTime: at(2), endTime: at(13) }] // 11h
    const day = computeDayHOS(entries, DAY_START, DAY_END, NOW)
    expect(day.drivePct).toBeGreaterThanOrEqual(1)
    expect(day.violation).toBe(true)
    expect(day.driveRemainingMinutes).toBe(0)
    expect(barTone(day.drivePct)).toBe('danger')
  })

  it('empty day (all entries closed before it) carries the last known status', () => {
    const s = new Date(Date.UTC(2026, 6, 10, 8, 0, 0))
    const e = new Date(Date.UTC(2026, 6, 10, 12, 0, 0))
    const entries: RawHOSEntry[] = [{ status: 'ON_DUTY', startTime: s, endTime: e }]
    const day = computeDayHOS(entries, DAY_START, DAY_END, NOW)
    expect(day.hasEntries).toBe(false)
    expect(day.driveMinutes).toBe(0)
    expect(day.lastStatus).toBe('ON_DUTY')
  })
})

describe('computeCycleHOS', () => {
  it('sums on-duty minutes across the trailing 8-day window', () => {
    const entries: RawHOSEntry[] = [
      // 6h on duty two days ago
      { status: 'ON_DUTY', startTime: new Date('2026-07-12T08:00:00Z'), endTime: new Date('2026-07-12T14:00:00Z') },
      // 4h driving today
      { status: 'DRIVING', startTime: new Date('2026-07-14T08:00:00Z'), endTime: new Date('2026-07-14T12:00:00Z') },
      // off duty doesn't count
      { status: 'OFF_DUTY', startTime: new Date('2026-07-13T00:00:00Z'), endTime: new Date('2026-07-13T06:00:00Z') },
      // 9 days ago is outside the window
      { status: 'ON_DUTY', startTime: new Date('2026-07-05T08:00:00Z'), endTime: new Date('2026-07-05T18:00:00Z') },
    ]
    const cycle = computeCycleHOS(entries, NOW)
    expect(cycle.cycleMinutes).toBe(600) // 360 + 240
    expect(cycle.cycleLimitMinutes).toBe(CYCLE_LIMIT_HOURS * 60)
    expect(cycle.cyclePct).toBeCloseTo(600 / (70 * 60), 5)
  })
})

describe('barTone', () => {
  it('maps fractions to accent / warning / danger', () => {
    expect(barTone(0.5)).toBe('accent')
    expect(barTone(0.79)).toBe('accent')
    expect(barTone(0.8)).toBe('warning')
    expect(barTone(0.99)).toBe('warning')
    expect(barTone(1.0)).toBe('danger')
    expect(barTone(1.5)).toBe('danger')
  })
})
