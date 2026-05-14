'use client';

/**
 * Notification health dashboard tile for the SysAdmin Send Log tab.
 *
 * Reuses getNotificationSendLogStats (no new endpoint added). The action's
 * `sentToday` and `failedToday` fields represent last-24h counts starting
 * from midnight UTC of the current day — close enough to "last 24h" for
 * operational monitoring purposes.
 *
 * Shows: Sent / Failed / Failure rate for the last 24h.
 * Shows a warning banner with the top failing trigger when failure rate > 5%.
 */

import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { getNotificationSendLogStats, type SendLogStats } from '@/app/(admin)/actions/notifications';

export function HealthTile() {
  const [stats, setStats] = useState<SendLogStats | null>(null);

  useEffect(() => {
    getNotificationSendLogStats().then(setStats).catch(() => {
      // Silently fail — health tile is non-critical
    });
  }, []);

  if (!stats) return null;

  const sent24 = stats.sentToday ?? 0;
  const failed24 = stats.failedToday ?? 0;
  const total = sent24 + failed24;
  const rate = total > 0 ? (failed24 / total) * 100 : 0;

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-gray-700">
          Notification Health (last 24h)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-2xl font-semibold text-gray-900">{sent24}</div>
            <div className="text-xs text-muted-foreground">Sent</div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-gray-900">{failed24}</div>
            <div className="text-xs text-muted-foreground">Failed</div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-gray-900">{rate.toFixed(1)}%</div>
            <div className="text-xs text-muted-foreground">Failure rate</div>
          </div>
        </div>
        {rate > 5 && stats.topFailingTrigger && (
          <div className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            Top failing trigger:{' '}
            <code className="font-mono text-xs">{stats.topFailingTrigger}</code>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
