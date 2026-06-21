'use client';

import { Users, CheckCircle, AlertTriangle, UserX } from 'lucide-react';
import { KPICard, KPICardGrid } from '@/components/design-system';

/**
 * DriversKPICards — KPI cards for the Drivers overview.
 *
 * Shows: Total Drivers, Active & Compliant, Expiring Soon, Needs Action
 * No fake trends — only shows data we can actually back.
 */

export interface DriverKPIData {
  total: number;
  activeCompliant: number;
  expiringSoon: number;
  needsAction: number;
}

interface DriversKPICardsProps {
  data: DriverKPIData;
  loading?: boolean;
}

export function DriversKPICards({ data, loading = false }: DriversKPICardsProps) {
  return (
    <KPICardGrid>
      <KPICard
        label="Total Drivers"
        value={data.total}
        icon={Users}
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
        icon={UserX}
        loading={loading}
      />
    </KPICardGrid>
  );
}
