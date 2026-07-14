'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import {
  computeDayHOS,
  computeCycleHOS,
  barTone,
  CYCLE_LIMIT_HOURS,
} from '@/lib/hos/driver-hos';
import type { RawHOSEntry, HOSDutyStatusLike } from '@/lib/hos/compute-hos-clocks';

/** Serializable HOS entry passed from the server component. */
export interface HOSEntryDTO {
  status: string;
  startTime: string; // ISO
  endTime: string | null; // ISO or null (open)
}

// ---------------------------------------------------------------------------
// Duty status vocabulary
// ---------------------------------------------------------------------------

const DUTY: Record<HOSDutyStatusLike, { label: string; short: string; dot: string; text: string }> = {
  DRIVING: { label: 'Driving', short: 'D', dot: 'bg-ds-accent', text: 'text-ds-accent' },
  ON_DUTY: { label: 'On Duty', short: 'ON', dot: 'bg-ds-success', text: 'text-ds-success' },
  SLEEPER_BERTH: { label: 'Sleeper', short: 'SB', dot: 'bg-ds-txt2', text: 'text-ds-txt2' },
  OFF_DUTY: { label: 'Off Duty', short: 'OFF', dot: 'bg-ds-txt3', text: 'text-ds-txt3' },
};
const DUTY_ORDER: HOSDutyStatusLike[] = ['OFF_DUTY', 'SLEEPER_BERTH', 'DRIVING', 'ON_DUTY'];

// ---------------------------------------------------------------------------
// Timezone-aware date plumbing (not HOS math — that lives in the shared util)
// ---------------------------------------------------------------------------

/** Minutes `tz` is ahead of UTC at instant `ms`. */
function tzOffsetMinutes(tz: string, ms: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms));
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  const asUTC = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour === 24 ? 0 : +m.hour, +m.minute, +m.second);
  return (asUTC - ms) / 60_000;
}

/** The Y/M/D of `ms` as seen in `tz`. */
function tzYMD(tz: string, ms: number): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(ms));
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return { y: +map.year, m: +map.month, d: +map.day };
}

/** UTC ms of local midnight for calendar date (y,m,d) in `tz`. */
function zonedMidnightMs(tz: string, y: number, m: number, d: number): number {
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  // Adjust by the tz offset at the guess (one pass covers all but rare DST-midnight edges).
  return guess - tzOffsetMinutes(tz, guess) * 60_000;
}

/** Day bounds + label for `offset` days before today, in `tz`. */
function dayWindow(tz: string, nowMs: number, offset: number) {
  const today = tzYMD(tz, nowMs);
  // Anchor to today's local midnight, then step back `offset` days.
  const todayStart = zonedMidnightMs(tz, today.y, today.m, today.d);
  const targetGuess = todayStart - offset * 86_400_000;
  const target = tzYMD(tz, targetGuess + 12 * 3_600_000); // noon-safe to dodge DST
  const startMs = zonedMidnightMs(tz, target.y, target.m, target.d);
  const endMs = zonedMidnightMs(tz, target.y, target.m, target.d + 1) - 1;
  return { startMs, endMs };
}

function fmtTime(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
}
function dayLabel(offset: number, startMs: number, tz: string): string {
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Yesterday';
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }).format(
    new Date(startMs + 12 * 3_600_000),
  );
}

/** "6h 12m" / "45m" / "0m". */
function fmtDur(mins: number): string {
  const m = Math.max(0, Math.round(mins));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h <= 0) return `${r}m`;
  if (r === 0) return `${h}h`;
  return `${h}h ${r}m`;
}

const BAR_FILL: Record<'accent' | 'warning' | 'danger', string> = {
  accent: 'bg-ds-accent',
  warning: 'bg-ds-warning',
  danger: 'bg-ds-danger',
};

// ---------------------------------------------------------------------------
// Hours tab
// ---------------------------------------------------------------------------

