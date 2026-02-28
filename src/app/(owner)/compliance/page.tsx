import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getComplianceDashboard } from '@/app/(owner)/actions/compliance';
import { ComplianceSummaryCards } from '@/components/compliance/compliance-summary-cards';
import { ComplianceAlertsPanel } from '@/components/compliance/compliance-alerts-panel';
import { DriverComplianceTable } from '@/components/compliance/driver-compliance-table';
import { TruckComplianceTable } from '@/components/compliance/truck-compliance-table';

// Force fresh data on every load
export const fetchCache = 'force-no-store';

export default async function CompliancePage() {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  let data: Awaited<ReturnType<typeof getComplianceDashboard>> = {
    drivers: [],
    trucks: [],
    alerts: [],
    summary: {
      expiredCount: 0,
      expiringSoonCount: 0,
      criticalSafetyCount: 0,
      highSafetyCount: 0,
      totalDriversTracked: 0,
      totalTrucksTracked: 0,
    },
  };
  try {
    data = await getComplianceDashboard();
  } catch {
    // DB failure — render dashboard with zero-value defaults
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Compliance Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Monitor document expiry and safety compliance across your fleet
        </p>
      </div>

      {/* Summary cards */}
      <ComplianceSummaryCards summary={data.summary} />

      {/* Alerts panel */}
      <ComplianceAlertsPanel alerts={data.alerts} />

      {/* Driver compliance table */}
      <DriverComplianceTable drivers={data.drivers} />

      {/* Truck compliance table */}
      <TruckComplianceTable trucks={data.trucks} />
    </div>
  );
}
