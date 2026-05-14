'use client';

/**
 * PeriodSelector — Client component.
 * Allows switching between preset periods or a custom date range.
 */

import React, { useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { PeriodKey } from '@/lib/driver-pay/reporting';

const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: 'this_week', label: 'This Week' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'custom', label: 'Custom Range' },
];

interface PeriodSelectorProps {
  currentPeriod: PeriodKey;
}

export function PeriodSelector({ currentPeriod }: PeriodSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [customStart, setCustomStart] = useState(searchParams.get('customStart') ?? '');
  const [customEnd, setCustomEnd] = useState(searchParams.get('customEnd') ?? '');
  const [showCustom, setShowCustom] = useState(currentPeriod === 'custom');

  function buildUrl(period: PeriodKey, start?: string, end?: string): string {
    const params = new URLSearchParams(searchParams.toString());
    params.set('period', period);
    if (period === 'custom' && start && end) {
      params.set('customStart', start);
      params.set('customEnd', end);
    } else {
      params.delete('customStart');
      params.delete('customEnd');
    }
    return `${pathname}?${params.toString()}`;
  }

  function handlePeriodChange(val: string) {
    const period = val as PeriodKey;
    if (period === 'custom') {
      setShowCustom(true);
    } else {
      setShowCustom(false);
      router.push(buildUrl(period));
    }
  }

  function handleApplyCustom() {
    if (customStart && customEnd) {
      router.push(buildUrl('custom', customStart, customEnd));
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={currentPeriod} onValueChange={handlePeriodChange}>
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PERIOD_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {showCustom && (
        <>
          <Input
            type="date"
            className="w-36"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            aria-label="Custom start date"
          />
          <span className="text-muted-foreground text-sm">to</span>
          <Input
            type="date"
            className="w-36"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            aria-label="Custom end date"
          />
          <Button size="sm" onClick={handleApplyCustom} disabled={!customStart || !customEnd}>
            Apply
          </Button>
        </>
      )}
    </div>
  );
}
