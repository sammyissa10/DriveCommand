'use client';

/**
 * FilterBar — Client component.
 * Filters: driver multi-select (from /api/driver-pay/drivers), employment type, status.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { X, ChevronDown } from 'lucide-react';

interface DriverOption {
  id: string;
  firstName: string;
  lastName: string;
}

interface FilterBarProps {
  currentDriverIds: string[];
  currentEmploymentType: string;
  currentStatus: string;
}

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'FINALIZED', label: 'Finalized' },
  { value: 'PAID', label: 'Paid' },
  { value: 'VOIDED', label: 'Voided' },
];

const EMPLOYMENT_OPTIONS = [
  { value: 'ALL', label: 'All Types' },
  { value: 'EMPLOYEE', label: 'Employee' },
  { value: 'CONTRACTOR', label: 'Contractor' },
];

export function FilterBar({ currentDriverIds, currentEmploymentType, currentStatus }: FilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [selectedDriverIds, setSelectedDriverIds] = useState<string[]>(currentDriverIds);
  const [driverPopoverOpen, setDriverPopoverOpen] = useState(false);

  useEffect(() => {
    fetch('/api/driver-pay/drivers?pageSize=100')
      .then((r) => r.json())
      .then((data: { drivers?: DriverOption[] }) => {
        if (Array.isArray(data.drivers)) setDrivers(data.drivers);
      })
      .catch(() => {
        // silently ignore — filter degrades gracefully
      });
  }, []);

  const pushParams = useCallback(
    (updates: Record<string, string | string[] | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, val] of Object.entries(updates)) {
        if (!val || (Array.isArray(val) && val.length === 0)) {
          params.delete(key);
        } else if (Array.isArray(val)) {
          params.set(key, val.join(','));
        } else {
          params.set(key, val);
        }
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, searchParams, pathname],
  );

  function toggleDriver(id: string) {
    setSelectedDriverIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id],
    );
  }

  function applyDriverFilter() {
    pushParams({ driverIds: selectedDriverIds });
    setDriverPopoverOpen(false);
  }

  const isFiltered =
    currentDriverIds.length > 0 ||
    currentEmploymentType !== 'ALL' ||
    (currentStatus !== 'ALL' && currentStatus !== '');

  function resetFilters() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('driverIds');
    params.delete('employmentType');
    params.delete('status');
    setSelectedDriverIds([]);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Driver multi-select */}
      <Popover open={driverPopoverOpen} onOpenChange={setDriverPopoverOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1">
            {currentDriverIds.length > 0
              ? `${currentDriverIds.length} Driver${currentDriverIds.length > 1 ? 's' : ''}`
              : 'All Drivers'}
            <ChevronDown className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="start">
          <div className="max-h-48 overflow-y-auto space-y-1">
            {drivers.length === 0 && (
              <p className="text-xs text-muted-foreground px-2 py-1">Loading drivers…</p>
            )}
            {drivers.map((d) => (
              <label
                key={d.id}
                className="flex items-center gap-2 rounded px-2 py-1 text-sm cursor-pointer hover:bg-muted"
              >
                <input
                  type="checkbox"
                  checked={selectedDriverIds.includes(d.id)}
                  onChange={() => toggleDriver(d.id)}
                  className="h-3.5 w-3.5"
                />
                {d.firstName} {d.lastName}
              </label>
            ))}
          </div>
          <div className="mt-2 flex justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedDriverIds([]);
              }}
            >
              Clear
            </Button>
            <Button size="sm" onClick={applyDriverFilter}>
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Employment type */}
      <Select
        value={currentEmploymentType || 'ALL'}
        onValueChange={(val) => pushParams({ employmentType: val === 'ALL' ? undefined : val })}
      >
        <SelectTrigger className="w-36 h-8 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {EMPLOYMENT_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Status */}
      <Select
        value={currentStatus || 'ALL'}
        onValueChange={(val) => pushParams({ status: val === 'ALL' ? undefined : val })}
      >
        <SelectTrigger className="w-36 h-8 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Reset */}
      {isFiltered && (
        <Button variant="ghost" size="sm" onClick={resetFilters} className="gap-1">
          <X className="h-3 w-3" />
          Reset
        </Button>
      )}
    </div>
  );
}
