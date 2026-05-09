'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

const TIME_RANGES = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
] as const;

export function AnalyticsDashboard() {
  const trpc = useTRPC();
  const [days, setDays] = useState<number>(30);
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string | null>(null);

  const { data: stats, isLoading: statsLoading } = useQuery(
    trpc.workflows.analytics.getPlaybookStats.queryOptions({ days }),
  );
  const { data: avgTimes, isLoading: avgLoading } = useQuery(
    trpc.workflows.analytics.getAvgCompletionTime.queryOptions({ days }),
  );

  const playbookOptions = stats ?? [];
  const effectivePlaybookId = selectedPlaybookId ?? playbookOptions[0]?.playbookId ?? null;

  const { data: dropOff, isLoading: dropOffLoading } = useQuery({
    ...trpc.workflows.analytics.getStepDropOff.queryOptions({
      playbookId: effectivePlaybookId ?? '',
      days,
    }),
    enabled: !!effectivePlaybookId,
  });

  return (
    <div className="space-y-6">
      {/* Time range selector */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">Time range:</span>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_RANGES.map((r) => (
              <SelectItem key={r.value} value={String(r.value)}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Completion Rate Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Completion Rate by Playbook</CardTitle>
          <CardDescription>% of instances completed in the selected period.</CardDescription>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <Skeleton className="h-[240px] w-full" />
          ) : !stats?.length ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No data for this period.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={stats} margin={{ top: 5, right: 20, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="playbookName"
                  tick={{ fontSize: 11 }}
                  angle={-35}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis tickFormatter={(v: number) => `${v}%`} domain={[0, 100]} />
                <Tooltip formatter={(v: number) => [`${v}%`, 'Completion rate']} />
                <Bar
                  dataKey="completionRate"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                  name="Completion %"
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Average Completion Time */}
      <Card>
        <CardHeader>
          <CardTitle>Average Completion Time</CardTitle>
          <CardDescription>
            Mean hours from start to complete per playbook (COMPLETED instances only).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {avgLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : !avgTimes?.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No completed instances in this period.
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {avgTimes.map((t) => {
                const pb = stats?.find((s) => s.playbookId === t.playbookId);
                return (
                  <div
                    key={t.playbookId}
                    className="rounded-lg border border-border p-3 space-y-1"
                  >
                    <p className="text-xs text-muted-foreground truncate">
                      {pb?.playbookName ?? t.playbookId.slice(0, 8)}
                    </p>
                    <p className="text-xl font-bold">{t.avgHours}h</p>
                    <p className="text-xs text-muted-foreground">{t.sampleCount} completed</p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step Drop-Off Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Step Drop-Off</CardTitle>
              <CardDescription>
                Incomplete step counts per step (sorted by highest drop-off).
              </CardDescription>
            </div>
            {playbookOptions.length > 0 && (
              <Select
                value={effectivePlaybookId ?? ''}
                onValueChange={(v) => setSelectedPlaybookId(v)}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select playbook" />
                </SelectTrigger>
                <SelectContent>
                  {playbookOptions.map((p) => (
                    <SelectItem key={p.playbookId} value={p.playbookId}>
                      {p.playbookName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!effectivePlaybookId ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Select a playbook above to see step drop-off.
            </p>
          ) : dropOffLoading ? (
            <Skeleton className="h-[240px] w-full" />
          ) : !dropOff?.length ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No step data for this period.
            </p>
          ) : (
            <ResponsiveContainer
              width="100%"
              height={Math.max(240, dropOff.length * 36)}
            >
              <BarChart
                data={dropOff}
                layout="vertical"
                margin={{ top: 5, right: 20, left: 120, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" />
                <YAxis
                  type="category"
                  dataKey="stepName"
                  tick={{ fontSize: 11 }}
                  width={120}
                />
                <Tooltip />
                <Bar
                  dataKey="NOT_STARTED"
                  fill="hsl(var(--muted-foreground))"
                  name="Not started"
                  stackId="a"
                />
                <Bar
                  dataKey="SKIPPED"
                  fill="hsl(var(--secondary))"
                  name="Skipped"
                  stackId="a"
                />
                <Bar
                  dataKey="FAILED"
                  fill="hsl(var(--destructive))"
                  name="Failed"
                  stackId="a"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
