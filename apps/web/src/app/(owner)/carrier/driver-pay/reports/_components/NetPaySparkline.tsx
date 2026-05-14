'use client';

/**
 * NetPaySparkline — Tiny recharts LineChart for per-driver net pay (last 4 settlements).
 */

import React from 'react';
import { LineChart, Line, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';

interface SparkPoint {
  periodEnd: string;
  netPay: string;
}

interface Props {
  data: SparkPoint[];
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

export function NetPaySparkline({ data }: Props) {
  const chartData = [...data]
    .reverse()
    .map((d) => ({
      label: format(parseISO(d.periodEnd), 'MMM d'),
      netPay: parseFloat(d.netPay),
    }));

  if (chartData.length === 0) {
    return (
      <div className="flex h-16 items-center justify-center text-xs text-muted-foreground">
        No settlement history
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={60}>
      <LineChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
        <Tooltip
          formatter={(value: number) => [formatCurrency(value), 'Net Pay']}
          labelFormatter={(label: string) => `Period ending ${label}`}
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            borderColor: 'hsl(var(--border))',
            borderRadius: '6px',
            fontSize: '11px',
          }}
        />
        <Line
          type="monotone"
          dataKey="netPay"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
