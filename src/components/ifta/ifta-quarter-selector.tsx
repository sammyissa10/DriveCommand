'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface IFTAQuarterSelectorProps {
  currentQuarter: 1 | 2 | 3 | 4;
  currentYear: number;
}

const QUARTER_OPTIONS: { value: 1 | 2 | 3 | 4; label: string }[] = [
  { value: 1, label: 'Q1 (Jan–Mar)' },
  { value: 2, label: 'Q2 (Apr–Jun)' },
  { value: 3, label: 'Q3 (Jul–Sep)' },
  { value: 4, label: 'Q4 (Oct–Dec)' },
];

/**
 * Quarter + year selector for IFTA reporting.
 * Uses Link-based navigation to update searchParams (server-side state).
 */
export function IFTAQuarterSelector({
  currentQuarter,
  currentYear,
}: IFTAQuarterSelectorProps) {
  const now = new Date();
  const thisYear = now.getFullYear();
  const yearOptions = [thisYear, thisYear - 1, thisYear - 2];

  return (
    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
      {/* Year selector */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-sm">
        {yearOptions.map((year) => {
          const isActive = currentYear === year;
          return (
            <Link
              key={year}
              href={`/ifta?quarter=${currentQuarter}&year=${year}`}
              className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {year}
            </Link>
          );
        })}
      </div>

      {/* Quarter selector */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-sm">
        {QUARTER_OPTIONS.map((opt) => {
          const isActive = currentQuarter === opt.value;
          return (
            <Link
              key={opt.value}
              href={`/ifta?quarter=${opt.value}&year=${currentYear}`}
              className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {opt.label}
            </Link>
          );
        })}
      </div>

      {/* Current selection badge */}
      <Button variant="outline" size="sm" disabled className="opacity-60 cursor-default">
        Q{currentQuarter} {currentYear}
      </Button>
    </div>
  );
}
