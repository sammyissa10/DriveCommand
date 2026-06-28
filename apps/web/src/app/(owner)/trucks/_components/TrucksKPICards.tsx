'use client';

import { Truck, CheckCircle, AlertTriangle, Wrench } from 'lucide-react';
import { KPICard, KPICardGrid } from '@/components/design-system';

/**
 * TrucksKPICards — KPI cards for the Trucks overview.
 *
 * Shows: Total Fleet, Active & Compliant, Expiring Soon, Needs Action
 * No fake trends — only shows data we can actually back.
 */

export interface TruckKPIData {
  total: number;
  activeCompliant: number;
  expiringSoon: number;
  needsAction: number;
}

interface TrucksKPICardsProps {
  data: TruckKPIData;
  loading?: boolean;
}

export function TrucksKPICards({ data, loading = false }: TrucksKPICardsProps) {
  return (
    <KPICardGrid>
      <KPICard
        label="Total Fleet"
        value={data.total}
        icon={Truck}
        loading={loading}
      />
      <KPICard
        label="Active & Compliant"
        value={data.activeCompliant}
        icon={CheckCircle}
        loading={loading}
      />
      <KPICard
        label="Expiring Soon"
        value={data.expiringSoon}
        icon={AlertTriangle}
        loading={loading}
      />
      <KPICard
        label="Needs Action"
        value={data.needsAction}
        icon={Wrench}
        loading={loading}
      />
    </KPICardGrid>
  );
}
