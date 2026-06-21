'use client';

import { Truck, CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react';
import { KPICard, KPICardGrid } from '@/components/design-system';
import type { TruckKPIData } from '../_grid/types';

/**
 * TruckKPIStrip — KPI cards for trucks overview.
 *
 * Displays: Total Fleet, Active & Compliant, Expiring Soon, Needs Action
 */

interface TruckKPIStripProps {
  data: TruckKPIData;
}

export function TruckKPIStrip({ data }: TruckKPIStripProps) {
  return (
    <KPICardGrid>
      <KPICard
        label="Total Fleet"
        value={data.totalFleet}
        icon={Truck}
      />
      <KPICard
        label="Active & Compliant"
        value={data.activeCompliant}
        icon={CheckCircle}
      />
      <KPICard
        label="Expiring Soon"
        value={data.expiringSoon}
        icon={AlertTriangle}
      />
      <KPICard
        label="Needs Action"
        value={data.needsAction}
        icon={AlertCircle}
      />
    </KPICardGrid>
  );
}
