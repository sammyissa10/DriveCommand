/**
 * KpiCard — Server-safe component (no client hooks).
 * Renders a big number KPI with trend delta vs prior period.
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';

interface KpiCardProps {
  label: string;
  value: string | number;
  deltaPct: number | null;
  isMoney?: boolean;
  unit?: string;
}

function formatValue(value: string | number, isMoney: boolean): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isMoney) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
  }
  return num.toLocaleString('en-US');
}

export function KpiCard({ label, value, deltaPct, isMoney = false, unit }: KpiCardProps) {
  const isPositive = deltaPct !== null && deltaPct > 0;
  const isNegative = deltaPct !== null && deltaPct < 0;

  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight">
          {formatValue(value, isMoney)}
          {unit && <span className="ml-1 text-base font-normal text-muted-foreground">{unit}</span>}
        </div>
        <div className="mt-1 flex items-center gap-1 text-xs">
          {deltaPct === null ? (
            <span className="flex items-center gap-0.5 text-muted-foreground">
              <Minus className="h-3 w-3" />
              — vs prior period
            </span>
          ) : isPositive ? (
            <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
              <ArrowUp className="h-3 w-3" />
              {Math.abs(deltaPct).toFixed(1)}% vs prior period
            </span>
          ) : isNegative ? (
            <span className="flex items-center gap-0.5 text-red-600 dark:text-red-400">
              <ArrowDown className="h-3 w-3" />
              {Math.abs(deltaPct).toFixed(1)}% vs prior period
            </span>
          ) : (
            <span className="flex items-center gap-0.5 text-muted-foreground">
              <Minus className="h-3 w-3" />
              0% vs prior period
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
