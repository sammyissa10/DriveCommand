'use client';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export type EntityTypeFilter = 'ALL' | 'DRIVER' | 'VEHICLE' | 'PARTNER' | 'DISPATCH' | 'OTHER';

const TABS: Array<{ value: EntityTypeFilter; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'DRIVER', label: 'Drivers' },
  { value: 'VEHICLE', label: 'Vehicles' },
  { value: 'PARTNER', label: 'Partners' },
  { value: 'DISPATCH', label: 'Dispatches' },
  { value: 'OTHER', label: 'Other' },
];

export function EntityTypeFilterTabs({
  value,
  onChange,
}: { value: EntityTypeFilter; onChange: (v: EntityTypeFilter) => void }) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as EntityTypeFilter)}>
      <TabsList>
        {TABS.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
