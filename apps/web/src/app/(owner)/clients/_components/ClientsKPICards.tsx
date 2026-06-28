'use client';

import { Building2, CheckCircle, Pause, DollarSign } from 'lucide-react';
import { KPICard, KPICardGrid } from '@/components/design-system';

/**
 * ClientsKPICards — KPI cards for the Clients overview.
 *
 * Shows: Total Clients, Active, On Hold, Revenue (MTD)
 * No fake trends — only shows data we can actually back.
 */

export interface ClientKPIData {
  total: number;
  active: number;
  onHold: number;
  revenueMTD: number | null;
}

interface ClientsKPICardsProps {
  data: ClientKPIData;
  loading?: boolean;
}

export function ClientsKPICards({ data, loading = false }: ClientsKPICardsProps) {
  return (
    <KPICardGrid>
      <KPICard
        label="Total Clients"
        value={data.total}
        icon={Building2}
        loading={loading}
      />
      <KPICard
        label="Active"
        value={data.active}
        icon={CheckCircle}
        loading={loading}
      />
      <KPICard
        label="On Hold"
        value={data.onHold}
        icon={Pause}
        loading={loading}
      />
      <KPICard
        label="Revenue (MTD)"
        value={
          data.revenueMTD !== null
            ? `$${data.revenueMTD.toLocaleString()}`
            : '—'
        }
        icon={DollarSign}
        loading={loading}
      />
    </KPICardGrid>
  );
}
