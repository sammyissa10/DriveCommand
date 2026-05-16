'use client';

/**
 * BigNumberHero — Reusable hero section: big number + delta arrow + optional sparkline.
 */

import React from 'react';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

interface BigNumberHeroProps {
  value: string;                               // pre-formatted value ('$12,345.67' or '127')
  subtitle: string;
  deltaPct: number | null;
  deltaInvertedForSpend?: boolean;             // true => up is bad (red); false => up is good (green)
  sparklineData?: Array<{ x: string; y: number }>;
}

export function BigNumberHero({
  value,
  subtitle,
  deltaPct,
  deltaInvertedForSpend = false,
  sparklineData,
}: BigNumberHeroProps) {
  const isUp = deltaPct !== null && deltaPct > 0;
  const isDown = deltaPct !== null && deltaPct < 0;

  // Color logic:
  // Normal (not inverted): up=green, down=red
  // Inverted (spend): up=red, down=green
  let deltaColor = 'text-muted-foreground';
  let DeltaIcon: React.ElementType = Minus;

  if (isUp) {
    DeltaIcon = ArrowUp;
    deltaColor = deltaInvertedForSpend ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400';
  } else if (isDown) {
    DeltaIcon = ArrowDown;
    deltaColor = deltaInvertedForSpend ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';
  }

  return (
    <div className="bg-card border rounded-xl p-6 flex items-start gap-6">
      {/* Left: number + subtitle + delta */}
      <div className="flex-1 min-w-0">
        <div className="text-4xl font-bold tracking-tight text-foreground">{value}</div>
        <div className="text-sm text-muted-foreground mt-1">{subtitle}</div>
        <div className={`flex items-center gap-1 mt-2 text-sm font-medium ${deltaColor}`}>
          <DeltaIcon className="h-4 w-4 flex-shrink-0" />
          {deltaPct !== null ? (
            <span>{Math.abs(deltaPct).toFixed(1)}% vs prior period</span>
          ) : (
            <span className="text-muted-foreground font-normal">— vs prior period</span>
          )}
        </div>
      </div>

      {/* Right: sparkline */}
      {sparklineData && sparklineData.length > 0 && (
        <div className="w-32 h-10 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparklineData.map((d) => ({ x: d.x, y: d.y }))}>
              <Line
                type="monotone"
                dataKey="y"
                stroke="currentColor"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
