import { FileText, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { KPICard, KPICardGrid } from '@/components/design-system';

export interface ContractKPIData {
  total: number;
  active: number;
  expiring: number;
  expired: number;
}

interface ContractsKPICardsProps {
  data: ContractKPIData;
}

export function ContractsKPICards({ data }: ContractsKPICardsProps) {
  return (
    <KPICardGrid>
      <KPICard
        label="Total Contracts"
        value={data.total}
        icon={FileText}
      />
      <KPICard
        label="Active"
        value={data.active}
        icon={CheckCircle}
      />
      <KPICard
        label="Expiring Soon"
        value={data.expiring}
        icon={Clock}
      />
      <KPICard
        label="Expired"
        value={data.expired}
        icon={AlertTriangle}
      />
    </KPICardGrid>
  );
}