export function DriverHoursTab({
  entries,
  timezone,
  nowMs,
}: {
  entries: HOSEntryDTO[];
  timezone: string;
  /** Server "now" so SSR + first client render agree (Date.now() drift avoided). */
  nowMs: number;
}) {
  const [offset, setOffset] = useState(0); // 0 = today, 1 = yesterday, …

  // Parse once to the shape the shared util expects.
  const raw: RawHOSEntry[] = useMemo(
    () =>
      entries.map((e) => ({
        status: e.status,
        startTime: new Date(e.startTime),
        endTime: e.endTime ? new Date(e.endTime) : null,
      })),
    [entries],
  );

  const { startMs, endMs } = useMemo(() => dayWindow(timezone, nowMs, offset), [timezone, nowMs, offset]);
  const day = useMemo(() => computeDayHOS(raw, startMs, endMs, nowMs), [raw, startMs, endMs, nowMs]);
  const cycle = useMemo(() => computeCycleHOS(raw, nowMs), [raw, nowMs]);

  const driveTone = barTone(day.drivePct);
  const cycleTone = barTone(cycle.cyclePct);
  const label = dayLabel(offset, startMs, timezone);
  const overBy = day.driveMinutes - day.driveLimitMinutes;

  return (
    <div className="space-y-3">
      {/* Day selector */}
      <div className="flex items-center justify-between px-1">
        <button
          type="button"
          onClick={() => setOffset((o) => o + 1)}
          aria-label="Previous day"
          className="flex h-11 w-11 items-center justify-center rounded-full text-ds-accent transition active:opacity-75"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <span className="text-[16px] font-semibold text-ds-txt">{label}</span>
        <button
          type="button"
          onClick={() => setOffset((o) => Math.max(0, o - 1))}
          disabled={offset === 0}
          aria-label="Next day"
          className="flex h-11 w-11 items-center justify-center rounded-full text-ds-accent transition active:opacity-75 disabled:opacity-30"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>

      {/* DRIVE TIME card */}
      <div className="rounded-[20px] bg-ds-card p-4">
        <div className="text-[12px] font-semibold uppercase tracking-[0.8px] text-ds-txt2">
          Drive time · {label}
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-[34px] font-bold leading-none text-ds-txt">{fmtDur(day.driveMinutes)}</span>
          <span className="text-[15px] text-ds-txt3">of 11h</span>
        </div>
        <div className="mt-1 text-[15px] font-semibold">
          {day.violation ? (
            <span className="text-ds-danger">Over by {fmtDur(overBy)}</span>
          ) : (
            <span className="text-ds-accent">{fmtDur(day.driveRemainingMinutes)} left</span>
          )}
        </div>

        {/* Drive progress bar — warning at 80%, danger at 100% */}
        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-ds-elevated">
          <div
            className={`h-full rounded-full ${BAR_FILL[driveTone]}`}
            style={{ width: `${Math.min(100, day.drivePct * 100)}%` }}
          />
        </div>

        {day.violation ? (
          <div className="mt-3 flex items-center gap-2 rounded-[12px] bg-ds-danger/[0.14] px-3 py-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-ds-danger" />
            <span className="text-[13px] font-semibold text-ds-danger">
              11-hour driving limit exceeded
            </span>
          </div>
        ) : null}

        {/* Cycle — thin second bar (on-duty over 8 days vs 70h) */}
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[13px] text-ds-txt2">Cycle · 8-day on-duty</span>
            <span className="text-[13px] text-ds-txt3">
              {fmtDur(cycle.cycleMinutes)} of {CYCLE_LIMIT_HOURS}h
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-ds-elevated">
            <div
              className={`h-full rounded-full ${BAR_FILL[cycleTone]}`}
              style={{ width: `${Math.min(100, cycle.cyclePct * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Duty status — read-only SegmentedControl (the driver app writes it) */}
      <div className="rounded-[20px] bg-ds-card p-4">
        <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.8px] text-ds-txt2">
          Duty status
        </div>
        <div className="flex rounded-[11px] bg-ds-bg p-1" aria-readonly>
          {DUTY_ORDER.map((s) => {
            const active = s === day.lastStatus;
            return (
              <div
                key={s}
                className={`flex h-9 flex-1 items-center justify-center rounded-[9px] text-[13px] ${
                  active ? `bg-ds-elevated font-semibold ${DUTY[s].text}` : 'text-ds-txt3'
                }`}
              >
                {DUTY[s].label}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[13px] text-ds-txt3">Set in the driver app.</p>
      </div>

      {/* Timeline */}
      <div className="rounded-[20px] bg-ds-card p-4">
        <div className="mb-3 text-[12px] font-semibold uppercase tracking-[0.8px] text-ds-txt2">
          Duty log
        </div>
        {!day.hasEntries ? (
          <div className="py-6 text-center">
            <p className="text-[15px] text-ds-txt2">No duty entries this day</p>
            <p className="mt-1 text-[13px] text-ds-txt3">
              Last known status: {DUTY[day.lastStatus].label}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {day.timeline.map((seg, i) => {
              const meta = DUTY[seg.status];
              return (
                <div key={i} className="flex items-start gap-3">
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className={`text-[15px] font-medium ${meta.text}`}>{meta.label}</div>
                    <div className="text-[13px] text-ds-txt3">{fmtDur(seg.durationMinutes)}</div>
                  </div>
                  <div className="shrink-0 text-right text-[13px] text-ds-txt2">
                    {fmtTime(seg.startMs, timezone)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
