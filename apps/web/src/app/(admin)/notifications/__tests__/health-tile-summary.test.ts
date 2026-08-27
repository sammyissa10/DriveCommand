/**
 * health-tile-summary.test.ts — quick-556.
 *
 * ─── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * Eight notification sends failed between 2026-05-17 and 2026-08-27 — driver
 * invitations that never arrived, manager invitations that never arrived, and an
 * in-app alert about a truck blocked for a failed brake check. Nobody knew for
 * three months.
 *
 * Not for want of a surface: the Send Log could already filter to FAILED and
 * expand any failed row to its reason, on both the sysadmin page and the owner's
 * own settings page. Two things in the health tile hid the failures anyway:
 *
 *   1. a 24-hour window, so a failure vanished at local midnight; and
 *   2. a `failureRate > 5%` gate on the warning banner.
 *
 * The second is the one worth a permanent test. The system has sent 357
 * notifications and failed 8 — **2.24%**. The gate suppressed every failure this
 * system has ever had. A rate threshold is noise-suppression designed for high
 * volume; at this volume it is a mute button.
 *
 * ─── HOW THIS FAILS ─────────────────────────────────────────────────────────
 *
 * Reintroduce any threshold — `rate > 5`, `failed24 > 0` instead of all-time, a
 * 30-day bound on the banner — and "the real production numbers raise the
 * banner" goes red, because 2.24% and a zero 24-hour count are exactly what
 * those variants suppress. The source guard below fails on the literal comparison
 * even if someone writes it a different way round.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildHealthSummary,
  FAILED_SEND_LOG_HREF,
} from '@/app/(admin)/notifications/health-tile';
import type { SendLogStats } from '@/app/(admin)/actions/notifications';

function stats(overrides: Partial<SendLogStats> = {}): SendLogStats {
  return {
    sentToday: 0,
    failedToday: 0,
    sent30d: 0,
    failureRate: 0,
    failed30d: 0,
    failedAllTime: 0,
    topFailingTrigger: null,
    topFailingTriggerAllTime: null,
    ...overrides,
  };
}

describe('the failure banner is not gated on a rate', () => {
  it('the real production numbers raise the banner', () => {
    // Read off production on 2026-08-27: 357 sends, 8 failed (2.24%). Seven of
    // the eight are older than 30 days, so on an ORDINARY day — which is what
    // this fixture is — today's counters are clean and eight people are still
    // waiting on something that never arrived. The old logic showed nothing at
    // all on such a day, because `failedToday` was 0 and the rate was 0%.
    const summary = buildHealthSummary(
      stats({ sentToday: 12, failedToday: 0, sent30d: 40, failed30d: 0, failedAllTime: 8 })
    );

    expect(summary.failedAllTime).toBe(8);
    expect(summary.rate).toBe(0);
    expect(
      summary.showBanner,
      'Eight sends have failed and today happens to be clean. The old logic ' +
        'showed nothing: `failedToday` was 0, so the rate was 0% and the ' +
        '`rate > 5` gate never fired. Any failure must raise the banner.'
    ).toBe(true);
  });

  it('a single old failure still raises it long after its window closed', () => {
    // The manager.invited failures are from 2026-05-17. Nothing in the last 24h
    // or 30 days, and somebody still never received their invitation.
    const summary = buildHealthSummary(stats({ failedToday: 0, failed30d: 0, failedAllTime: 2 }));
    expect(summary.showBanner).toBe(true);
    expect(summary.failed24).toBe(0);
    expect(summary.failed30).toBe(0);
  });

  it('one failure in one send raises it — a 100% rate is not special', () => {
    const summary = buildHealthSummary(stats({ sentToday: 0, failedToday: 1, failedAllTime: 1 }));
    expect(summary.showBanner).toBe(true);
    expect(summary.rate).toBe(100);
  });

  it('a clean log raises nothing', () => {
    // Guards the obvious regression: the suite must not go green by always
    // showing the banner.
    const summary = buildHealthSummary(stats({ sentToday: 500, failedAllTime: 0 }));
    expect(summary.showBanner).toBe(false);
    expect(summary.rate).toBe(0);
  });

  it('the rate is reported but never decides anything', () => {
    // A high rate with nothing actually failed cannot happen, but a LOW rate
    // with real failures is the production case, and it must still show.
    const summary = buildHealthSummary(
      stats({ sentToday: 1000, failedToday: 1, failedAllTime: 1 })
    );
    expect(summary.rate).toBeLessThan(1);
    expect(summary.showBanner).toBe(true);
  });

  it('falls back to the all-time top trigger when nothing failed in 24h', () => {
    const summary = buildHealthSummary(
      stats({ failedAllTime: 8, topFailingTrigger: null, topFailingTriggerAllTime: 'driver.invited' })
    );
    expect(summary.topTrigger).toBe('driver.invited');
  });

  it('the banner points at the failures, not at the log in general', () => {
    // "Something failed" is only useful next to "here is what, to whom, when and
    // why" — which the expandable rows provide and which nobody had a path to.
    expect(FAILED_SEND_LOG_HREF).toContain('tab=send-log');
    expect(FAILED_SEND_LOG_HREF).toContain('status=FAILED');
  });
});

describe('the rate gate cannot come back (source guard)', () => {
  const FILE = path.resolve(__dirname, '..', 'health-tile.tsx');

  /** Repo is core.autocrlf=true — normalise or this reads differently on Windows. */
  function readTile(): string {
    return fs.readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n');
  }

  it('read the real component (integrity floor)', () => {
    // A bad path would return '' and satisfy the assertion below vacuously.
    const src = readTile();
    expect(src.length).toBeGreaterThan(1500);
    expect(src).toContain('export function buildHealthSummary');
  });

  it('showBanner is decided by the failure count and nothing else', () => {
    // An earlier version of this guard hunted for `rate > 5` by name and MISSED
    // the mutation that reinstated the gate, because the offending expression
    // inlined the arithmetic and never mentioned `rate`. Pattern-matching the
    // shapes a threshold might take is unbounded; pinning the one line that
    // makes the decision is not.
    const src = readTile();
    // `showBanner:` appears twice — once in the HealthSummary type and once in
    // the returned object. The type declaration is not the decision, and taking
    // the first match silently pinned it instead, which is how this guard first
    // went red on correct source.
    const line = src
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.startsWith('showBanner:') && !/boolean\s*;?$/.test(l));

    expect(line, 'no `showBanner:` assignment found in health-tile.tsx').toBeDefined();

    expect(
      line!.trim(),
      'The failure banner is gated on something other than the raw failure ' +
        'count. 8 failures in 357 sends is 2.24% — a threshold of any size ' +
        'suppresses every failure this system has ever had, and a window lets ' +
        'an unresolved one expire out of view. Show it for any failure and ' +
        'leave the rate as a displayed figure.'
    ).toBe('showBanner: failedAllTime > 0,');
  });
});
