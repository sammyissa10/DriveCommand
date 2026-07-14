import { describe, it, expect } from 'vitest'
import {
  computeHOSClocks,
  DUTY_WINDOW_HOURS,
  DRIVE_LIMIT_HOURS,
  type RawHOSEntry,
} from '../compute-hos-clocks'

// A fixed "now" mid-day UTC so today's boundaries are unambiguous.
const NOW = new Date('2026-07-14T18:00:00.000Z')

/** Minutes ago → Date. */
function ago(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60_000)
}

describe('computeHOSClocks', () => {
  it('returns full clocks for a driver with no entries today', () => {
    const c = computeHOSClocks([], NOW)
    expect(c.currentStatus).toBe('OFF_DUTY')
    expect(c.hasDutyToday).toBe(false)
    expect(c.isLow).toBe(false)
    expect(c.driveRemainingMinutes).toBe(DRIVE_LIMIT_HOURS * 60) // 660
    expect(c.dutyWindowRemainingMinutes).toBe(DUTY_WINDOW_HOURS * 60) // 840
    // Binding constraint is the smaller of the two.
    expect(c.remainingMinutes).toBe(DRIVE_LIMIT_HOURS * 60)
  })

  it('does not start the clocks for OFF_DUTY / SLEEPER_BERTH only', () => {
    const entries: RawHOSEntry[] = [
      { status: 'SLEEPER_BERTH', startTime: ago(300), endTime: ago(60) },
      { status: 'OFF_DUTY', startTime: ago(60), endTime: null },
    ]
    const c = computeHOSClocks(entries, NOW)
    expect(c.currentStatus).toBe('OFF_DUTY')
    expect(c.hasDutyToday).toBe(false)
    expect(c.onDutyMinutesToday).toBe(0)
    expect(c.drivingMinutesToday).toBe(0)
    expect(c.dutyWindowRemainingMinutes).toBe(DUTY_WINDOW_HOURS * 60)
  })

  it('accrues driving + on-duty minutes and counts driving as on duty', () => {
    // 3h on duty (pre-trip), then 4h driving, still driving.
    const entries: RawHOSEntry[] = [
      { status: 'ON_DUTY', startTime: ago(7 * 60), endTime: ago(4 * 60) }, // 180 min
      { status: 'DRIVING', startTime: ago(4 * 60), endTime: null }, // 240 min, open
    ]
    const c = computeHOSClocks(entries, NOW)
    expect(c.currentStatus).toBe('DRIVING')
    expect(c.hasDutyToday).toBe(true)
    expect(c.drivingMinutesToday).toBe(240)
    expect(c.onDutyMinutesToday).toBe(420) // 180 + 240
    // Window opened 7h ago → 14 - 7 = 7h left.
    expect(c.dutyWindowRemainingMinutes).toBe(7 * 60)
    // 11h drive limit − 4h driven = 7h left.
    expect(c.driveRemainingMinutes).toBe(7 * 60)
    expect(c.remainingMinutes).toBe(7 * 60)
    expect(c.isLow).toBe(false)
  })

  it('flags low hours when the 14-hour window is nearly closed', () => {
    // Window opened 13h ago → only 1h left, well under the 2h threshold.
    const entries: RawHOSEntry[] = [
      { status: 'ON_DUTY', startTime: ago(13 * 60), endTime: null },
    ]
    const c = computeHOSClocks(entries, NOW)
    expect(c.dutyWindowRemainingMinutes).toBe(60)
    expect(c.remainingMinutes).toBe(60) // window binds before drive limit
    expect(c.isLow).toBe(true)
  })

  it('flags low hours when the 11-hour driving limit is nearly hit', () => {
    // 10h driving in a window opened 10h ago → 1h drive left, 4h window left.
    const entries: RawHOSEntry[] = [
      { status: 'DRIVING', startTime: ago(10 * 60), endTime: null },
    ]
    const c = computeHOSClocks(entries, NOW)
    expect(c.driveRemainingMinutes).toBe(60)
    expect(c.dutyWindowRemainingMinutes).toBe(4 * 60)
    expect(c.remainingMinutes).toBe(60) // drive limit binds first
    expect(c.isLow).toBe(true)
  })

  it('clamps remaining time to zero, never negative', () => {
    const entries: RawHOSEntry[] = [
      { status: 'DRIVING', startTime: ago(15 * 60), endTime: null }, // over both limits
    ]
    const c = computeHOSClocks(entries, NOW)
    expect(c.driveRemainingMinutes).toBe(0)
    expect(c.dutyWindowRemainingMinutes).toBe(0)
    expect(c.remainingMinutes).toBe(0)
    expect(c.isLow).toBe(true)
  })

  it('uses an open overnight entry for status but not for today totals', () => {
    // Entry started 20h ago (yesterday) and is still open.
    const entries: RawHOSEntry[] = [
      { status: 'ON_DUTY', startTime: ago(20 * 60), endTime: null },
    ]
    const c = computeHOSClocks(entries, NOW)
    expect(c.currentStatus).toBe('ON_DUTY')
    // Started before today → excluded from today's minute + window math.
    expect(c.onDutyMinutesToday).toBe(0)
    expect(c.hasDutyToday).toBe(false)
    expect(c.dutyWindowRemainingMinutes).toBe(DUTY_WINDOW_HOURS * 60)
  })
})
