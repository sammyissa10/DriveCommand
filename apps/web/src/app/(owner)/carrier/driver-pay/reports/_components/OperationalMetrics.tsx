'use client';

/**
 * OperationalMetrics — Client component.
 * Fetches /api/driver-pay/reports/operational-metrics and renders 4 metric cards.
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Metrics {
  avgDaysApprovedToPaid: number | null;
  totalDisputes: number;
  topDisputedDriver: { driverId: string; driverName: string; count: number } | null;
  garnishmentCapHitRate: number;
  carryoverQueueSize: number;
}

interface Props {
  period: string;
}

function MetricSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="h-4 w-32 rounded bg-muted animate-pulse" />
      </CardHeader>
      <CardContent>
        <div className="h-7 w-20 rounded bg-muted animate-pulse mb-1" />
        <div className="h-3 w-28 rounded bg-muted animate-pulse" />
      </CardContent>
    </Card>
  );
}

export function OperationalMetrics({ period }: Props) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/driver-pay/reports/operational-metrics?period=${period}`)
      .then((r) => r.json())
      .then((data: Metrics) => setMetrics(data))
      .catch(() => setMetrics(null))
      .finally(() => setLoading(false));
  }, [period]);

  if (loading) {
    return (
      <div>
        <h2 className="text-base font-semibold mb-3">Operational Metrics</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <MetricSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-base font-semibold mb-3">Operational Metrics</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Velocity */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Days: Approved → Paid
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {metrics?.avgDaysApprovedToPaid != null
                ? `${metrics.avgDaysApprovedToPaid} days`
                : '—'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Settlement velocity</p>
          </CardContent>
        </Card>

        {/* Disputes */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Disputes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{metrics?.totalDisputes ?? '—'}</p>
            {metrics?.topDisputedDriver ? (
              <p className="text-xs text-muted-foreground mt-1">
                Top: {metrics.topDisputedDriver.driverName} ({metrics.topDisputedDriver.count})
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">No disputed driver</p>
            )}
          </CardContent>
        </Card>

        {/* Garnishment cap hit rate */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Garnishment Cap Hit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {metrics != null
                ? `${(metrics.garnishmentCapHitRate * 100).toFixed(0)}%`
                : '—'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Of garnishment deductions</p>
          </CardContent>
        </Card>

        {/* Carryover queue */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Carryover Queue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{metrics?.carryoverQueueSize ?? '—'}</p>
            <p className="text-xs text-muted-foreground mt-1">Assignments pending review</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
