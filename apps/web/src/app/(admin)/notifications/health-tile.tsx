'use client';

/**
 * Notification health tile for the SysAdmin Send Log tab.
 *
 * ─── WHY THIS LOOKS THE WAY IT DOES (quick-556) ─────────────────────────────
 *
 * Eight notification sends failed between 2026-05-17 and 2026-08-27 — driver
 * invitations that never arrived, manager invitations that never arrived, and
 * an in-app alert about a truck blocked for a failed brake inspection. Nobody
 * knew, for three months.
 *
 * It was not for want of a surface. The Send Log below this tile can already
 * filter to FAILED and expand any failed row to show the reason, and there is a
 * matching tenant-scoped log on the owner's own settings page. Both were
 * reachable the whole time. Two things hid the failures anyway, and both were in
 * THIS component:
 *
 *  1. **A 24-hour window.** The tile read `failedToday`, which counts from local
 *     midnight, so every failure became invisible the following day. Seven of
 *     the eight were already older than that by the time anyone looked.
 *
 *  2. **A `> 5%` rate gate on the warning banner.** The system has sent 357
 *     notifications in its lifetime and failed 8 of them — 2.24%. The gate
 *     suppressed every failure this system has ever had. A percentage threshold
 *     is noise-suppression built for high volume; at this volume it is a mute
 *     button. Worse, the arithmetic is unstable at low counts: a day with no
 *     sends gives 0% and hides a real failure, while a day with one send and one
 *     failure gives 100%.
 *
 * So: counts, not rates. A 30-day number and an all-time number that cannot
 * expire while the problem stands. Any failure at all raises the banner. And the
 * banner is a LINK into the log pre-filtered to FAILED, because "something
 * failed" is only useful next to "here is what, to whom, when, and why" — which
 * the expandable rows below have always provided and which nobody had a path to.
 *
 * The failure rate is kept as a third figure. It is genuinely useful once volume
 * grows; it just must never again be the thing that decides whether anyone is
 * told.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { getNotificationSendLogStats, type SendLogStats } from '@/app/(admin)/actions/notifications';

/** Deep link into the Send Log tab with the status filter already set. */
export const FAILED_SEND_LOG_HREF = '/notifications?tab=send-log&status=FAILED';

export type HealthSummary = {
  failed24: number;
  failed30: number;
  failedAllTime: number;
  /** 24h failure rate, displayed only. It must never gate whether anyone is told. */
  rate: number;
  showBanner: boolean;
  topTrigger: string | null;
};

/**
 * The tile's display decision, extracted so it can be asserted.
 *
 * There is no React testing library in this repo and I am not adding one, so the
 * interesting cases — above all "2.24% must still raise the banner" — are pinned
 * here rather than by rendering. Same reasoning as quick-554's menu filter: a
 * pure function over the inputs is better evidence than a browser check that
 * only ever exercises whatever happens to be in the database today.
 */
export function buildHealthSummary(stats: SendLogStats): HealthSummary {
  const failed24 = stats.failedToday ?? 0;
  const failed30 = stats.failed30d ?? 0;
  const failedAllTime = stats.failedAllTime ?? 0;
  const total24 = (stats.sentToday ?? 0) + failed24;

  return {
    failed24,
    failed30,
    failedAllTime,
    rate: total24 > 0 ? (failed24 / total24) * 100 : 0,
    // ANY failure, ever. Deliberately not a rate, not a window, not a threshold.
    showBanner: failedAllTime > 0,
    topTrigger: stats.topFailingTrigger ?? stats.topFailingTriggerAllTime ?? null,
  };
}

export function HealthTile() {
  const [stats, setStats] = useState<SendLogStats | null>(null);

  useEffect(() => {
    getNotificationSendLogStats().then(setStats).catch(() => {
      // Silently fail — health tile is non-critical
    });
  }, []);

  if (!stats) return null;

  const sent24 = stats.sentToday ?? 0;
  const {
    failed24,
    failed30,
    failedAllTime: failedAll,
    rate,
    showBanner: hasFailures,
    topTrigger,
  } = buildHealthSummary(stats);

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-gray-700">
          Notification health
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <div className="text-2xl font-semibold text-gray-900">{sent24}</div>
            <div className="text-xs text-muted-foreground">Sent (24h)</div>
          </div>
          <div>
            <div className={`text-2xl font-semibold ${failed24 > 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {failed24}
            </div>
            <div className="text-xs text-muted-foreground">Failed (24h)</div>
          </div>
          <div>
            <div className={`text-2xl font-semibold ${failed30 > 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {failed30}
            </div>
            <div className="text-xs text-muted-foreground">Failed (30d)</div>
          </div>
          <div>
            <div className={`text-2xl font-semibold ${failedAll > 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {failedAll}
            </div>
            <div className="text-xs text-muted-foreground">Failed (all time)</div>
          </div>
        </div>

        <div className="mt-2 text-xs text-muted-foreground">
          Failure rate (24h): {rate.toFixed(1)}%
        </div>

        {hasFailures && (
          <Link
            href={FAILED_SEND_LOG_HREF}
            className="mt-3 flex items-start gap-2 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 transition-colors hover:bg-red-100"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="flex-1 min-w-0">
              <span className="font-medium">
                {failedAll} notification{failedAll === 1 ? '' : 's'} failed to send.
              </span>{' '}
              {/* One sentence per count — a `{n} notification{n===1?'':'s'}` split
                  into JSX children is the whitespace trap quick-517 hit twice. */}
              {topTrigger ? (
                <>
                  Most often <code className="font-mono text-xs">{topTrigger}</code>. Open the log to
                  see who each one was meant to reach and why it failed.
                </>
              ) : (
                <>Open the log to see who each one was meant to reach and why it failed.</>
              )}
            </span>
            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
